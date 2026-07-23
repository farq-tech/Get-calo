#!/usr/bin/env python3
"""Seed Calora Supabase nutrition_items from demo catalog or nutrition_seed.json.

Uses CALORIE_SUPABASE_URL + CALORIE_SUPABASE_SERVICE_KEY from /agent/.env.
Never touches Farq.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dataset.demo_catalog import DEMO_FOODS  # noqa: E402


def rows_from_catalog() -> list[dict]:
    return [
        {
            "class_id": i,
            "item_identity": f.item_identity,
            "name_en": f.name_en,
            "name_ar": f.name_ar,
            "calories_kcal": f.calories_kcal,
            "protein_g": f.protein_g,
            "carbs_g": f.carbs_g,
            "fat_g": f.fat_g,
            "serving_size_g": f.serving_size_g,
            "serving_label_en": f.serving_label_en,
            "serving_label_ar": f.serving_label_ar,
            "category": f.category,
            "image_url": f.image_urls[0] if f.image_urls else None,
        }
        for i, f in enumerate(DEMO_FOODS)
    ]


def main() -> int:
    url = os.environ.get("CALORIE_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("CALORIE_SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("Missing CALORIE_SUPABASE_URL / CALORIE_SUPABASE_SERVICE_KEY in .env", file=sys.stderr)
        return 1

    candidates = [
        ROOT / "data" / "datasets" / "demo_yolo" / "nutrition_seed.json",
        ROOT / "ml" / "data" / "datasets" / "demo_yolo" / "nutrition_seed.json",
    ]
    seed_file = next((p for p in candidates if p.exists()), None)
    if seed_file is not None:
        rows = json.loads(seed_file.read_text(encoding="utf-8"))
    else:
        rows = rows_from_catalog()

    endpoint = f"{url}/rest/v1/nutrition_items"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    # Upsert on item_identity
    # PostgREST needs on_conflict
    r = httpx.post(
        f"{endpoint}?on_conflict=item_identity",
        headers=headers,
        json=rows,
        timeout=60,
    )
    if r.status_code not in (200, 201):
        print(r.status_code, r.text, file=sys.stderr)
        return 1
    print(f"Seeded {len(r.json())} nutrition_items")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
