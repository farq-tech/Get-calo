#!/usr/bin/env python3
"""Train Calora on essential everyday foods/drinks (Wikimedia + synth).

CPU-friendly finish path:
  1. Resolve Commons image URLs (rate-limited)
  2. Download + validate + augment → YOLO dataset
  3. Train YOLOv8n
  4. Export ONNX + labels + nutrition
  5. Copy into mobile/assets/models/

CLI::

    cd /agent/ml && python -m scripts.train_essential_foods
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import shutil
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
ML = ROOT / "ml"
load_dotenv(ROOT / ".env")
load_dotenv(ML / ".env")
sys.path.insert(0, str(ML))
os.chdir(ML)

from dataset.augment import generate_augmented_copies  # noqa: E402
from dataset.essential_catalog import ESSENTIAL_FOODS, EssentialFood  # noqa: E402
from dataset.generate_demo import make_synthetic_plate, write_yolo_label  # noqa: E402
from dataset.labels import ClassLabel, LabelMap, write_labels_json  # noqa: E402
from dataset.validate import validate_image  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("essential_train")

USER_AGENT = "CaloraEssentialFoods/1.0 (on-device calorie scanner training; educational)"
EPOCHS = int(os.environ.get("ESSENTIAL_EPOCHS", "22"))
BATCH = int(os.environ.get("ESSENTIAL_BATCH", "4"))
IMGSZ = int(os.environ.get("ESSENTIAL_IMGSZ", "416"))
AUG_PER = int(os.environ.get("ESSENTIAL_AUG_PER", "5"))
URLS_PER = int(os.environ.get("ESSENTIAL_URLS_PER", "5"))
SYNTH_PER = int(os.environ.get("ESSENTIAL_SYNTH_PER", "4"))
SEED = 42
DATASET_NAME = "essential_yolo"
RUN_NAME = os.environ.get("ESSENTIAL_RUN", "essential_v2")
EXPORT_NAME = os.environ.get("ESSENTIAL_EXPORT", "essential_v2")


def _safe(identity: str) -> str:
    return hashlib.sha1(identity.encode()).hexdigest()[:12]


def commons_search(query: str, limit: int = 5) -> list[str]:
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,
            "gsrlimit": limit,
            "prop": "imageinfo",
            "iiprop": "url|size|mime",
            "iiurlwidth": 640,
        }
    )
    url = "https://commons.wikimedia.org/w/api.php?" + params
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:  # noqa: S310
                data = json.load(resp)
            break
        except Exception as exc:  # noqa: BLE001
            wait = 8 * (attempt + 1)
            log.warning("Commons search retry (%s): %s — sleep %ss", query, exc, wait)
            time.sleep(wait)
    else:
        return []

    pages = data.get("query", {}).get("pages", {})
    out: list[str] = []
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        mime = str(info.get("mime") or "")
        if not mime.startswith("image/"):
            continue
        u = info.get("thumburl") or info.get("url")
        if u:
            out.append(str(u))
    return out


def download(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1024:
        return True
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:  # noqa: S310
                raw = resp.read()
            if len(raw) < 1024:
                return False
            tmp = dest.with_suffix(dest.suffix + ".part")
            tmp.write_bytes(raw)
            tmp.replace(dest)
            time.sleep(0.8)
            return True
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            wait = 12 * (attempt + 1)
            if "429" in msg or "Too many" in msg or "Too Many" in msg:
                log.warning("Rate limited downloading — sleep %ss", wait)
                time.sleep(wait)
                continue
            log.warning("Download failed %s: %s", url[:80], exc)
            dest.unlink(missing_ok=True)
            return False
    dest.unlink(missing_ok=True)
    return False


def collect_images(cache: Path) -> dict[str, list[Path]]:
    cache.mkdir(parents=True, exist_ok=True)
    url_cache = cache / "url_index.json"
    index: dict[str, list[str]] = {}
    if url_cache.exists():
        index = json.loads(url_cache.read_text(encoding="utf-8"))

    grouped: dict[str, list[Path]] = {}
    for food in ESSENTIAL_FOODS:
        folder = cache / _safe(food.item_identity)
        folder.mkdir(parents=True, exist_ok=True)
        urls = index.get(food.item_identity)
        if not urls:
            log.info("Searching Commons: %s", food.search_query)
            urls = commons_search(food.search_query, URLS_PER)
            index[food.item_identity] = urls
            url_cache.write_text(json.dumps(index, indent=2), encoding="utf-8")
            time.sleep(3.5)

        kept: list[Path] = []
        for i, url in enumerate(urls):
            dest = folder / f"wiki_{i:02d}.jpg"
            if download(url, dest):
                result = validate_image(dest)
                if result.ok:
                    kept.append(dest)
                else:
                    dest.unlink(missing_ok=True)

        # Always add synthetic variants for coverage / offline resilience
        for v in range(SYNTH_PER):
            dest = folder / f"synth_{v:02d}.jpg"
            from dataset.demo_catalog import DemoFood

            demo_like = DemoFood(
                item_identity=food.item_identity,
                name_en=food.name_en,
                name_ar=food.name_ar,
                calories_kcal=food.calories_kcal,
                protein_g=food.protein_g,
                carbs_g=food.carbs_g,
                fat_g=food.fat_g,
                serving_size_g=food.serving_size_g,
                serving_label_en=food.serving_label_en,
                serving_label_ar=food.serving_label_ar,
                category=food.category,
                image_urls=tuple(urls or ()),
                plate_color=food.plate_color,
            )
            make_synthetic_plate(dest, demo_like, v)
            if validate_image(dest).ok:
                kept.append(dest)

        if not kept:
            log.warning("No images for %s", food.item_identity)
            continue
        grouped[food.item_identity] = kept
        log.info("%s → %d images (%d wiki)", food.name_en, len(kept), max(0, len(kept) - SYNTH_PER))
        time.sleep(0.5)
    return grouped


def build_dataset(grouped: dict[str, list[Path]]) -> Path:
    foods = [f for f in ESSENTIAL_FOODS if f.item_identity in grouped]
    label_map = LabelMap(
        classes=[
            ClassLabel(
                class_id=i,
                item_identity=f.item_identity,
                name_en=f.name_en,
                name_ar=f.name_ar,
                calories=f.calories_kcal,
                protein=f.protein_g,
                carbs=f.carbs_g,
                fat=f.fat_g,
                serving_size_g=f.serving_size_g,
                category=f.category,
                image_count=len(grouped[f.item_identity]),
            )
            for i, f in enumerate(foods)
        ]
    )

    out = Path("data/datasets") / DATASET_NAME
    if out.exists():
        shutil.rmtree(out)
    for split in ("train", "val", "test"):
        (out / "images" / split).mkdir(parents=True)
        (out / "labels" / split).mkdir(parents=True)

    rng = random.Random(SEED)
    counts = {"train": 0, "val": 0, "test": 0}
    identity_to_id = label_map.identity_to_id()

    for food in foods:
        class_id = identity_to_id[food.item_identity]
        paths = list(grouped[food.item_identity])
        aug_dir = out / "_aug" / _safe(food.item_identity)
        aug_dir.mkdir(parents=True, exist_ok=True)
        all_imgs = list(paths)
        for src in paths:
            all_imgs.extend(generate_augmented_copies(src, aug_dir, n=AUG_PER))

        rng.shuffle(all_imgs)
        n = len(all_imgs)
        n_train = max(3, int(n * 0.8))
        n_val = max(1, int(n * 0.1))
        splits = {
            "train": all_imgs[:n_train],
            "val": all_imgs[n_train : n_train + n_val] or all_imgs[-1:],
            "test": all_imgs[n_train + n_val :] or all_imgs[-1:],
        }
        for split, imgs in splits.items():
            for i, img in enumerate(imgs):
                stem = f"c{class_id:03d}_{split}_{i:04d}"
                ext = img.suffix.lower() if img.suffix else ".jpg"
                if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
                    ext = ".jpg"
                dest = out / "images" / split / f"{stem}{ext}"
                shutil.copy2(img, dest)
                write_yolo_label(out / "labels" / split / f"{stem}.txt", class_id)
                counts[split] += 1

    write_labels_json(label_map, out / "labels.json")
    nutrition = [
        {
            "class_id": c.class_id,
            "item_identity": c.item_identity,
            "name_en": c.name_en,
            "name_ar": c.name_ar,
            "calories_kcal": c.calories,
            "protein_g": c.protein,
            "carbs_g": c.carbs,
            "fat_g": c.fat,
            "serving_size_g": c.serving_size_g,
            "serving_label_en": next(
                f.serving_label_en for f in foods if f.item_identity == c.item_identity
            ),
            "serving_label_ar": next(
                f.serving_label_ar for f in foods if f.item_identity == c.item_identity
            ),
            "category": c.category,
        }
        for c in label_map.classes
    ]
    (out / "nutrition.json").write_text(
        json.dumps(nutrition, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    data_yaml = {
        "path": str(out.resolve()),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {c.class_id: c.item_identity for c in label_map.classes},
        "nc": label_map.num_classes,
    }
    (out / "data.yaml").write_text(yaml.safe_dump(data_yaml, sort_keys=False), encoding="utf-8")
    shutil.rmtree(out / "_aug", ignore_errors=True)
    log.info("Dataset %s classes=%d splits=%s", out, label_map.num_classes, counts)
    return out


def train(data_yaml: Path) -> Path:
    from train.train_yolo import train_yolo

    return train_yolo(
        data_yaml,
        model="yolov8n.pt",
        epochs=EPOCHS,
        batch=BATCH,
        imgsz=IMGSZ,
        run_name=RUN_NAME,
        device="cpu",
        workers=2,
        patience=10,
    )


def export_pack(run_dir: Path, labels: Path) -> Path:
    from export.export_models import export_models

    out = Path("models/exports") / EXPORT_NAME
    export_models(
        run_dir / "weights" / "best.pt",
        labels_json=labels,
        out_dir=out,
        include_tflite=False,
        include_coreml=False,
    )
    return out


def copy_to_mobile(pack: Path, nutrition_path: Path) -> None:
    dest = ROOT / "mobile" / "assets" / "models"
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("best.onnx", "labels.json", "nutrition.sqlite", "manifest.json"):
        src = pack / name
        if src.exists():
            shutil.copy2(src, dest / name)
            log.info("Copied %s", name)

    rows = json.loads(nutrition_path.read_text(encoding="utf-8"))
    sample = [
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
            "serving_label_en": r.get("serving_label_en") or "serving",
            "serving_label_ar": r.get("serving_label_ar") or "حصة",
            "category": r.get("category") or "",
        }
        for r in rows
    ]
    out = ROOT / "mobile" / "assets" / "nutrition.sample.json"
    out.write_text(json.dumps(sample, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log.info("Updated nutrition.sample.json (%d)", len(sample))

    # Demo meal photo from val set class 0 or pizza if present
    val_imgs = sorted((Path("data/datasets") / DATASET_NAME / "images" / "val").glob("*.jpg"))
    if val_imgs:
        demo = ROOT / "mobile" / "assets" / "samples" / "demo-meal.jpg"
        demo.parent.mkdir(parents=True, exist_ok=True)
        # Prefer pizza / burger sample if present
        pick = next((p for p in val_imgs if "c021" in p.name or "c020" in p.name), val_imgs[0])
        shutil.copy2(pick, demo)
        log.info("Updated demo-meal.jpg from %s", pick.name)


def main() -> int:
    log.info(
        "Essential foods train start classes=%d epochs=%d imgsz=%d batch=%d",
        len(ESSENTIAL_FOODS),
        EPOCHS,
        IMGSZ,
        BATCH,
    )
    grouped = collect_images(Path("data/raw/essential_cache"))
    ds = build_dataset(grouped)
    run = train(ds / "data.yaml")
    pack = export_pack(run, ds / "labels.json")
    copy_to_mobile(pack, ds / "nutrition.json")
    log.info("DONE → %s", pack.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
