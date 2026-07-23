"""Read-only Farq Supabase client.

Farq schema (actual):
  - ``canonical_items`` → YOLO class identity (NEVER provider_items.id)
  - ``provider_items.image`` → training images (many providers → one class)
  - ``provider_items.calories`` → best available calorie signal
    (canonical_items.calories is currently unused / null)

This module NEVER writes to Farq.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field
from statistics import median
from typing import TYPE_CHECKING, Any, Iterable

from config.settings import settings

if TYPE_CHECKING:
    from supabase import Client

logger = logging.getLogger(__name__)

PAGE_SIZE = 1000
_CAL_IN_NAME = re.compile(r"(?i)\bcal(?:ories)?\s*[:=]?\s*(\d{2,4})\b")


@dataclass(frozen=True)
class FarqItemRow:
    """Single Farq provider image row mapped onto pipeline fields."""

    item_identity: str
    image_url: str
    name_en: str = ""
    name_ar: str = ""
    calories: float | None = None
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None
    serving_size_g: float | None = None
    category: str = ""
    raw: dict[str, Any] = field(default_factory=dict, compare=False, hash=False)


@dataclass
class IdentityGroup:
    """All Farq images that share one canonical item identity."""

    item_identity: str
    name_en: str = ""
    name_ar: str = ""
    calories: float | None = None
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None
    serving_size_g: float | None = None
    category: str = ""
    image_urls: list[str] = field(default_factory=list)
    rows: list[FarqItemRow] = field(default_factory=list)


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _calories_from_name(*names: str) -> float | None:
    for name in names:
        if not name:
            continue
        m = _CAL_IN_NAME.search(name)
        if m:
            return float(m.group(1))
    return None


def create_farq_client(
    url: str | None = None,
    key: str | None = None,
) -> Client:
    """Create a Supabase client pointed at Farq (read-only usage)."""
    from supabase import create_client

    resolved_url = url or settings.farq_supabase_url
    resolved_key = key or settings.farq_supabase_service_key
    if not resolved_url or not resolved_key:
        raise ValueError(
            "Farq Supabase credentials missing. Set FARQ_SUPABASE_URL and "
            "FARQ_SUPABASE_SERVICE_KEY in .env (read-only access)."
        )
    return create_client(resolved_url, resolved_key)


def identity_from_canonical_id(canonical_id: Any) -> str:
    """Stable class key — always canonical, never provider_items.id."""
    return f"canonical:{int(canonical_id)}"


def map_provider_row(row: dict[str, Any]) -> FarqItemRow | None:
    """Map a provider_items row (+ embedded canonical_items) to FarqItemRow."""
    canonical_id = row.get("canonical_item_id")
    image_url = row.get(settings.farq_image_url_column) or row.get("image")
    if canonical_id is None or not image_url:
        return None

    canonical = row.get("canonical_items") or {}
    if isinstance(canonical, list):
        canonical = canonical[0] if canonical else {}

    name_en = (
        str(canonical.get("canonical_name_en") or row.get("name_en") or "").strip()
    )
    name_ar = (
        str(canonical.get("canonical_name_ar") or row.get("name_ar") or "").strip()
    )
    category = str(
        canonical.get("category") or row.get("category") or ""
    ).strip()

    calories = _to_float(row.get("calories"))
    if calories is None:
        calories = _to_float(canonical.get("calories"))
    if calories is None:
        calories = _calories_from_name(name_en, name_ar, str(row.get("name_en") or ""))

    serving = _to_float(canonical.get("size_value"))
    # Heuristic: if unit looks like grams, keep; else leave as-is / None
    unit = str(canonical.get("size_unit") or "").lower()
    if serving is not None and unit and unit not in {"g", "gram", "grams", "مل", "ml"}:
        # Keep numeric size but don't pretend it's grams when unit is pieces/etc.
        pass

    return FarqItemRow(
        item_identity=identity_from_canonical_id(canonical_id),
        image_url=str(image_url).strip(),
        name_en=name_en,
        name_ar=name_ar,
        calories=calories,
        protein=None,  # Farq schema has no macros today
        carbs=None,
        fat=None,
        serving_size_g=serving if unit in {"", "g", "gram", "grams"} else serving,
        category=category,
        raw=row,
    )


def fetch_all_item_rows(
    client: Client | None = None,
    *,
    page_size: int = PAGE_SIZE,
    max_rows: int | None = None,
) -> list[FarqItemRow]:
    """Paginate provider_items with images linked to canonical_items.

    Never writes to Farq. Classes = canonical_item_id only.
    """
    sb = client or create_farq_client()
    table = settings.farq_provider_items_table
    select = (
        "id,canonical_item_id,image,name_en,name_ar,calories,category,"
        "canonical_items(id,canonical_name_en,canonical_name_ar,category,"
        "calories,size_value,size_unit)"
    )
    rows: list[FarqItemRow] = []
    offset = 0

    while True:
        if max_rows is not None and len(rows) >= max_rows:
            break
        end = offset + page_size - 1
        query = (
            sb.table(table)
            .select(select)
            .not_.is_("image", "null")
            .not_.is_("canonical_item_id", "null")
            .neq("image", "")
            .range(offset, end)
        )
        resp = query.execute()
        batch = resp.data or []
        if not batch:
            break
        for raw in batch:
            mapped = map_provider_row(raw)
            if mapped:
                rows.append(mapped)
                if max_rows is not None and len(rows) >= max_rows:
                    break
        logger.info("Farq fetch offset=%d batch=%d total_mapped=%d", offset, len(batch), len(rows))
        if len(batch) < page_size:
            break
        offset += page_size

    logger.info("Fetched %d Farq image rows (canonical-linked)", len(rows))
    return rows


def group_by_identity(rows: Iterable[FarqItemRow]) -> dict[str, IdentityGroup]:
    """Group provider images by canonical item_identity; merge nutrition."""
    groups: dict[str, IdentityGroup] = {}
    cal_buckets: dict[str, list[float]] = defaultdict(list)

    for row in rows:
        g = groups.get(row.item_identity)
        if g is None:
            g = IdentityGroup(
                item_identity=row.item_identity,
                name_en=row.name_en,
                name_ar=row.name_ar,
                category=row.category,
                serving_size_g=row.serving_size_g,
            )
            groups[row.item_identity] = g
        if row.image_url and row.image_url not in g.image_urls:
            g.image_urls.append(row.image_url)
        g.rows.append(row)
        # Prefer non-empty names
        if not g.name_en and row.name_en:
            g.name_en = row.name_en
        if not g.name_ar and row.name_ar:
            g.name_ar = row.name_ar
        if not g.category and row.category:
            g.category = row.category
        if g.serving_size_g is None and row.serving_size_g is not None:
            g.serving_size_g = row.serving_size_g
        if row.calories is not None:
            cal_buckets[row.item_identity].append(row.calories)

    for identity, vals in cal_buckets.items():
        groups[identity].calories = float(median(vals))

    logger.info(
        "Grouped into %d canonical identities (avg %.1f images)",
        len(groups),
        (sum(len(g.image_urls) for g in groups.values()) / max(1, len(groups))),
    )
    return groups


def fetch_identity_groups(
    client: Client | None = None,
    *,
    max_rows: int | None = None,
) -> dict[str, IdentityGroup]:
    """Convenience: fetch → group by canonical identity."""
    rows = fetch_all_item_rows(client, max_rows=max_rows)
    return group_by_identity(rows)


def probe_farq(client: Client | None = None) -> dict[str, Any]:
    """Read-only health probe for wiring checks."""
    sb = client or create_farq_client()
    sample = (
        sb.table(settings.farq_provider_items_table)
        .select(
            "id,canonical_item_id,image,name_en,calories,"
            "canonical_items(canonical_name_en)"
        )
        .not_.is_("image", "null")
        .not_.is_("canonical_item_id", "null")
        .limit(5)
        .execute()
    )
    mapped = [map_provider_row(r) for r in (sample.data or [])]
    mapped = [m for m in mapped if m]
    return {
        "ok": len(mapped) > 0,
        "sample_count": len(mapped),
        "sample_identities": [m.item_identity for m in mapped],
        "sample_names": [m.name_en for m in mapped],
        "note": "Classes=canonical_items; images=provider_items; no Farq writes",
    }
