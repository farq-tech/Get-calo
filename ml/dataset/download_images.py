"""Async image downloader with retries.

Images are saved under ``image_cache_dir/{identity_hash}/``.
Broken URLs are skipped after retries; Farq is never modified.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import mimetypes
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

import aiofiles
import aiohttp
from tqdm import tqdm

from config.settings import settings
from dataset.farq_client import IdentityGroup

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = aiohttp.ClientTimeout(total=30)
MAX_RETRIES = 3
RETRY_BACKOFF_S = 1.5
CONCURRENCY = 16
USER_AGENT = "CalorieScanner-ML-Pipeline/1.0 (read-only dataset builder)"


def identity_hash(item_identity: str) -> str:
    """Stable short hash for filesystem-safe identity directories."""
    digest = hashlib.sha256(item_identity.encode("utf-8")).hexdigest()
    return digest[:16]


def identity_cache_dir(
    item_identity: str,
    cache_root: Path | None = None,
) -> Path:
    root = cache_root or settings.image_cache_dir
    return root / identity_hash(item_identity)


def _extension_from_url_or_ctype(url: str, content_type: str | None) -> str:
    path = urlparse(url).path
    suffix = Path(path).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(";")[0].strip())
        if guessed == ".jpe":
            return ".jpg"
        if guessed in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}:
            return ".jpg" if guessed == ".jpeg" else guessed
    return ".jpg"


def _url_filename(url: str, index: int, content_type: str | None) -> str:
    url_digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    ext = _extension_from_url_or_ctype(url, content_type)
    return f"{index:04d}_{url_digest}{ext}"


async def _download_one(
    session: aiohttp.ClientSession,
    url: str,
    dest: Path,
    *,
    max_retries: int = MAX_RETRIES,
) -> Path | None:
    if dest.exists() and dest.stat().st_size > 0:
        return dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            async with session.get(url) as response:
                if response.status >= 400:
                    raise aiohttp.ClientResponseError(
                        request_info=response.request_info,
                        history=response.history,
                        status=response.status,
                        message=f"HTTP {response.status} for {url}",
                    )
                content_type = response.headers.get("Content-Type")
                if dest.suffix == "" or dest.suffix not in {
                    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp",
                }:
                    dest = dest.with_suffix(
                        _extension_from_url_or_ctype(url, content_type)
                    )
                data = await response.read()
                if not data:
                    raise ValueError("empty response body")
                tmp = dest.with_suffix(dest.suffix + ".partial")
                async with aiofiles.open(tmp, "wb") as fh:
                    await fh.write(data)
                tmp.replace(dest)
                return dest
        except Exception as exc:  # noqa: BLE001 — retry then skip
            last_error = exc
            if attempt < max_retries:
                await asyncio.sleep(RETRY_BACKOFF_S * attempt)
            else:
                logger.warning(
                    "Skipping broken URL after %d attempts: %s (%s)",
                    max_retries,
                    url,
                    last_error,
                )
    return None


async def download_identity_images(
    item_identity: str,
    image_urls: Iterable[str],
    *,
    cache_root: Path | None = None,
    session: aiohttp.ClientSession | None = None,
    semaphore: asyncio.Semaphore | None = None,
) -> list[Path]:
    """Download all images for one identity into its cache directory."""
    out_dir = identity_cache_dir(item_identity, cache_root)
    out_dir.mkdir(parents=True, exist_ok=True)
    urls = list(dict.fromkeys(u.strip() for u in image_urls if u and u.strip()))
    if not urls:
        return []

    owns_session = session is None
    if session is None:
        session = aiohttp.ClientSession(
            timeout=DEFAULT_TIMEOUT,
            headers={"User-Agent": USER_AGENT},
        )
    sem = semaphore or asyncio.Semaphore(CONCURRENCY)
    saved: list[Path] = []

    async def _task(idx: int, url: str) -> Path | None:
        async with sem:
            dest = out_dir / _url_filename(url, idx, None)
            return await _download_one(session, url, dest)

    try:
        results = await asyncio.gather(*[_task(i, u) for i, u in enumerate(urls)])
        saved = [p for p in results if p is not None]
    finally:
        if owns_session:
            await session.close()

    return saved


async def download_all_groups(
    groups: dict[str, IdentityGroup],
    *,
    cache_root: Path | None = None,
    concurrency: int = CONCURRENCY,
) -> dict[str, list[Path]]:
    """Download images for every identity group. Returns paths keyed by identity."""
    cache = cache_root or settings.image_cache_dir
    cache.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(concurrency)
    results: dict[str, list[Path]] = {}

    async with aiohttp.ClientSession(
        timeout=DEFAULT_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
    ) as session:
        identities = list(groups.keys())
        with tqdm(total=len(identities), desc="Downloading images") as pbar:
            async def _one(identity: str) -> tuple[str, list[Path]]:
                paths = await download_identity_images(
                    identity,
                    groups[identity].image_urls,
                    cache_root=cache,
                    session=session,
                    semaphore=sem,
                )
                pbar.update(1)
                return identity, paths

            gathered = await asyncio.gather(*[_one(i) for i in identities])
            results = dict(gathered)

    total = sum(len(v) for v in results.values())
    logger.info(
        "Downloaded/cached %d images across %d identities",
        total,
        len(results),
    )
    return results


def download_all_groups_sync(
    groups: dict[str, IdentityGroup],
    *,
    cache_root: Path | None = None,
    concurrency: int = CONCURRENCY,
) -> dict[str, list[Path]]:
    """Synchronous wrapper around :func:`download_all_groups`."""
    return asyncio.run(
        download_all_groups(groups, cache_root=cache_root, concurrency=concurrency)
    )
