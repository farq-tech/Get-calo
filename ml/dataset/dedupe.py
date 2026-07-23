"""Identity-level and perceptual-hash deduplication helpers."""

from __future__ import annotations

import logging
from collections import defaultdict
from pathlib import Path
from typing import Iterable

from config.settings import settings
from dataset.validate import (
    ValidationResult,
    compute_phash,
    filter_near_duplicates,
    phash_hamming,
    validate_image,
)

logger = logging.getLogger(__name__)


def dedupe_urls(urls: Iterable[str]) -> list[str]:
    """Stable unique URL list preserving first-seen order."""
    seen: set[str] = set()
    out: list[str] = []
    for url in urls:
        cleaned = (url or "").strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        out.append(cleaned)
    return out


def dedupe_paths_by_name(paths: Iterable[Path]) -> list[Path]:
    """Drop duplicate paths by resolved absolute path."""
    seen: set[Path] = set()
    out: list[Path] = []
    for p in paths:
        key = p.resolve()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def dedupe_by_phash(
    paths: Iterable[Path],
    *,
    threshold: int | None = None,
) -> list[Path]:
    """Keep one image per near-duplicate cluster using perceptual hash."""
    thr = (
        threshold
        if threshold is not None
        else settings.phash_duplicate_threshold
    )
    results: list[ValidationResult] = []
    for path in paths:
        r = validate_image(path)
        if not r.ok and r.reason not in {"low_quality_blur", "too_small", "bad_aspect_ratio"}:
            # Still try phash if readable enough; otherwise skip
            ph = compute_phash(path)
            if ph is None:
                continue
            results.append(
                ValidationResult(path=path, ok=True, reason="ok", phash=ph)
            )
        elif r.ok:
            results.append(r)
        else:
            # include failed quality images only if we can hash (caller may filter later)
            continue

    filtered = filter_near_duplicates(results, threshold=thr)
    kept = [r.path for r in filtered if r.ok]
    logger.info(
        "phash dedupe: %d → %d (threshold=%d)",
        len(results),
        len(kept),
        thr,
    )
    return kept


def cluster_identities_by_phash(
    identity_paths: dict[str, list[Path]],
    *,
    threshold: int | None = None,
) -> dict[str, list[str]]:
    """Find identities whose representative images are near-duplicates.

    Returns mapping of identity → list of other identities that look similar.
    Useful for auditing; does NOT merge classes (classes stay on item_identity).
    """
    thr = (
        threshold
        if threshold is not None
        else settings.phash_duplicate_threshold
    )
    reps: dict[str, str] = {}
    for identity, paths in identity_paths.items():
        for path in paths:
            ph = compute_phash(path)
            if ph:
                reps[identity] = ph
                break

    similar: dict[str, list[str]] = defaultdict(list)
    identities = list(reps.keys())
    for i, a in enumerate(identities):
        for b in identities[i + 1 :]:
            if phash_hamming(reps[a], reps[b]) <= thr:
                similar[a].append(b)
                similar[b].append(a)

    if similar:
        logger.warning(
            "Found %d identities with cross-identity visual near-duplicates",
            len(similar),
        )
    return dict(similar)


def dedupe_identity_image_map(
    identity_paths: dict[str, list[Path]],
    *,
    threshold: int | None = None,
) -> dict[str, list[Path]]:
    """Path + phash dedupe within each item_identity (one class)."""
    out: dict[str, list[Path]] = {}
    for identity, paths in identity_paths.items():
        unique = dedupe_paths_by_name(paths)
        out[identity] = dedupe_by_phash(unique, threshold=threshold)
    return out
