"""Export best.pt to ONNX, CoreML (Darwin), and TFLite for on-device use.

Also copies ``labels.json``, builds ``nutrition.sqlite``, and writes
``manifest.json``.

CLI::

    cd /agent/ml && python -m export.export_models --weights .../best.pt
"""

from __future__ import annotations

import argparse
import json
import logging
import platform
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

from config.settings import settings
from dataset.labels import LabelMap, load_labels_json

logger = logging.getLogger(__name__)


def build_nutrition_sqlite(label_map: LabelMap, db_path: Path) -> Path:
    """Create a compact SQLite DB keyed by class_id / item_identity."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            """
            CREATE TABLE nutrition (
                class_id INTEGER PRIMARY KEY,
                item_identity TEXT NOT NULL UNIQUE,
                name_en TEXT,
                name_ar TEXT,
                calories REAL,
                protein REAL,
                carbs REAL,
                fat REAL,
                serving_size_g REAL,
                category TEXT
            )
            """
        )
        conn.executemany(
            """
            INSERT INTO nutrition (
                class_id, item_identity, name_en, name_ar,
                calories, protein, carbs, fat, serving_size_g, category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    c.class_id,
                    c.item_identity,
                    c.name_en,
                    c.name_ar,
                    c.calories,
                    c.protein,
                    c.carbs,
                    c.fat,
                    c.serving_size_g,
                    c.category,
                )
                for c in label_map.classes
            ],
        )
        conn.execute(
            "CREATE INDEX idx_nutrition_identity ON nutrition(item_identity)"
        )
        conn.commit()
    finally:
        conn.close()
    logger.info("Built nutrition.sqlite → %s (%d rows)", db_path, label_map.num_classes)
    return db_path


def _export_format(model: Any, fmt: str, out_dir: Path, **kwargs: Any) -> Path | None:
    try:
        exported = model.export(format=fmt, **kwargs)
        path = Path(str(exported))
        dest = out_dir / path.name
        if path.resolve() != dest.resolve():
            dest.parent.mkdir(parents=True, exist_ok=True)
            if path.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(path, dest)
            else:
                shutil.copy2(path, dest)
            return dest
        return path
    except Exception as exc:  # noqa: BLE001
        logger.exception("Export format=%s failed: %s", fmt, exc)
        return None


def export_models(
    weights: Path,
    *,
    labels_json: Path | None = None,
    out_dir: Path | None = None,
    imgsz: int | None = None,
    include_coreml: bool | None = None,
    include_tflite: bool = True,
    include_onnx: bool = True,
) -> dict[str, Any]:
    """Export weights to on-device formats and package metadata artifacts."""
    from ultralytics import YOLO

    weights = Path(weights)
    if not weights.exists():
        raise FileNotFoundError(weights)

    out_dir = out_dir or (settings.models_dir / "exported" / weights.parent.parent.name)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Resolve labels.json
    candidates = []
    if labels_json is not None:
        candidates.append(Path(labels_json))
    candidates.extend(
        [
            weights.parent.parent / "labels.json",
            settings.dataset_output_dir / "farq_yolo" / "labels.json",
        ]
    )
    labels_path = next((p for p in candidates if p.exists()), None)
    if labels_path is None:
        raise FileNotFoundError(
            "labels.json not found — pass --labels or generate the dataset first"
        )

    label_map = load_labels_json(labels_path)
    shutil.copy2(labels_path, out_dir / "labels.json")
    nutrition_db = build_nutrition_sqlite(label_map, out_dir / "nutrition.sqlite")

    model = YOLO(str(weights))
    imgsz = imgsz or settings.img_size
    artifacts: dict[str, str | None] = {
        "best_pt": str(weights.resolve()),
        "labels_json": str((out_dir / "labels.json").resolve()),
        "nutrition_sqlite": str(nutrition_db.resolve()),
        "onnx": None,
        "coreml": None,
        "tflite": None,
    }

    if include_onnx:
        onnx_path = _export_format(
            model, "onnx", out_dir, imgsz=imgsz, simplify=True, opset=12
        )
        artifacts["onnx"] = str(onnx_path.resolve()) if onnx_path else None

    # CoreML: try/except; typically only works well on Darwin
    do_coreml = include_coreml if include_coreml is not None else True
    if do_coreml:
        if platform.system() != "Darwin":
            logger.warning(
                "CoreML export skipped/attempted off Darwin (%s) — may fail",
                platform.system(),
            )
        try:
            coreml_path = _export_format(model, "coreml", out_dir, imgsz=imgsz, nms=True)
            artifacts["coreml"] = (
                str(coreml_path.resolve()) if coreml_path else None
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("CoreML export unavailable: %s", exc)
            artifacts["coreml"] = None

    if include_tflite:
        tflite_path = _export_format(
            model, "tflite", out_dir, imgsz=imgsz, int8=False
        )
        artifacts["tflite"] = str(tflite_path.resolve()) if tflite_path else None

    # Also keep a copy of best.pt in the export bundle
    pt_copy = out_dir / "best.pt"
    if weights.resolve() != pt_copy.resolve():
        shutil.copy2(weights, pt_copy)
        artifacts["best_pt"] = str(pt_copy.resolve())

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "platform": platform.platform(),
        "imgsz": imgsz,
        "num_classes": label_map.num_classes,
        "class_key": "item_identity",
        "farq_readonly": True,
        "synthetic_box": {
            "x_center": 0.5,
            "y_center": 0.5,
            "width": 0.9,
            "height": 0.9,
            "note": (
                "Trained with synthetic centered boxes (~90% of frame) because "
                "product photos have no GT bounding boxes."
            ),
        },
        "artifacts": artifacts,
        "on_device_formats": ["onnx", "coreml", "tflite"],
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    logger.info("Export complete → %s", out_dir)
    return manifest


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export YOLO weights for on-device use")
    p.add_argument("--weights", type=Path, required=True)
    p.add_argument("--labels", type=Path, default=None)
    p.add_argument("--out-dir", type=Path, default=None)
    p.add_argument("--imgsz", type=int, default=None)
    p.add_argument("--skip-coreml", action="store_true")
    p.add_argument("--skip-tflite", action="store_true")
    p.add_argument("--skip-onnx", action="store_true")
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    manifest = export_models(
        args.weights,
        labels_json=args.labels,
        out_dir=args.out_dir,
        imgsz=args.imgsz,
        include_coreml=not args.skip_coreml,
        include_tflite=not args.skip_tflite,
        include_onnx=not args.skip_onnx,
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
