"""Evaluate a trained YOLO model against acceptance gates.

Computes precision, recall, mAP50, mAP50-95, confusion matrix plot,
false-positive / false-negative counts. Rejects models below settings gates
and writes ``metrics.json``.

CLI::

    cd /agent/ml && python -m train.evaluate --weights models/runs/.../weights/best.pt
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np
import seaborn as sns

from config.settings import settings

logger = logging.getLogger(__name__)


class ModelRejectedError(RuntimeError):
    """Raised when metrics fall below configured acceptance gates."""


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _extract_metrics(results: Any) -> dict[str, float]:
    """Normalize Ultralytics val results into a flat metrics dict."""
    box = getattr(results, "box", None)
    metrics = {
        "precision": 0.0,
        "recall": 0.0,
        "mAP50": 0.0,
        "mAP50-95": 0.0,
    }
    if box is not None:
        metrics["precision"] = _safe_float(getattr(box, "mp", None))
        metrics["recall"] = _safe_float(getattr(box, "mr", None))
        metrics["mAP50"] = _safe_float(getattr(box, "map50", None))
        metrics["mAP50-95"] = _safe_float(getattr(box, "map", None))

    # Fallback to results_dict if available
    results_dict = getattr(results, "results_dict", None) or {}
    aliases = {
        "precision": ["metrics/precision(B)", "precision"],
        "recall": ["metrics/recall(B)", "recall"],
        "mAP50": ["metrics/mAP50(B)", "mAP50"],
        "mAP50-95": ["metrics/mAP50-95(B)", "mAP50-95"],
    }
    for key, names in aliases.items():
        if metrics[key] == 0.0:
            for n in names:
                if n in results_dict:
                    metrics[key] = _safe_float(results_dict[n])
                    break
    return metrics


def _count_fp_fn(confusion: np.ndarray | None) -> tuple[int, int]:
    """Approximate FP/FN from a confusion matrix (rows=true, cols=pred).

    Ultralytics confusion includes a background class as the last index.
    """
    if confusion is None or confusion.size == 0:
        return 0, 0
    cm = np.asarray(confusion, dtype=np.float64)
    # Diagonal = TP (excluding background row/col if square nc+1)
    n = cm.shape[0]
    tp = float(np.trace(cm[: min(n, n), : min(n, n)]))
    # If background present, ignore last row/col for class TP
    if n >= 2:
        class_cm = cm[:-1, :-1]
        tp = float(np.trace(class_cm))
        fn = int(round(float(class_cm.sum(axis=1).sum() - tp + cm[:-1, -1].sum())))
        fp = int(round(float(class_cm.sum(axis=0).sum() - tp + cm[-1, :-1].sum())))
    else:
        total = float(cm.sum())
        fn = int(round(total - tp))
        fp = fn
    return max(0, fp), max(0, fn)


def plot_confusion_matrix(
    confusion: np.ndarray,
    out_path: Path,
    *,
    class_names: list[str] | None = None,
    max_classes_labeled: int = 40,
) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cm = np.asarray(confusion, dtype=np.float64)
    # Drop background row/col for plotting if present and names shorter
    labels = class_names
    if labels is not None and cm.shape[0] == len(labels) + 1:
        cm = cm[:-1, :-1]

    fig_w = max(8, min(24, cm.shape[0] * 0.35 + 4))
    fig, ax = plt.subplots(figsize=(fig_w, fig_w * 0.85))
    show_annot = cm.shape[0] <= 30
    sns.heatmap(
        cm,
        ax=ax,
        cmap="Blues",
        annot=show_annot,
        fmt=".0f" if show_annot else "",
        cbar=True,
    )
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title("Confusion Matrix")
    if labels and len(labels) <= max_classes_labeled and len(labels) == cm.shape[0]:
        ax.set_xticklabels(labels, rotation=90, fontsize=6)
        ax.set_yticklabels(labels, rotation=0, fontsize=6)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
    logger.info("Wrote confusion matrix → %s", out_path)
    return out_path


def passes_gates(
    metrics: dict[str, float],
    *,
    min_map50: float | None = None,
    min_precision: float | None = None,
    min_recall: float | None = None,
) -> tuple[bool, list[str]]:
    min_map50 = min_map50 if min_map50 is not None else settings.min_map50_accept
    min_precision = (
        min_precision if min_precision is not None else settings.min_precision_accept
    )
    min_recall = min_recall if min_recall is not None else settings.min_recall_accept

    failures: list[str] = []
    if metrics.get("mAP50", 0.0) < min_map50:
        failures.append(
            f"mAP50 {metrics.get('mAP50', 0.0):.4f} < gate {min_map50:.4f}"
        )
    if metrics.get("precision", 0.0) < min_precision:
        failures.append(
            f"precision {metrics.get('precision', 0.0):.4f} < gate {min_precision:.4f}"
        )
    if metrics.get("recall", 0.0) < min_recall:
        failures.append(
            f"recall {metrics.get('recall', 0.0):.4f} < gate {min_recall:.4f}"
        )
    return len(failures) == 0, failures


def evaluate_model(
    weights: Path,
    data_yaml: Path,
    *,
    split: str = "test",
    imgsz: int | None = None,
    batch: int | None = None,
    conf: float | None = None,
    out_dir: Path | None = None,
    reject_below_gates: bool = True,
) -> dict[str, Any]:
    """Run validation and write metrics.json. Optionally raise on gate failure."""
    from ultralytics import YOLO

    weights = Path(weights)
    data_yaml = Path(data_yaml)
    if not weights.exists():
        raise FileNotFoundError(weights)
    if not data_yaml.exists():
        raise FileNotFoundError(data_yaml)

    out_dir = out_dir or weights.parent.parent / "eval"
    out_dir.mkdir(parents=True, exist_ok=True)

    model = YOLO(str(weights))
    results = model.val(
        data=str(data_yaml.resolve()),
        split=split,
        imgsz=imgsz or settings.img_size,
        batch=batch or settings.batch_size,
        conf=conf if conf is not None else settings.confidence_threshold,
        plots=True,
        project=str(out_dir),
        name="val",
        exist_ok=True,
    )

    metrics = _extract_metrics(results)
    confusion = None
    conf_matrix_obj = getattr(results, "confusion_matrix", None)
    if conf_matrix_obj is not None:
        confusion = getattr(conf_matrix_obj, "matrix", None)
        if confusion is not None:
            confusion = np.asarray(confusion)

    fp, fn = _count_fp_fn(confusion)
    names = []
    names_attr = getattr(model, "names", None)
    if isinstance(names_attr, dict):
        names = [names_attr[i] for i in sorted(names_attr)]
    elif isinstance(names_attr, list):
        names = list(names_attr)

    cm_path = None
    if confusion is not None:
        cm_path = plot_confusion_matrix(
            confusion, out_dir / "confusion_matrix.png", class_names=names
        )

    accepted, failures = passes_gates(metrics)
    payload: dict[str, Any] = {
        "weights": str(weights.resolve()),
        "data_yaml": str(data_yaml.resolve()),
        "split": split,
        "precision": metrics["precision"],
        "recall": metrics["recall"],
        "mAP50": metrics["mAP50"],
        "mAP50-95": metrics["mAP50-95"],
        "false_positives": fp,
        "false_negatives": fn,
        "confusion_matrix_path": str(cm_path) if cm_path else None,
        "accepted": accepted,
        "gate_failures": failures,
        "gates": {
            "min_map50_accept": settings.min_map50_accept,
            "min_precision_accept": settings.min_precision_accept,
            "min_recall_accept": settings.min_recall_accept,
        },
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "class_key": "item_identity",
    }

    metrics_path = out_dir / "metrics.json"
    metrics_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    logger.info("Wrote metrics → %s (accepted=%s)", metrics_path, accepted)

    if reject_below_gates and not accepted:
        raise ModelRejectedError(
            "Model rejected by acceptance gates: " + "; ".join(failures)
        )
    return payload


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Evaluate YOLO model + acceptance gates")
    p.add_argument("--weights", type=Path, required=True)
    p.add_argument(
        "--data",
        type=Path,
        default=settings.dataset_output_dir / "farq_yolo" / "data.yaml",
    )
    p.add_argument("--split", default="test", choices=["train", "val", "test"])
    p.add_argument("--imgsz", type=int, default=None)
    p.add_argument("--batch", type=int, default=None)
    p.add_argument("--conf", type=float, default=None)
    p.add_argument("--out-dir", type=Path, default=None)
    p.add_argument(
        "--no-reject",
        action="store_true",
        help="Write metrics even if below gates (do not raise)",
    )
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    payload = evaluate_model(
        args.weights,
        args.data,
        split=args.split,
        imgsz=args.imgsz,
        batch=args.batch,
        conf=args.conf,
        out_dir=args.out_dir,
        reject_below_gates=not args.no_reject,
    )
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
