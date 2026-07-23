"""Full dataset generation pipeline for YOLO training.

Orchestrates: Farq fetch → download → validate → group → labels → YOLO folder
structure with synthetic single-object boxes.

Assumption
----------
Farq product photos have no ground-truth bounding boxes. We treat each image as
a single-object classification-detection sample and write a centered YOLO box
covering ~90% of the frame::

    class_id  0.5  0.5  0.9  0.9

CLI::

    cd /agent/ml && python -m dataset.generate
"""

from __future__ import annotations

import argparse
import logging
import random
import shutil
from pathlib import Path
from typing import Sequence

import yaml
from tqdm import tqdm

from config.settings import settings
from dataset.augment import generate_augmented_copies
from dataset.dedupe import dedupe_identity_image_map
from dataset.download_images import download_all_groups_sync
from dataset.farq_client import IdentityGroup, fetch_identity_groups
from dataset.labels import (
    LabelMap,
    build_label_map,
    write_labels_json,
    write_nutrition_rows,
)
from dataset.validate import validate_identity_dirs

logger = logging.getLogger(__name__)

# Synthetic full-frame food photo box (classification-as-detection).
SYNTHETIC_BOX = (0.5, 0.5, 0.9, 0.9)  # x_center, y_center, w, h (normalized)


def write_yolo_label(path: Path, class_id: int) -> None:
    """Write a single centered ~90% box for the given class."""
    xc, yc, w, h = SYNTHETIC_BOX
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n", encoding="utf-8")


def _filter_groups_by_min_images(
    paths: dict[str, list[Path]],
    groups: dict[str, IdentityGroup],
    *,
    min_images: int,
    max_classes: int,
) -> tuple[dict[str, IdentityGroup], dict[str, list[Path]]]:
    eligible = {
        k: v for k, v in paths.items() if len(v) >= min_images and k in groups
    }
    # Prefer identities with more images, then stable identity order
    ranked = sorted(eligible.keys(), key=lambda i: (-len(eligible[i]), i))
    if max_classes > 0:
        ranked = ranked[:max_classes]
    filtered_groups = {i: groups[i] for i in ranked}
    filtered_paths = {i: eligible[i] for i in ranked}
    logger.info(
        "Kept %d identities with ≥%d images (max_classes=%d)",
        len(filtered_groups),
        min_images,
        max_classes,
    )
    return filtered_groups, filtered_paths


def _augment_to_min(
    identity_paths: dict[str, list[Path]],
    *,
    min_images: int,
    aug_dir: Path,
) -> dict[str, list[Path]]:
    """Synthetically expand classes that are still short after download."""
    out: dict[str, list[Path]] = {}
    for identity, paths in identity_paths.items():
        current = list(paths)
        if len(current) >= min_images:
            out[identity] = current
            continue
        need = min_images - len(current)
        dest = aug_dir / identity.replace("/", "_")[:64]
        dest.mkdir(parents=True, exist_ok=True)
        generated: list[Path] = []
        src_cycle = list(current)
        idx = 0
        while len(generated) < need and src_cycle:
            src = src_cycle[idx % len(src_cycle)]
            batch = generate_augmented_copies(
                src, dest, n=1, prefix=f"aug{idx:03d}"
            )
            generated.extend(batch)
            idx += 1
            if idx > need * 5:
                break
        out[identity] = current + generated
        logger.debug(
            "Augmented %s: %d → %d",
            identity,
            len(current),
            len(out[identity]),
        )
    return out


def stratified_split_paths(
    identity_paths: dict[str, list[Path]],
    *,
    train_ratio: float,
    val_ratio: float,
    test_ratio: float,
    seed: int = 42,
) -> dict[str, list[tuple[str, Path]]]:
    """Stratified split preserving identity membership across splits.

    Returns mapping split → list of (identity, path).
    """
    total = train_ratio + val_ratio + test_ratio
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"Splits must sum to 1.0, got {total}")

    rng = random.Random(seed)
    splits: dict[str, list[tuple[str, Path]]] = {
        "train": [],
        "val": [],
        "test": [],
    }

    for identity, paths in identity_paths.items():
        items = list(paths)
        rng.shuffle(items)
        n = len(items)
        if n == 1:
            splits["train"].append((identity, items[0]))
            continue
        if n == 2:
            splits["train"].append((identity, items[0]))
            splits["val"].append((identity, items[1]))
            continue

        # First carve test, then val from remainder — stratified by identity
        test_n = max(1, int(round(n * test_ratio))) if test_ratio > 0 else 0
        val_n = max(1, int(round(n * val_ratio))) if val_ratio > 0 else 0
        if test_n + val_n >= n:
            test_n = 1 if test_ratio > 0 else 0
            val_n = 1 if val_ratio > 0 and n - test_n > 1 else 0
        train_n = n - test_n - val_n

        train_items = items[:train_n]
        val_items = items[train_n : train_n + val_n]
        test_items = items[train_n + val_n :]

        splits["train"].extend((identity, p) for p in train_items)
        splits["val"].extend((identity, p) for p in val_items)
        splits["test"].extend((identity, p) for p in test_items)

    for name, pairs in splits.items():
        logger.info("Split %-5s: %d images", name, len(pairs))
    return splits


def materialize_yolo_dataset(
    splits: dict[str, list[tuple[str, Path]]],
    label_map: LabelMap,
    dataset_dir: Path,
) -> Path:
    """Copy images and write YOLO label files + data.yaml."""
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir)
    id_map = label_map.identity_to_id()

    for split, pairs in splits.items():
        img_dir = dataset_dir / "images" / split
        lbl_dir = dataset_dir / "labels" / split
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)

        for identity, src in tqdm(pairs, desc=f"Writing {split}", leave=False):
            class_id = id_map[identity]
            stem = f"{class_id:05d}_{src.stem}"
            # Normalize extension to keep YOLO happy
            dest_img = img_dir / f"{stem}{src.suffix.lower()}"
            if dest_img.suffix not in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
                dest_img = img_dir / f"{stem}.jpg"
            shutil.copy2(src, dest_img)
            write_yolo_label(lbl_dir / f"{dest_img.stem}.txt", class_id)

    data_yaml = {
        "path": str(dataset_dir.resolve()),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "nc": label_map.num_classes,
        "names": label_map.names_list(),
        # Document synthetic box assumption for consumers
        "synthetic_box": {
            "x_center": SYNTHETIC_BOX[0],
            "y_center": SYNTHETIC_BOX[1],
            "width": SYNTHETIC_BOX[2],
            "height": SYNTHETIC_BOX[3],
            "note": (
                "Product photos lack GT bboxes; each image is a single-object "
                "sample with a centered box covering ~90% of the frame."
            ),
        },
        "class_key": "item_identity",
        "farq_readonly": True,
    }
    yaml_path = dataset_dir / "data.yaml"
    yaml_path.write_text(
        yaml.safe_dump(data_yaml, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    write_labels_json(label_map, dataset_dir / "labels.json")
    write_nutrition_rows(label_map, dataset_dir / "nutrition.json")
    logger.info("Dataset ready at %s", dataset_dir)
    return dataset_dir


def generate_dataset(
    *,
    output_dir: Path | None = None,
    dataset_name: str = "farq_yolo",
    min_images_per_class: int | None = None,
    max_classes: int | None = None,
    augment_shortfall: bool = True,
    seed: int = 42,
) -> Path:
    """Run the full Farq → YOLO dataset pipeline (Farq is read-only)."""
    min_images = min_images_per_class or settings.min_images_per_class
    max_cls = max_classes if max_classes is not None else settings.max_classes
    out_root = output_dir or settings.dataset_output_dir
    dataset_dir = out_root / dataset_name

    logger.info("Fetching Farq identity groups (read-only)…")
    groups = fetch_identity_groups()
    if not groups:
        raise RuntimeError("No Farq identity groups found — check credentials/schema")

    logger.info("Downloading images…")
    raw_paths = download_all_groups_sync(groups)

    logger.info("Validating images…")
    valid_paths = validate_identity_dirs(raw_paths, remove_bad=True, dedupe=True)
    valid_paths = dedupe_identity_image_map(valid_paths)

    groups, valid_paths = _filter_groups_by_min_images(
        valid_paths,
        groups,
        min_images=1 if augment_shortfall else min_images,
        max_classes=max_cls,
    )
    if not groups:
        raise RuntimeError("No identities left after filtering")

    if augment_shortfall:
        aug_dir = settings.image_cache_dir.parent / "augmented"
        valid_paths = _augment_to_min(
            valid_paths, min_images=min_images, aug_dir=aug_dir
        )
        # Re-filter after augmentation
        groups, valid_paths = _filter_groups_by_min_images(
            valid_paths,
            groups,
            min_images=min_images,
            max_classes=max_cls,
        )

    counts = {i: len(p) for i, p in valid_paths.items()}
    label_map = build_label_map(groups, image_counts=counts, identities=sorted(groups))

    splits = stratified_split_paths(
        valid_paths,
        train_ratio=settings.train_split,
        val_ratio=settings.val_split,
        test_ratio=settings.test_split,
        seed=seed,
    )
    return materialize_yolo_dataset(splits, label_map, dataset_dir)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Build YOLO dataset from Farq (read-only). Classes = item_identity. "
            "Synthetic boxes: centered 0.5,0.5,0.9,0.9."
        )
    )
    p.add_argument("--name", default="farq_yolo", help="Dataset folder name")
    p.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Parent directory for datasets (default: settings.dataset_output_dir)",
    )
    p.add_argument("--min-images", type=int, default=None)
    p.add_argument("--max-classes", type=int, default=None)
    p.add_argument("--no-augment", action="store_true")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    path = generate_dataset(
        output_dir=args.output_dir,
        dataset_name=args.name,
        min_images_per_class=args.min_images,
        max_classes=args.max_classes,
        augment_shortfall=not args.no_augment,
        seed=args.seed,
    )
    print(f"Dataset written to {path}")


if __name__ == "__main__":
    main()
