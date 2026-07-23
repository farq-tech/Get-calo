"""Image validation and quality filtering.

Removes broken/corrupt files, images that are too small, wrong aspect ratio,
low-sharpness (Laplacian variance), and perceptual-hash near-duplicates.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import cv2
import imagehash
import numpy as np
from PIL import Image, UnidentifiedImageError

from config.settings import settings

logger = logging.getLogger(__name__)

# Default Laplacian variance gate for "too blurry"
DEFAULT_MIN_LAPLACIAN_VAR = 40.0


@dataclass(frozen=True)
class ValidationResult:
    path: Path
    ok: bool
    reason: str = ""
    width: int = 0
    height: int = 0
    laplacian_var: float = 0.0
    phash: str = ""


def load_bgr(path: Path) -> np.ndarray | None:
    """Load image as BGR via OpenCV; returns None if unreadable."""
    try:
        data = np.fromfile(str(path), dtype=np.uint8)
        if data.size == 0:
            return None
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
        return img
    except Exception:  # noqa: BLE001
        return None


def load_pil(path: Path) -> Image.Image | None:
    try:
        img = Image.open(path)
        img.load()
        return img.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        return None


def laplacian_variance(bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def compute_phash(path: Path | Image.Image) -> str | None:
    try:
        if isinstance(path, Image.Image):
            img = path
        else:
            img = load_pil(path)
            if img is None:
                return None
        return str(imagehash.phash(img))
    except Exception:  # noqa: BLE001
        return None


def phash_hamming(a: str, b: str) -> int:
    return imagehash.hex_to_hash(a) - imagehash.hex_to_hash(b)


def validate_image(
    path: Path,
    *,
    min_side: int | None = None,
    max_aspect_ratio: float | None = None,
    min_laplacian_var: float = DEFAULT_MIN_LAPLACIAN_VAR,
) -> ValidationResult:
    """Validate a single image file against quality gates."""
    min_side = min_side if min_side is not None else settings.min_image_side
    max_ar = (
        max_aspect_ratio
        if max_aspect_ratio is not None
        else settings.max_aspect_ratio
    )

    if not path.exists() or path.stat().st_size == 0:
        return ValidationResult(path, False, "missing_or_empty")

    pil = load_pil(path)
    if pil is None:
        return ValidationResult(path, False, "corrupt_or_unreadable")

    width, height = pil.size
    if width < min_side or height < min_side:
        return ValidationResult(
            path, False, "too_small", width=width, height=height
        )

    aspect = max(width, height) / max(1, min(width, height))
    if aspect > max_ar:
        return ValidationResult(
            path,
            False,
            "bad_aspect_ratio",
            width=width,
            height=height,
        )

    bgr = load_bgr(path)
    if bgr is None:
        return ValidationResult(
            path, False, "opencv_unreadable", width=width, height=height
        )

    lap = laplacian_variance(bgr)
    if lap < min_laplacian_var:
        return ValidationResult(
            path,
            False,
            "low_quality_blur",
            width=width,
            height=height,
            laplacian_var=lap,
        )

    ph = compute_phash(pil) or ""
    return ValidationResult(
        path,
        True,
        "ok",
        width=width,
        height=height,
        laplacian_var=lap,
        phash=ph,
    )


def filter_near_duplicates(
    results: Sequence[ValidationResult],
    *,
    threshold: int | None = None,
) -> list[ValidationResult]:
    """Keep first occurrence; mark later near-duplicates as not ok.

    Operates on already-validated (ok) results; returns a new list with
    duplicates flipped to ``ok=False`` and reason ``phash_duplicate``.
    """
    thr = (
        threshold
        if threshold is not None
        else settings.phash_duplicate_threshold
    )
    kept_hashes: list[str] = []
    out: list[ValidationResult] = []

    for r in results:
        if not r.ok:
            out.append(r)
            continue
        if not r.phash:
            out.append(r)
            continue
        is_dup = any(phash_hamming(r.phash, h) <= thr for h in kept_hashes)
        if is_dup:
            out.append(
                ValidationResult(
                    path=r.path,
                    ok=False,
                    reason="phash_duplicate",
                    width=r.width,
                    height=r.height,
                    laplacian_var=r.laplacian_var,
                    phash=r.phash,
                )
            )
        else:
            kept_hashes.append(r.phash)
            out.append(r)
    return out


def validate_paths(
    paths: Iterable[Path],
    *,
    remove_bad: bool = False,
    dedupe: bool = True,
    min_side: int | None = None,
    max_aspect_ratio: float | None = None,
    min_laplacian_var: float = DEFAULT_MIN_LAPLACIAN_VAR,
    phash_threshold: int | None = None,
) -> tuple[list[Path], list[ValidationResult]]:
    """Validate a collection of image paths.

    Returns ``(good_paths, all_results)``. If ``remove_bad`` is True,
    failing files are deleted from disk.
    """
    raw_results = [
        validate_image(
            p,
            min_side=min_side,
            max_aspect_ratio=max_aspect_ratio,
            min_laplacian_var=min_laplacian_var,
        )
        for p in paths
    ]
    results = (
        filter_near_duplicates(raw_results, threshold=phash_threshold)
        if dedupe
        else raw_results
    )

    good: list[Path] = []
    for r in results:
        if r.ok:
            good.append(r.path)
        elif remove_bad and r.path.exists():
            try:
                r.path.unlink()
                logger.debug("Removed bad image %s (%s)", r.path, r.reason)
            except OSError as exc:
                logger.warning("Failed to remove %s: %s", r.path, exc)

    logger.info(
        "Validated images: %d good / %d total",
        len(good),
        len(results),
    )
    return good, results


def validate_identity_dirs(
    identity_paths: dict[str, list[Path]],
    *,
    remove_bad: bool = True,
    dedupe: bool = True,
) -> dict[str, list[Path]]:
    """Validate per-identity image lists; optionally prune bad files."""
    cleaned: dict[str, list[Path]] = {}
    for identity, paths in identity_paths.items():
        good, _ = validate_paths(paths, remove_bad=remove_bad, dedupe=dedupe)
        cleaned[identity] = good
    return cleaned
