"""Read-only Farq Supabase client.

Farq is the source of product metadata and image URLs only.
This module NEVER writes to, updates, or deletes from Farq.
Classes are always canonical ``item_identity`` — never provider_items.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Iterable

from config.settings import settings

if TYPE_CHECKING:
    from supabase import Client

logger = logging.getLogger(__name__)

PAGE_SIZE = 1000


@dataclass(frozen=True)
class FarqItemRow:
    """Single Farq row mapped onto pipeline fields."""

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
    """All Farq rows / images that share one canonical item_identity."""

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
            "FARQ_SUPABASE_SERVICE_KEY in ml/.env (read-only access)."
        )
    return create_client(resolved_url, resolved_key)


def map_row(row: dict[str, Any]) -> FarqItemRow | None:
    """Map a raw Farq table row using column names from settings."""
    identity = row.get(settings.farq_identity_column)
    image_url = row.get(settings.farq_image_url_column)
    if not identity or not image_url:
        return None
    identity_str = str(identity).strip()
    url_str = str(image_url).strip()
    if not identity_str or not url_str:
        return None
    return FarqItemRow(
        item_identity=identity_str,
        image_url=url_str,
        name_en=str(row.get(settings.farq_name_en_column) or "").strip(),
        name_ar=str(row.get(settings.farq_name_ar_column) or "").strip(),
        calories=_to_float(row.get(settings.farq_calories_column)),
        protein=_to_float(row.get(settings.farq_protein_column)),
        carbs=_to_float(row.get(settings.farq_carbs_column)),
        fat=_to_float(row.get(settings.farq_fat_column)),
        serving_size_g=_to_float(row.get(settings.farq_serving_column)),
        category=str(row.get(settings.farq_category_column) or "").strip(),
        raw=row,
    )


def fetch_all_item_rows(
    client: Client | None = None,
    *,
    page_size: int = PAGE_SIZE,
) -> list[FarqItemRow]:
    """Paginate Farq items table and map rows. Never writes to Farq."""
    sb = client or create_farq_client()
    table = settings.farq_items_table
    rows: list[FarqItemRow] = []
    offset = 0

    while True:
        end = offset + page_size - 1
        logger.info("Fetching Farq %s rows %s–%s", table, offset, end)
        response = (
            sb.table(table)
            .select("*")
            .range(offset, end)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
        for raw in batch:
            mapped = map_row(raw)
            if mapped is not None:
                rows.append(mapped)
        if len(batch) < page_size:
            break
        offset += page_size

    logger.info("Fetched %d usable Farq rows (with identity + image_url)", len(rows))
    return rows


def group_by_identity(rows: Iterable[FarqItemRow]) -> dict[str, IdentityGroup]:
    """Collapse provider-level rows into canonical item_identity classes.

    Multiple provider images for the same food become one class.
    Never use provider_items as class labels.
    """
    groups: dict[str, IdentityGroup] = {}
    url_seen: dict[str, set[str]] = defaultdict(set)

    for row in rows:
        group = groups.get(row.item_identity)
        if group is None:
            group = IdentityGroup(
                item_identity=row.item_identity,
                name_en=row.name_en,
                name_ar=row.name_ar,
                calories=row.calories,
                protein=row.protein,
                carbs=row.carbs,
                fat=row.fat,
                serving_size_g=row.serving_size_g,
                category=row.category,
            )
            groups[row.item_identity] = group

        # Prefer non-empty nutrition / names from later rows if missing
        if not group.name_en and row.name_en:
            group.name_en = row.name_en
        if not group.name_ar and row.name_ar:
            group.name_ar = row.name_ar
        if group.calories is None and row.calories is not None:
            group.calories = row.calories
        if group.protein is None and row.protein is not None:
            group.protein = row.protein
        if group.carbs is None and row.carbs is not None:
            group.carbs = row.carbs
        if group.fat is None and row.fat is not None:
            group.fat = row.fat
        if group.serving_size_g is None and row.serving_size_g is not None:
            group.serving_size_g = row.serving_size_g
        if not group.category and row.category:
            group.category = row.category

        if row.image_url not in url_seen[row.item_identity]:
            url_seen[row.item_identity].add(row.image_url)
            group.image_urls.append(row.image_url)
        group.rows.append(row)

    logger.info(
        "Grouped into %d canonical item_identity classes",
        len(groups),
    )
    return groups


def fetch_identity_groups(client: Client | None = None) -> dict[str, IdentityGroup]:
    """Fetch all Farq items and return groups keyed by item_identity."""
    rows = fetch_all_item_rows(client)
    return group_by_identity(rows)
