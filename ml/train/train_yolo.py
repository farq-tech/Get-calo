"""Train Ultralytics YOLO on the generated Farq dataset.

CLI::

    cd /agent/ml && python -m train.train_yolo --data data/datasets/farq_yolo/data.yaml
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

from config.settings import settings

logger = logging.getLogger(__name__)


def train_yolo(
    data_yaml: Path,
    *,
    model: str | None = None,
    epochs: int | None = None,
    imgsz: int | None = None,
    batch: int | None = None,
    project: Path | None = None,
    run_name: str | None = None,
    device: str | None = None,
    patience: int = 30,
    workers: int = 8,
    seed: int = 42,
    resume: bool = False,
) -> Path:
    """Train YOLO and return the run directory containing weights/best.pt."""
    from ultralytics import YOLO

    data_yaml = Path(data_yaml)
    if not data_yaml.exists():
        raise FileNotFoundError(f"data.yaml not found: {data_yaml}")

    model_name = model or settings.yolo_model
    epochs = epochs if epochs is not None else settings.train_epochs
    imgsz = imgsz if imgsz is not None else settings.img_size
    batch = batch if batch is not None else settings.batch_size
    project = project or (settings.models_dir / "runs")
    project.mkdir(parents=True, exist_ok=True)
    run_name = run_name or f"train_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

    logger.info(
        "Training %s on %s (epochs=%d imgsz=%d batch=%d)",
        model_name,
        data_yaml,
        epochs,
        imgsz,
        batch,
    )

    yolo = YOLO(model_name)
    train_kwargs: dict[str, Any] = {
        "data": str(data_yaml.resolve()),
        "epochs": epochs,
        "imgsz": imgsz,
        "batch": batch,
        "project": str(project),
        "name": run_name,
        "patience": patience,
        "workers": workers,
        "seed": seed,
        "exist_ok": True,
        "pretrained": True,
        "verbose": True,
        "resume": resume,
    }
    if device is not None:
        train_kwargs["device"] = device

    results = yolo.train(**train_kwargs)
    # Ultralytics saves under project/name
    save_dir = Path(getattr(results, "save_dir", project / run_name))
    best = save_dir / "weights" / "best.pt"
    last = save_dir / "weights" / "last.pt"
    if not best.exists() and last.exists():
        logger.warning("best.pt missing — copying last.pt")
        shutil.copy2(last, best)

    meta = {
        "data_yaml": str(data_yaml.resolve()),
        "model": model_name,
        "epochs": epochs,
        "imgsz": imgsz,
        "batch": batch,
        "run_dir": str(save_dir),
        "best_weights": str(best) if best.exists() else None,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "class_key": "item_identity",
        "farq_readonly": True,
    }
    (save_dir / "train_meta.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )
    logger.info("Training complete: %s", save_dir)
    return save_dir


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train Ultralytics YOLO")
    p.add_argument(
        "--data",
        type=Path,
        default=settings.dataset_output_dir / "farq_yolo" / "data.yaml",
    )
    p.add_argument("--model", default=None)
    p.add_argument("--epochs", type=int, default=None)
    p.add_argument("--imgsz", type=int, default=None)
    p.add_argument("--batch", type=int, default=None)
    p.add_argument("--project", type=Path, default=None)
    p.add_argument("--name", default=None)
    p.add_argument("--device", default=None)
    p.add_argument("--patience", type=int, default=30)
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--resume", action="store_true")
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    run_dir = train_yolo(
        args.data,
        model=args.model,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project=args.project,
        run_name=args.name,
        device=args.device,
        patience=args.patience,
        workers=args.workers,
        seed=args.seed,
        resume=args.resume,
    )
    print(f"Run directory: {run_dir}")
    print(f"Best weights: {run_dir / 'weights' / 'best.pt'}")


if __name__ == "__main__":
    main()
