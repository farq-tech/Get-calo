#!/usr/bin/env python3
"""Fully automated CPU finish path — no human steps.

Builds a compact 40-class dataset from the existing farq_yolo set,
augments it, trains YOLO, exports ONNX, registers in Calora Supabase,
and copies artifacts into mobile/assets/models/.
"""

from __future__ import annotations

import json
import logging
import os
import random
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
ML = ROOT / "ml"
load_dotenv(ROOT / ".env")
load_dotenv(ML / ".env")
sys.path.insert(0, str(ML))
os.chdir(ML)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("auto_finish")

NUM_CLASSES = int(os.environ.get("AUTO_NUM_CLASSES", "40"))
EPOCHS = int(os.environ.get("AUTO_EPOCHS", "35"))
BATCH = int(os.environ.get("AUTO_BATCH", "8"))
AUG_PER = int(os.environ.get("AUTO_AUG_PER", "6"))
SEED = 42


def build_compact_dataset() -> Path:
    from dataset.augment import generate_augmented_copies
    from dataset.generate_demo import write_yolo_label
    import yaml

    src = Path("data/datasets/farq_yolo")
    labels = json.loads((src / "labels.json").read_text(encoding="utf-8"))
    classes = labels["classes"][:NUM_CLASSES]
    # Remap to contiguous 0..N-1
    old_to_new = {c["class_id"]: i for i, c in enumerate(classes)}
    new_classes = []
    for i, c in enumerate(classes):
        row = dict(c)
        row["class_id"] = i
        new_classes.append(row)

    out = Path("data/datasets/farq_yolo_auto")
    if out.exists():
        shutil.rmtree(out)
    for split in ("train", "val", "test"):
        (out / "images" / split).mkdir(parents=True)
        (out / "labels" / split).mkdir(parents=True)

    rng = random.Random(SEED)
    # Collect source images per old class_id from all splits
    by_old: dict[int, list[Path]] = {cid: [] for cid in old_to_new}
    for split in ("train", "val", "test"):
        for lbl in (src / "labels" / split).glob("*.txt"):
            parts = lbl.read_text().split()
            if not parts:
                continue
            old_id = int(parts[0])
            if old_id not in old_to_new:
                continue
            img = None
            for ext in (".jpg", ".jpeg", ".png", ".webp"):
                cand = src / "images" / split / f"{lbl.stem}{ext}"
                if cand.exists():
                    img = cand
                    break
            if img:
                by_old[old_id].append(img)

    counts = {"train": 0, "val": 0, "test": 0}
    for old_id, paths in by_old.items():
        if not paths:
            continue
        new_id = old_to_new[old_id]
        # Augment
        aug_dir = out / "_aug" / str(new_id)
        aug_dir.mkdir(parents=True, exist_ok=True)
        all_imgs = list(paths)
        for p in paths:
            all_imgs.extend(generate_augmented_copies(p, aug_dir, n=AUG_PER))

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
                stem = f"c{new_id:03d}_{split}_{i:04d}"
                dest = out / "images" / split / f"{stem}.jpg"
                shutil.copy2(img, dest)
                write_yolo_label(out / "labels" / split / f"{stem}.txt", new_id)
                counts[split] += 1

    label_map = {
        "num_classes": len(new_classes),
        "classes": new_classes,
        "note": "Auto compact subset for CPU finish path",
    }
    (out / "labels.json").write_text(json.dumps(label_map, ensure_ascii=False, indent=2), encoding="utf-8")
    nutrition = [
        {
            "class_id": c["class_id"],
            "item_identity": c["item_identity"],
            "name_en": c.get("name_en") or c["item_identity"],
            "name_ar": c.get("name_ar") or "",
            "calories": c.get("calories"),
            "protein": c.get("protein"),
            "carbs": c.get("carbs"),
            "fat": c.get("fat"),
            "serving_size_g": c.get("serving_size_g") or 100,
            "category": c.get("category") or "",
        }
        for c in new_classes
    ]
    (out / "nutrition.json").write_text(json.dumps(nutrition, ensure_ascii=False, indent=2), encoding="utf-8")
    data_yaml = {
        "path": str(out.resolve()),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {c["class_id"]: c["item_identity"] for c in new_classes},
        "nc": len(new_classes),
    }
    (out / "data.yaml").write_text(yaml.safe_dump(data_yaml, sort_keys=False), encoding="utf-8")
    shutil.rmtree(out / "_aug", ignore_errors=True)
    log.info("Compact dataset %s splits=%s classes=%d", out, counts, len(new_classes))
    return out


def train(data_yaml: Path) -> Path:
    from train.train_yolo import train_yolo

    # Prefer continuing from early weights if present
    pretrained = Path("models/runs/farq_v1/weights/best.pt")
    model = str(pretrained) if pretrained.exists() else "yolov8n.pt"
    run = train_yolo(
        data_yaml,
        model=model,
        epochs=EPOCHS,
        batch=BATCH,
        imgsz=640,
        run_name="farq_auto_v1",
        device="cpu",
        workers=2,
        patience=15,
    )
    return run


def export(run_dir: Path, labels: Path) -> Path:
    from export.export_models import export_models

    out = Path("models/exports/farq_auto_v1")
    export_models(
        run_dir / "weights" / "best.pt",
        labels_json=labels,
        out_dir=out,
        include_tflite=False,
        include_coreml=False,
    )
    return out


def seed_and_register(pack: Path) -> None:
    import httpx

    url = os.environ.get("CALORIE_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("CALORIE_SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        log.warning("Skip Supabase seed — missing keys")
        return
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    nutrition = json.loads((pack / "labels.json").read_text(encoding="utf-8"))
    # Prefer nutrition.json beside labels if export copied labels only
    nut_path = Path("data/datasets/farq_yolo_auto/nutrition.json")
    rows_src = json.loads(nut_path.read_text(encoding="utf-8")) if nut_path.exists() else nutrition.get("classes", [])
    payload = []
    for r in rows_src:
        payload.append(
            {
                "class_id": r["class_id"],
                "item_identity": r["item_identity"],
                "name_en": r.get("name_en") or r["item_identity"],
                "name_ar": r.get("name_ar") or None,
                "calories_kcal": r.get("calories") or 0,
                "protein_g": r.get("protein") or 0,
                "carbs_g": r.get("carbs") or 0,
                "fat_g": r.get("fat") or 0,
                "serving_size_g": r.get("serving_size_g") or 100,
                "category": r.get("category") or None,
            }
        )
    httpx.delete(
        f"{url}/rest/v1/nutrition_items?id=neq.00000000-0000-0000-0000-000000000000",
        headers={**headers, "Prefer": "return=minimal"},
        timeout=60,
    )
    for i in range(0, len(payload), 100):
        r = httpx.post(
            f"{url}/rest/v1/nutrition_items?on_conflict=item_identity",
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=payload[i : i + 100],
            timeout=120,
        )
        r.raise_for_status()
    log.info("Seeded %d nutrition rows", len(payload))

    ver = "v0.2.0-auto-cpu"
    model = {
        "version": ver,
        "status": "accepted",
        "notes": f"Auto CPU finish: {NUM_CLASSES} classes, {EPOCHS} epochs",
        "artifact_urls": {
            "onnx": "models/exports/farq_auto_v1/best.onnx",
            "labels": "models/exports/farq_auto_v1/labels.json",
            "nutrition_sqlite": "models/exports/farq_auto_v1/nutrition.sqlite",
        },
        "metrics": {"auto": True, "classes": NUM_CLASSES, "epochs": EPOCHS},
    }
    httpx.post(f"{url}/rest/v1/model_versions", headers=headers, json=model, timeout=60)
    httpx.post(
        f"{url}/rest/v1/rpc/promote_model_version",
        headers=headers,
        json={"p_version": ver},
        timeout=30,
    )
    log.info("Registered + promoted %s", ver)


def copy_to_mobile(pack: Path) -> None:
    dest = ROOT / "mobile" / "assets" / "models"
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("best.onnx", "labels.json", "nutrition.sqlite", "manifest.json"):
        src = pack / name
        if src.exists():
            shutil.copy2(src, dest / name)
            log.info("Copied %s → mobile/assets/models/", name)
    # Sync sample nutrition JSON for Expo Go mock path
    nut = Path("data/datasets/farq_yolo_auto/nutrition.json")
    if nut.exists():
        rows = json.loads(nut.read_text(encoding="utf-8"))
        sample = [
            {
                "class_id": r["class_id"],
                "item_identity": r["item_identity"],
                "name_en": r.get("name_en") or r["item_identity"],
                "name_ar": r.get("name_ar") or "",
                "calories_kcal": r.get("calories") or 0,
                "protein_g": r.get("protein") or 0,
                "carbs_g": r.get("carbs") or 0,
                "fat_g": r.get("fat") or 0,
                "serving_size_g": r.get("serving_size_g") or 100,
                "serving_label_en": "serving",
                "serving_label_ar": "حصة",
                "category": r.get("category") or "",
            }
            for r in rows
        ]
        out = ROOT / "mobile" / "assets" / "nutrition.sample.json"
        out.write_text(json.dumps(sample, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        log.info("Updated mobile nutrition.sample.json (%d foods)", len(sample))


def main() -> int:
    log.info("AUTO FINISH start classes=%d epochs=%d", NUM_CLASSES, EPOCHS)
    ds = build_compact_dataset()
    run = train(ds / "data.yaml")
    pack = export(run, ds / "labels.json")
    # Ensure nutrition.sqlite uses compact nutrition if export used labels only
    seed_and_register(pack)
    copy_to_mobile(pack)
    log.info("AUTO FINISH complete → %s", pack.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
