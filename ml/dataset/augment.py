"""Online / offline image augmentations for dataset expansion.

Uses OpenCV and Pillow: rotation, brightness, contrast, blur, noise,
crop, perspective, scale, JPEG compression, and random backgrounds.
"""

from __future__ import annotations

import logging
import random
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
from PIL import Image, ImageEnhance

from dataset.validate import load_bgr

logger = logging.getLogger(__name__)


def _ensure_bgr(image: np.ndarray | Path) -> np.ndarray:
    if isinstance(image, Path):
        bgr = load_bgr(image)
        if bgr is None:
            raise ValueError(f"Cannot load image: {image}")
        return bgr
    return image.copy()


def rotate(bgr: np.ndarray, angle: float | None = None) -> np.ndarray:
    angle = angle if angle is not None else random.uniform(-25, 25)
    h, w = bgr.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(bgr, matrix, (w, h), borderMode=cv2.BORDER_REFLECT_101)


def adjust_brightness(bgr: np.ndarray, factor: float | None = None) -> np.ndarray:
    factor = factor if factor is not None else random.uniform(0.6, 1.4)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    out = ImageEnhance.Brightness(pil).enhance(factor)
    return cv2.cvtColor(np.array(out), cv2.COLOR_RGB2BGR)


def adjust_contrast(bgr: np.ndarray, factor: float | None = None) -> np.ndarray:
    factor = factor if factor is not None else random.uniform(0.6, 1.5)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    out = ImageEnhance.Contrast(pil).enhance(factor)
    return cv2.cvtColor(np.array(out), cv2.COLOR_RGB2BGR)


def gaussian_blur(bgr: np.ndarray, ksize: int | None = None) -> np.ndarray:
    if ksize is None:
        ksize = random.choice([3, 5, 7])
    if ksize % 2 == 0:
        ksize += 1
    return cv2.GaussianBlur(bgr, (ksize, ksize), 0)


def add_noise(bgr: np.ndarray, sigma: float | None = None) -> np.ndarray:
    sigma = sigma if sigma is not None else random.uniform(5, 25)
    noise = np.random.normal(0, sigma, bgr.shape).astype(np.float32)
    noisy = bgr.astype(np.float32) + noise
    return np.clip(noisy, 0, 255).astype(np.uint8)


def random_crop(bgr: np.ndarray, scale: float | None = None) -> np.ndarray:
    scale = scale if scale is not None else random.uniform(0.7, 0.95)
    h, w = bgr.shape[:2]
    nh, nw = max(1, int(h * scale)), max(1, int(w * scale))
    y0 = random.randint(0, max(0, h - nh))
    x0 = random.randint(0, max(0, w - nw))
    crop = bgr[y0 : y0 + nh, x0 : x0 + nw]
    return cv2.resize(crop, (w, h), interpolation=cv2.INTER_LINEAR)


def perspective_warp(bgr: np.ndarray, magnitude: float | None = None) -> np.ndarray:
    magnitude = magnitude if magnitude is not None else random.uniform(0.05, 0.15)
    h, w = bgr.shape[:2]
    src = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])
    jitter = lambda: random.uniform(-magnitude, magnitude)  # noqa: E731
    dst = np.float32(
        [
            [w * jitter(), h * jitter()],
            [w * (1 + jitter()) - 1, h * jitter()],
            [w * (1 + jitter()) - 1, h * (1 + jitter()) - 1],
            [w * jitter(), h * (1 + jitter()) - 1],
        ]
    )
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(bgr, matrix, (w, h), borderMode=cv2.BORDER_REFLECT_101)


def scale_jitter(bgr: np.ndarray, scale: float | None = None) -> np.ndarray:
    scale = scale if scale is not None else random.uniform(0.8, 1.2)
    h, w = bgr.shape[:2]
    nh, nw = max(1, int(h * scale)), max(1, int(w * scale))
    resized = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.zeros_like(bgr)
    # Center-paste or center-crop back to original size
    if scale >= 1.0:
        y0 = (nh - h) // 2
        x0 = (nw - w) // 2
        return resized[y0 : y0 + h, x0 : x0 + w]
    y0 = (h - nh) // 2
    x0 = (w - nw) // 2
    canvas[y0 : y0 + nh, x0 : x0 + nw] = resized
    return canvas


def jpeg_compression(bgr: np.ndarray, quality: int | None = None) -> np.ndarray:
    quality = quality if quality is not None else random.randint(25, 85)
    ok, encoded = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        return bgr
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR)


def random_background(bgr: np.ndarray) -> np.ndarray:
    """Composite food (center crop / alpha approx) onto a random backdrop."""
    h, w = bgr.shape[:2]
    mode = random.choice(["solid", "gradient", "noise"])
    if mode == "solid":
        color = np.array([random.randint(0, 255) for _ in range(3)], dtype=np.uint8)
        bg = np.tile(color, (h, w, 1))
    elif mode == "gradient":
        c1 = np.array([random.randint(0, 255) for _ in range(3)], dtype=np.float32)
        c2 = np.array([random.randint(0, 255) for _ in range(3)], dtype=np.float32)
        t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
        bg = (c1 * (1 - t) + c2 * t).astype(np.uint8)
        bg = np.repeat(bg, w, axis=1) if bg.shape[1] == 1 else bg
        if bg.shape[1] != w:
            bg = cv2.resize(bg, (w, h))
    else:
        bg = np.random.randint(0, 255, (h, w, 3), dtype=np.uint8)
        bg = cv2.GaussianBlur(bg, (21, 21), 0)

    # Soft center mask to blend product photo onto background
    mask = np.zeros((h, w), dtype=np.float32)
    cv2.ellipse(
        mask,
        (w // 2, h // 2),
        (int(w * 0.42), int(h * 0.42)),
        0,
        0,
        360,
        1.0,
        -1,
    )
    mask = cv2.GaussianBlur(mask, (31, 31), 0)
    mask3 = mask[:, :, None]
    blended = (bgr.astype(np.float32) * mask3 + bg.astype(np.float32) * (1 - mask3))
    return np.clip(blended, 0, 255).astype(np.uint8)


AUGMENTERS = {
    "rotate": rotate,
    "brightness": adjust_brightness,
    "contrast": adjust_contrast,
    "blur": gaussian_blur,
    "noise": add_noise,
    "crop": random_crop,
    "perspective": perspective_warp,
    "scale": scale_jitter,
    "compression": jpeg_compression,
    "background": random_background,
}


def apply_random_augment(
    image: np.ndarray | Path,
    *,
    ops: Sequence[str] | None = None,
    n_ops: int = 2,
) -> np.ndarray:
    """Apply a random subset of augmentations."""
    bgr = _ensure_bgr(image)
    names = list(ops) if ops is not None else list(AUGMENTERS.keys())
    chosen = random.sample(names, k=min(n_ops, len(names)))
    out = bgr
    for name in chosen:
        out = AUGMENTERS[name](out)
    return out


def save_bgr(path: Path, bgr: np.ndarray, *, quality: int = 92) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError(f"Failed to encode {path}")
    encoded.tofile(str(path))
    return path


def generate_augmented_copies(
    source: Path,
    out_dir: Path,
    *,
    n: int = 3,
    prefix: str = "aug",
) -> list[Path]:
    """Write ``n`` augmented copies of ``source`` into ``out_dir``."""
    bgr = _ensure_bgr(source)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    stem = source.stem
    for i in range(n):
        aug = apply_random_augment(bgr)
        dest = out_dir / f"{prefix}_{stem}_{i:02d}.jpg"
        save_bgr(dest, aug)
        written.append(dest)
    return written
