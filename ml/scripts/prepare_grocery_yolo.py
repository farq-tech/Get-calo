#!/usr/bin/env python3
"""Prepare a YOLO dataset from grocery catalog + Farq product images (read-only).

Uses ``train_subset_300.json`` (or nutrition.json ranked by image_count) and
downloads product photos with synthetic centered boxes — same approach as the
Farq restaurant pipeline.

Does NOT write to Farq.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import random
import shutil
import sys
import time
import urllib.request
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
ML = ROOT / "ml"
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ML))

from dataset.generate import write_yolo_label  # noqa: E402
from dataset.validate import validate_image  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("grocery_yolo")

UA = "CaloraGroceryTrain/1.0 (on-device calorie scanner; read-only Farq images)"
CATALOG = ML / "data" / "datasets" / "grocery_tamimi"
OUT = ML / "data" / "datasets" / "grocery_yolo"


def _safe(identity: str) -> str:
    return hashlib.sha1(identity.encode()).hexdigest()[:12]


def download(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1024:
        return True
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:  # noqa: S310
                raw = resp.read()
            if len(raw) < 1024:
                return False
            tmp = dest.with_suffix(dest.suffix + ".part")
            tmp.write_bytes(raw)
            tmp.replace(dest)
            return True
        except Exception as exc:  # noqa: BLE001
            time.sleep(1.5 * (attempt + 1))
            log.debug("download retry %s: %s", url[:60], exc)
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-classes", type=int, default=100)
    ap.add_argument("--max-images-per-class", type=int, default=8)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    subset_path = CATALOG / "train_subset_300.json"
    nutrition_path = CATALOG / "nutrition.json"
    raw_path = CATALOG / "classes_raw.json"
    if not subset_path.exists():
        log.error("Missing %s — run build_grocery_nutrition_catalog.py first", subset_path)
        return 1

    subset = json.loads(subset_path.read_text(encoding="utf-8"))[: args.max_classes]
    raw_by_norm = {}
    if raw_path.exists():
        for g in json.loads(raw_path.read_text(encoding="utf-8")):
            raw_by_norm[g["name_norm"]] = g

    # Map item_identity → images via name_norm slug
    def norm_from_identity(identity: str) -> str:
        # grocery.mineral_bottled_water → look up in nutrition name
        return identity.replace("grocery.", "").replace("_", " ")

    # Prefer images from classes_raw by matching name_en
    by_name = {g["name_en"].lower(): g for g in (json.loads(raw_path.read_text()) if raw_path.exists() else [])}

    random.seed(args.seed)
    images_root = OUT / "images_raw"
    yolo_root = OUT / "yolo"
    if yolo_root.exists():
        shutil.rmtree(yolo_root)
    for split in ("train", "val"):
        (yolo_root / "images" / split).mkdir(parents=True, exist_ok=True)
        (yolo_root / "labels" / split).mkdir(parents=True, exist_ok=True)

    labels_out = []
    nutrition_out = []
    kept = 0

    for new_id, row in enumerate(subset):
        name_en = row["name_en"]
        g = by_name.get(name_en.lower())
        urls = (g or {}).get("images") or []
        if row.get("image_url") and row["image_url"] not in urls:
            urls = [row["image_url"]] + urls
        urls = urls[: args.max_images_per_class]
        if len(urls) < 2:
            log.warning("skip %s — only %d images", name_en, len(urls))
            continue

        identity = row["item_identity"]
        class_dir = images_root / _safe(identity)
        local_paths: list[Path] = []
        for i, url in enumerate(urls):
            ext = ".jpg"
            dest = class_dir / f"{i}{ext}"
            if download(url, dest):
                result = validate_image(dest)
                if result.ok:
                    local_paths.append(dest)
                else:
                    dest.unlink(missing_ok=True)
            time.sleep(0.05)

        if len(local_paths) < 2:
            log.warning("skip %s — validated %d", name_en, len(local_paths))
            continue

        random.shuffle(local_paths)
        n_val = max(1, len(local_paths) // 5)
        val_set = set(local_paths[:n_val])
        for p in local_paths:
            split = "val" if p in val_set else "train"
            stem = f"{new_id:04d}_{_safe(identity)}_{p.stem}"
            img_dest = yolo_root / "images" / split / f"{stem}.jpg"
            lbl_dest = yolo_root / "labels" / split / f"{stem}.txt"
            shutil.copy2(p, img_dest)
            write_yolo_label(lbl_dest, new_id)

        labels_out.append(
            {
                "class_id": new_id,
                "item_identity": identity,
                "name_en": name_en,
                "name_ar": row.get("name_ar") or "",
                "calories": row.get("calories_kcal"),
                "protein": row.get("protein_g"),
                "carbs": row.get("carbs_g"),
                "fat": row.get("fat_g"),
                "serving_size_g": row.get("serving_size_g") or 100,
                "category": row.get("category") or "grocery",
                "image_count": len(local_paths),
            }
        )
        nutrition_out.append(
            {
                "class_id": new_id,
                "item_identity": identity,
                "name_en": name_en,
                "name_ar": row.get("name_ar") or "",
                "calories_kcal": row.get("calories_kcal") or 0,
                "protein_g": row.get("protein_g") or 0,
                "carbs_g": row.get("carbs_g") or 0,
                "fat_g": row.get("fat_g") or 0,
                "serving_size_g": row.get("serving_size_g") or 100,
                "serving_label_en": "100g",
                "serving_label_ar": "100غ",
                "category": row.get("category") or "grocery",
            }
        )
        kept += 1
        log.info("[%d] %s — %d images", new_id, name_en, len(local_paths))

    data_yaml = {
        "path": str(yolo_root.resolve()),
        "train": "images/train",
        "val": "images/val",
        "nc": kept,
        "names": {i: c["name_en"] for i, c in enumerate(labels_out)},
    }
    (yolo_root / "data.yaml").write_text(yaml.safe_dump(data_yaml, sort_keys=False), encoding="utf-8")
    (OUT / "labels.json").write_text(
        json.dumps({"num_classes": kept, "classes": labels_out}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUT / "nutrition.json").write_text(
        json.dumps(nutrition_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log.info("Prepared grocery YOLO: %d classes → %s", kept, yolo_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
