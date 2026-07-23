"""Generate a YOLO dataset without Farq — public demo catalog only.

Downloads Wikimedia meal photos, validates, augments, writes YOLO folders +
labels.json + nutrition seed payload.

CLI::

    cd /agent/ml && python -m dataset.generate_demo
    cd /agent/ml && python -m dataset.generate_demo --no-augment --max-classes 6
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import random
import shutil
import sys
from pathlib import Path
from typing import Sequence
from urllib.request import Request, urlopen

import yaml
from tqdm import tqdm

from config.settings import settings
from dataset.augment import generate_augmented_copies
from dataset.demo_catalog import DEMO_FOODS, DemoFood
from dataset.labels import ClassLabel, LabelMap, write_labels_json
from dataset.validate import validate_image

logger = logging.getLogger(__name__)

USER_AGENT = "CaloraDemoDataset/1.0 (educational; contact: local-dev)"
SYNTHETIC_BOX = (0.5, 0.5, 0.9, 0.9)


def write_yolo_label(path: Path, class_id: int) -> None:
    xc, yc, w, h = SYNTHETIC_BOX
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n", encoding="utf-8")


def _safe_name(identity: str) -> str:
    digest = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:12]
    return digest


def download_url(url: str, dest: Path, timeout: int = 45) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=timeout) as resp:  # noqa: S310 — curated HTTPS URLs
            data = resp.read()
        if len(data) < 1024:
            return False
        tmp = dest.with_suffix(dest.suffix + ".part")
        tmp.write_bytes(data)
        tmp.replace(dest)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Download failed %s: %s", url, exc)
        if dest.exists():
            dest.unlink(missing_ok=True)
        return False


def make_synthetic_plate(dest: Path, food: DemoFood, variant: int) -> Path:
    """Offline fallback: generate a simple distinctive food-plate image."""
    from PIL import Image, ImageDraw, ImageFont

    dest.parent.mkdir(parents=True, exist_ok=True)
    rng = random.Random(hash((food.item_identity, variant)) & 0xFFFFFFFF)
    w = h = 640
    img = Image.new("RGB", (w, h), (20 + variant * 3, 24, 28))
    draw = ImageDraw.Draw(img)
    # Table texture
    for _ in range(80):
        x, y = rng.randint(0, w), rng.randint(0, h)
        draw.ellipse((x, y, x + rng.randint(2, 8), y + rng.randint(2, 8)), fill=(40, 44, 48))
    # Plate
    margin = 70 + variant * 5
    plate = [margin, margin, w - margin, h - margin]
    draw.ellipse(plate, fill=(230, 230, 225), outline=(200, 200, 195), width=4)
    # Food mound
    r, g, b = food.plate_color
    cx, cy = w // 2 + rng.randint(-20, 20), h // 2 + rng.randint(-20, 20)
    rad = 140 + rng.randint(-20, 40)
    draw.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=(r, g, b))
    for _ in range(12):
        ox, oy = rng.randint(-rad + 20, rad - 20), rng.randint(-rad + 20, rad - 20)
        rr = rng.randint(12, 35)
        draw.ellipse(
            (cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr),
            fill=(max(0, r - 30), max(0, g - 20), max(0, b - 10)),
        )
    # Label watermark (tiny — not relied on for training identity)
    draw.text((24, 24), food.name_en[:18], fill=(180, 220, 200))
    img.save(dest, quality=90)
    return dest


def download_demo_images(
    foods: Sequence[DemoFood],
    cache_dir: Path,
    *,
    synthetic_fallback: bool = True,
    synthetic_per_class: int = 6,
) -> dict[str, list[Path]]:
    """Download images grouped by item_identity; synthesize if downloads fail."""
    out: dict[str, list[Path]] = {}
    for food in tqdm(foods, desc="demo-download"):
        folder = cache_dir / _safe_name(food.item_identity)
        folder.mkdir(parents=True, exist_ok=True)
        kept: list[Path] = []
        for i, url in enumerate(food.image_urls):
            dest = folder / f"src_{i:02d}.jpg"
            if download_url(url, dest):
                result = validate_image(dest)
                if result.ok:
                    kept.append(dest)
                else:
                    dest.unlink(missing_ok=True)
                    logger.info("Rejected %s (%s)", url, result.reason)
        if len(kept) < 2 and synthetic_fallback:
            need = max(synthetic_per_class - len(kept), 2)
            for v in range(need):
                dest = folder / f"synth_{v:02d}.jpg"
                make_synthetic_plate(dest, food, v)
                result = validate_image(dest)
                if result.ok:
                    kept.append(dest)
        if kept:
            out[food.item_identity] = kept
        else:
            logger.warning("No valid images for %s", food.item_identity)
    return out


def build_label_map_from_demo(foods: Sequence[DemoFood]) -> LabelMap:
    classes = [
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
            image_count=len(f.image_urls),
        )
        for i, f in enumerate(foods)
    ]
    return LabelMap(classes=classes)


def _split(paths: list[Path], seed: int = 42) -> dict[str, list[Path]]:
    rng = random.Random(seed)
    items = list(paths)
    rng.shuffle(items)
    n = len(items)
    if n == 1:
        return {"train": items, "val": items, "test": items}
    if n == 2:
        return {"train": [items[0]], "val": [items[1]], "test": [items[1]]}
    n_train = max(1, int(n * settings.train_split))
    n_val = max(1, int(n * settings.val_split))
    train = items[:n_train]
    val = items[n_train : n_train + n_val] or items[-1:]
    test = items[n_train + n_val :] or items[-1:]
    return {"train": train, "val": val, "test": test}


def generate_demo_dataset(
    *,
    dataset_name: str = "demo_yolo",
    max_classes: int = 0,
    augment: bool = True,
    aug_per_image: int = 3,
) -> Path:
    foods = list(DEMO_FOODS)
    if max_classes > 0:
        foods = foods[:max_classes]

    cache_dir = settings.image_cache_dir / "demo"
    cache_dir.mkdir(parents=True, exist_ok=True)
    paths = download_demo_images(foods, cache_dir)

    # Keep only foods that downloaded at least one image
    foods = [f for f in foods if f.item_identity in paths]
    if not foods:
        raise RuntimeError("No demo images downloaded — check network / Wikimedia URLs")

    label_map = build_label_map_from_demo(foods)
    dataset_dir = settings.dataset_output_dir / dataset_name
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir)

    for split in ("train", "val", "test"):
        (dataset_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (dataset_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    counts = {"train": 0, "val": 0, "test": 0}
    identity_to_id = label_map.identity_to_id()
    for food in foods:
        class_id = identity_to_id[food.item_identity]
        src_paths = list(paths[food.item_identity])
        if augment:
            aug_dir = cache_dir / _safe_name(food.item_identity) / "aug"
            aug_dir.mkdir(parents=True, exist_ok=True)
            for src in list(src_paths):
                src_paths.extend(
                    generate_augmented_copies(src, aug_dir, n=aug_per_image)
                )
        splits = _split(src_paths)
        for split, split_paths in splits.items():
            for src in split_paths:
                stem = f"{_safe_name(food.item_identity)}_{src.stem}_{split}_{counts[split]}"
                img_dest = dataset_dir / "images" / split / f"{stem}{src.suffix.lower()}"
                lbl_dest = dataset_dir / "labels" / split / f"{stem}.txt"
                shutil.copy2(src, img_dest)
                write_yolo_label(lbl_dest, class_id)
                counts[split] += 1

    write_labels_json(label_map, dataset_dir / "labels.json")

    data_yaml = {
        "path": str(dataset_dir.resolve()),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {c.class_id: c.item_identity for c in label_map.classes},
        "nc": label_map.num_classes,
    }
    (dataset_dir / "data.yaml").write_text(
        yaml.safe_dump(data_yaml, sort_keys=False), encoding="utf-8"
    )

    # Nutrition seed for Supabase / mobile
    seed = [
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
    import json

    seed_path = dataset_dir / "nutrition_seed.json"
    seed_path.write_text(json.dumps(seed, ensure_ascii=False, indent=2), encoding="utf-8")

    meta = {
        "source": "demo_wikimedia",
        "farq": False,
        "class_count": label_map.num_classes,
        "splits": counts,
        "note": "Bootstrap dataset — swap to Farq read-only when credentials exist",
    }
    (dataset_dir / "dataset_meta.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )

    logger.info(
        "Demo dataset ready at %s (%d classes, splits=%s)",
        dataset_dir,
        label_map.num_classes,
        counts,
    )
    return dataset_dir


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description="Generate Farq-free demo YOLO dataset")
    parser.add_argument("--name", default="demo_yolo")
    parser.add_argument("--max-classes", type=int, default=0)
    parser.add_argument("--no-augment", action="store_true")
    parser.add_argument("--aug-per-image", type=int, default=3)
    args = parser.parse_args(argv)

    # Ensure package imports resolve when run as module
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

    generate_demo_dataset(
        dataset_name=args.name,
        max_classes=args.max_classes,
        augment=not args.no_augment,
        aug_per_image=args.aug_per_image,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
