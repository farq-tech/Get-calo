"""Class label assignment from canonical item_identity.

NEVER use provider_items as classes — always train on item_identity.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from dataset.farq_client import IdentityGroup

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ClassLabel:
    class_id: int
    item_identity: str
    name_en: str = ""
    name_ar: str = ""
    calories: float | None = None
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None
    serving_size_g: float | None = None
    category: str = ""
    image_count: int = 0


@dataclass
class LabelMap:
    """Contiguous class_id ↔ item_identity mapping plus nutrition rows."""

    classes: list[ClassLabel]

    @property
    def num_classes(self) -> int:
        return len(self.classes)

    def identity_to_id(self) -> dict[str, int]:
        return {c.item_identity: c.class_id for c in self.classes}

    def id_to_identity(self) -> dict[int, str]:
        return {c.class_id: c.item_identity for c in self.classes}

    def names_list(self) -> list[str]:
        """YOLO names: prefer English name, fall back to identity."""
        names: list[str] = []
        for c in self.classes:
            label = c.name_en.strip() or c.item_identity
            names.append(label)
        return names

    def to_dict(self) -> dict[str, Any]:
        return {
            "num_classes": self.num_classes,
            "classes": [asdict(c) for c in self.classes],
            "note": (
                "Classes are canonical item_identity values. "
                "Never use provider_items as class labels. "
                "Multiple provider images for the same food share one class_id."
            ),
        }


def build_label_map(
    groups: Mapping[str, IdentityGroup],
    *,
    image_counts: Mapping[str, int] | None = None,
    identities: Sequence[str] | None = None,
) -> LabelMap:
    """Assign contiguous class_id starting at 0 for each item_identity.

    If ``identities`` is provided, only those identities (in that order) are
    included; otherwise sorted identity keys are used for determinism.
    """
    counts = image_counts or {}
    ordered = list(identities) if identities is not None else sorted(groups.keys())
    classes: list[ClassLabel] = []
    for class_id, identity in enumerate(ordered):
        g = groups[identity]
        classes.append(
            ClassLabel(
                class_id=class_id,
                item_identity=identity,
                name_en=g.name_en,
                name_ar=g.name_ar,
                calories=g.calories,
                protein=g.protein,
                carbs=g.carbs,
                fat=g.fat,
                serving_size_g=g.serving_size_g,
                category=g.category,
                image_count=int(counts.get(identity, len(g.image_urls))),
            )
        )
    label_map = LabelMap(classes=classes)
    logger.info("Built label map with %d classes (item_identity)", label_map.num_classes)
    return label_map


def write_labels_json(label_map: LabelMap, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(label_map.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Wrote labels.json → %s", path)
    return path


def write_nutrition_rows(label_map: LabelMap, path: Path) -> Path:
    """Write nutrition sidecar JSON (one row per class / item_identity)."""
    rows = []
    for c in label_map.classes:
        rows.append(
            {
                "class_id": c.class_id,
                "item_identity": c.item_identity,
                "name_en": c.name_en,
                "name_ar": c.name_ar,
                "calories": c.calories,
                "protein": c.protein,
                "carbs": c.carbs,
                "fat": c.fat,
                "serving_size_g": c.serving_size_g,
                "category": c.category,
            }
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Wrote nutrition rows → %s", path)
    return path


def load_labels_json(path: Path) -> LabelMap:
    data = json.loads(path.read_text(encoding="utf-8"))
    classes = [ClassLabel(**row) for row in data["classes"]]
    return LabelMap(classes=classes)
