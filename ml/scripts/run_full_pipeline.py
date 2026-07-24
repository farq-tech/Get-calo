"""End-to-end pipeline: generate → train → evaluate → export → register.

Poor models (below acceptance gates) are rejected and not registered.

CLI::

    cd /agent/ml && python -m scripts.run_full_pipeline
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

from config.settings import ROOT, settings
from dataset.generate import generate_dataset
from export.export_models import export_models
from train.evaluate import ModelRejectedError, evaluate_model
from train.train_yolo import train_yolo
from versioning.registry import register_model_version

logger = logging.getLogger(__name__)


def run_full_pipeline(
    *,
    dataset_name: str = "farq_yolo",
    skip_generate: bool = False,
    skip_train: bool = False,
    skip_export: bool = False,
    skip_register: bool = False,
    promote: bool = False,
    version: str | None = None,
    epochs: int | None = None,
    model: str | None = None,
    weights: Path | None = None,
    run_name: str | None = None,
) -> dict:
    """Execute the full ML pipeline. Raises ModelRejectedError on gate failure."""
    dataset_dir = settings.dataset_output_dir / dataset_name
    data_yaml = dataset_dir / "data.yaml"
    labels_json = dataset_dir / "labels.json"

    if not skip_generate:
        logger.info("=== Stage 1: Generate dataset (Farq read-only) ===")
        dataset_dir = generate_dataset(dataset_name=dataset_name)
        data_yaml = dataset_dir / "data.yaml"
        labels_json = dataset_dir / "labels.json"
    elif not data_yaml.exists():
        raise FileNotFoundError(
            f"Dataset missing at {data_yaml}; run without --skip-generate"
        )

    run_dir: Path | None = None
    if not skip_train:
        logger.info("=== Stage 2: Train YOLO ===")
        run_dir = train_yolo(
            data_yaml,
            model=model,
            epochs=epochs,
            run_name=run_name,
        )
        weights = run_dir / "weights" / "best.pt"
    else:
        if weights is None:
            # Try to find latest best.pt
            runs = sorted(
                (settings.models_dir / "runs").glob("*/weights/best.pt"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if not runs:
                raise FileNotFoundError("No weights found; train first or pass --weights")
            weights = runs[0]
        run_dir = weights.parent.parent

    logger.info("=== Stage 3: Evaluate (acceptance gates) ===")
    try:
        metrics = evaluate_model(
            weights,
            data_yaml,
            out_dir=run_dir / "eval",
            reject_below_gates=True,
        )
    except ModelRejectedError:
        logger.error(
            "Model rejected — refusing export/register. Fix data/training and retry."
        )
        raise

    export_dir = None
    manifest = None
    if not skip_export:
        logger.info("=== Stage 4: Export ONNX / CoreML / TFLite ===")
        export_dir = settings.models_dir / "exported" / (
            run_dir.name if run_dir else "manual"
        )
        manifest = export_models(
            weights,
            labels_json=labels_json,
            out_dir=export_dir,
        )

    registry_row = None
    if not skip_register:
        logger.info("=== Stage 5: Register model version (Calorie Scanner) ===")
        ver = version or datetime.now(timezone.utc).strftime("v%Y%m%d.%H%M%S")
        registry_row = register_model_version(
            version=ver,
            weights_path=weights,
            export_dir=export_dir,
            metrics_path=run_dir / "eval" / "metrics.json",
            manifest_path=(export_dir / "manifest.json") if export_dir else None,
            notes="Registered by scripts.run_full_pipeline",
            promote=promote,
        )

    summary = {
        "dataset_dir": str(dataset_dir),
        "run_dir": str(run_dir) if run_dir else None,
        "weights": str(weights) if weights else None,
        "metrics": metrics,
        "export_dir": str(export_dir) if export_dir else None,
        "manifest": manifest,
        "registry": registry_row,
    }
    logger.info("Pipeline complete")
    return summary


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Full Calorie Scanner YOLO pipeline. Farq is read-only; "
            "classes = item_identity; poor models are rejected."
        )
    )
    p.add_argument("--dataset-name", default="farq_yolo")
    p.add_argument("--skip-generate", action="store_true")
    p.add_argument("--skip-train", action="store_true")
    p.add_argument("--skip-export", action="store_true")
    p.add_argument("--skip-register", action="store_true")
    p.add_argument("--promote", action="store_true")
    p.add_argument("--version", default=None)
    p.add_argument("--epochs", type=int, default=None)
    p.add_argument("--model", default=None)
    p.add_argument("--weights", type=Path, default=None)
    p.add_argument("--name", default=None, help="Ultralytics run name")
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # Ensure imports resolve when run as module from /agent/ml
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    try:
        summary = run_full_pipeline(
            dataset_name=args.dataset_name,
            skip_generate=args.skip_generate,
            skip_train=args.skip_train,
            skip_export=args.skip_export,
            skip_register=args.skip_register,
            promote=args.promote,
            version=args.version,
            epochs=args.epochs,
            model=args.model,
            weights=args.weights,
            run_name=args.name,
        )
    except ModelRejectedError as exc:
        logger.error("%s", exc)
        return 2
    except Exception:
        logger.exception("Pipeline failed")
        return 1

    import json

    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
