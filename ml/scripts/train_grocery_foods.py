#!/usr/bin/env python3
"""Train Calora grocery YOLO (Tamimi product photos) and ship to mobile.

CPU-friendly defaults. Requires prepare_grocery_yolo.py to have been run.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
ML = ROOT / "ml"
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ML))
os.chdir(ML)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("grocery_train")

EPOCHS = int(os.environ.get("GROCERY_EPOCHS", "20"))
BATCH = int(os.environ.get("GROCERY_BATCH", "4"))
IMGSZ = int(os.environ.get("GROCERY_IMGSZ", "416"))
RUN_NAME = os.environ.get("GROCERY_RUN", "grocery_v1")
EXPORT_NAME = os.environ.get("GROCERY_EXPORT", "grocery_v1")
DS = Path("data/datasets/grocery_yolo/yolo")


def train() -> Path:
    from train.train_yolo import train_yolo

    return train_yolo(
        DS / "data.yaml",
        model="yolov8n.pt",
        epochs=EPOCHS,
        batch=BATCH,
        imgsz=IMGSZ,
        run_name=RUN_NAME,
        device="cpu",
        workers=2,
        patience=8,
    )


def export_pack(run_dir: Path) -> Path:
    from export.export_models import export_models

    labels = Path("data/datasets/grocery_yolo/labels.json")
    out = Path("models/exports") / EXPORT_NAME
    export_models(
        run_dir / "weights" / "best.pt",
        labels_json=labels,
        out_dir=out,
        include_tflite=False,
        include_coreml=False,
    )
    return out


def copy_to_mobile(pack: Path) -> None:
    dest = ROOT / "mobile" / "assets" / "models"
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("best.onnx", "labels.json", "nutrition.sqlite", "manifest.json"):
        src = pack / name
        if src.exists():
            shutil.copy2(src, dest / name)
            log.info("Copied %s → mobile", name)

    nutrition_path = Path("data/datasets/grocery_yolo/nutrition.json")
    grocery_rows = json.loads(nutrition_path.read_text(encoding="utf-8"))

    # Keep essential + unmatched grocery catalog search rows if present,
    # but model labels/nutrition for inference follow the trained grocery set.
    # Also merge full matched grocery catalog for search UI.
    full_catalog = ROOT / "ml" / "data" / "datasets" / "grocery_tamimi" / "nutrition.json"
    sample = []
    # Trained classes first (class_id 0..N-1)
    for r in grocery_rows:
        sample.append(
            {
                "class_id": r["class_id"],
                "item_identity": r["item_identity"],
                "name_en": r["name_en"],
                "name_ar": r.get("name_ar") or "",
                "calories_kcal": r.get("calories_kcal") or 0,
                "protein_g": r.get("protein_g") or 0,
                "carbs_g": r.get("carbs_g") or 0,
                "fat_g": r.get("fat_g") or 0,
                "serving_size_g": r.get("serving_size_g") or 100,
                "serving_label_en": r.get("serving_label_en") or "100g",
                "serving_label_ar": r.get("serving_label_ar") or "100غ",
                "category": r.get("category") or "grocery",
            }
        )
    trained_ids = {r["item_identity"] for r in grocery_rows}
    if full_catalog.exists():
        for r in json.loads(full_catalog.read_text(encoding="utf-8")):
            if r.get("source") == "unmatched":
                continue
            if r["item_identity"] in trained_ids:
                continue
            sample.append(
                {
                    "class_id": r["class_id"],
                    "item_identity": r["item_identity"],
                    "name_en": r["name_en"],
                    "name_ar": r.get("name_ar") or "",
                    "calories_kcal": r.get("calories_kcal") or 0,
                    "protein_g": r.get("protein_g") or 0,
                    "carbs_g": r.get("carbs_g") or 0,
                    "fat_g": r.get("fat_g") or 0,
                    "serving_size_g": r.get("serving_size_g") or 100,
                    "serving_label_en": "100g",
                    "serving_label_ar": "100غ",
                    "category": r.get("category") or "grocery",
                }
            )
    out = ROOT / "mobile" / "assets" / "nutrition.sample.json"
    out.write_text(json.dumps(sample, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log.info("Updated nutrition.sample.json (%d rows)", len(sample))

    # Update manifest version hint in mobile if present
    manifest = dest / "manifest.json"
    if manifest.exists():
        try:
            m = json.loads(manifest.read_text(encoding="utf-8"))
            m["version"] = "1.3.0-grocery60"
            m["source"] = "grocery_tamimi_yolo"
            m["num_classes"] = len(grocery_rows)
            manifest.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except Exception as exc:  # noqa: BLE001
            log.warning("manifest update skipped: %s", exc)


def main() -> int:
    if not (DS / "data.yaml").exists():
        log.error("Missing dataset — run prepare_grocery_yolo.py first")
        return 1
    labels = json.loads(Path("data/datasets/grocery_yolo/labels.json").read_text())
    log.info(
        "Grocery train start classes=%d epochs=%d imgsz=%d batch=%d",
        labels.get("num_classes"),
        EPOCHS,
        IMGSZ,
        BATCH,
    )
    run = train()
    pack = export_pack(run)
    copy_to_mobile(pack)
    log.info("DONE → %s", pack.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
