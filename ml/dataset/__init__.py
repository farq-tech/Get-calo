"""Dataset generation: Farq fetch, download, validate, label, augment, YOLO layout."""

from __future__ import annotations

__all__ = [
    "ClassLabel",
    "LabelMap",
    "build_label_map",
    "write_labels_json",
]


def __getattr__(name: str):
    if name in {"ClassLabel", "LabelMap", "build_label_map", "write_labels_json"}:
        from dataset import labels as _labels

        return getattr(_labels, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
