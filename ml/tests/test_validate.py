"""Unit tests for image validation helpers (synthetic images)."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from dataset.validate import (
    filter_near_duplicates,
    laplacian_variance,
    validate_image,
    validate_paths,
)


def _write_bgr(path: Path, bgr: np.ndarray) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
    assert ok
    encoded.tofile(str(path))
    return path


def _sharp_image(size: int = 256, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    # High-frequency checkerboard → high Laplacian variance
    tile = 8
    yy, xx = np.indices((size, size))
    checker = ((xx // tile + yy // tile) % 2) * 255
    noise = rng.integers(0, 40, (size, size), dtype=np.uint8)
    gray = np.clip(checker.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def _blurry_image(size: int = 256) -> np.ndarray:
    img = _sharp_image(size, seed=1)
    return cv2.GaussianBlur(img, (51, 51), 0)


def test_validate_ok_sharp_image(tmp_path: Path) -> None:
    path = _write_bgr(tmp_path / "ok.jpg", _sharp_image())
    result = validate_image(path, min_laplacian_var=40.0)
    assert result.ok
    assert result.reason == "ok"
    assert result.width == 256
    assert result.height == 256
    assert result.phash


def test_reject_too_small(tmp_path: Path) -> None:
    path = _write_bgr(tmp_path / "tiny.jpg", _sharp_image(64))
    result = validate_image(path, min_side=128)
    assert not result.ok
    assert result.reason == "too_small"


def test_reject_bad_aspect_ratio(tmp_path: Path) -> None:
    # 400x100 → aspect 4.0
    img = np.zeros((100, 400, 3), dtype=np.uint8)
    img[:, :] = (40, 180, 90)
    # Add some edges so blur gate is not the failure mode
    img[:, 50::50] = 255
    path = _write_bgr(tmp_path / "wide.jpg", img)
    result = validate_image(path, min_side=64, max_aspect_ratio=3.0, min_laplacian_var=1.0)
    assert not result.ok
    assert result.reason == "bad_aspect_ratio"


def test_reject_blurry(tmp_path: Path) -> None:
    path = _write_bgr(tmp_path / "blur.jpg", _blurry_image())
    result = validate_image(path, min_laplacian_var=100.0)
    assert not result.ok
    assert result.reason == "low_quality_blur"
    assert result.laplacian_var < 100.0


def test_reject_corrupt(tmp_path: Path) -> None:
    path = tmp_path / "corrupt.jpg"
    path.write_bytes(b"not-an-image")
    result = validate_image(path)
    assert not result.ok
    assert result.reason == "corrupt_or_unreadable"


def test_reject_empty(tmp_path: Path) -> None:
    path = tmp_path / "empty.jpg"
    path.write_bytes(b"")
    result = validate_image(path)
    assert not result.ok
    assert result.reason == "missing_or_empty"


def test_laplacian_variance_higher_for_sharp() -> None:
    sharp = laplacian_variance(_sharp_image())
    blurry = laplacian_variance(_blurry_image())
    assert sharp > blurry


def test_phash_near_duplicates(tmp_path: Path) -> None:
    base = _sharp_image(seed=7)
    a = _write_bgr(tmp_path / "a.jpg", base)
    # Exact byte-identical copy → guaranteed phash match
    b = tmp_path / "b.jpg"
    b.write_bytes(a.read_bytes())
    different = _write_bgr(tmp_path / "c.jpg", _sharp_image(seed=99))

    good, results = validate_paths(
        [a, b, different],
        remove_bad=False,
        dedupe=True,
        min_laplacian_var=20.0,
        phash_threshold=6,
    )
    assert a in good
    assert different in good
    assert b not in good
    assert sum(1 for r in results if r.reason == "phash_duplicate") >= 1


def test_filter_near_duplicates_keeps_first(tmp_path: Path) -> None:
    from dataset.validate import ValidationResult

    results = [
        ValidationResult(tmp_path / "1.jpg", True, "ok", phash="ffffffffffffffff"),
        ValidationResult(tmp_path / "2.jpg", True, "ok", phash="fffffffffffffffe"),
        ValidationResult(tmp_path / "3.jpg", True, "ok", phash="0000000000000000"),
    ]
    filtered = filter_near_duplicates(results, threshold=2)
    assert filtered[0].ok
    assert not filtered[1].ok
    assert filtered[1].reason == "phash_duplicate"
    assert filtered[2].ok


def test_validate_paths_remove_bad(tmp_path: Path) -> None:
    good_path = _write_bgr(tmp_path / "good.jpg", _sharp_image())
    bad_path = tmp_path / "bad.jpg"
    bad_path.write_bytes(b"nope")
    good, _ = validate_paths([good_path, bad_path], remove_bad=True, dedupe=False)
    assert good == [good_path]
    assert good_path.exists()
    assert not bad_path.exists()
