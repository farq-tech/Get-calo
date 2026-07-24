#!/usr/bin/env python3
"""Build grocery nutrition catalog from Farq Tamimi Markets (read-only) + USDA.

1. Pull unique grocery product names/images from Farq provider_items (Tamimi etc.)
2. Filter out non-food household items
3. Match calories/macros against USDA SR Legacy (local JSON) + Gulf synonym map
4. Write nutrition JSON, seed Calora ``nutrition_items``, update mobile sample

Farq is NEVER written to.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

OUT_DIR = ROOT / "ml" / "data" / "datasets" / "grocery_tamimi"
USDA_JSON = (
    ROOT
    / "ml"
    / "data"
    / "nutrition_refs"
    / "FoodData_Central_sr_legacy_food_json_2018-04.json"
)
USDA_INDEX = ROOT / "ml" / "data" / "nutrition_refs" / "usda_sr_legacy_index.json"
CACHE_PATH = OUT_DIR / "calorie_match_cache.json"

UA = "CaloraBot/1.0 (https://get-calo-web.vercel.app; grocery nutrition catalog)"

# Farq provider_restaurant ids for grocery / markets (read-only).
GROCERY_RESTAURANT_IDS = (
    14274,  # Tamimi Markets
    17740,
    26711,
    14452,  # Harbi Markets
    23671,
    18748,  # Supermarket Bett Reema
)

NON_FOOD_RE = re.compile(
    r"(?i)\b("
    r"bleach|detergent|disinfectant|cleaner|soap|shampoo|conditioner|"
    r"toothpaste|mouthwash|deodorant|diaper|tissue|toilet|trash|garbage|"
    r"laundry|fabric softener|dishwash|sponges?|wipes?|insect|pesticide|"
    r"air freshener|battery|batteries|lighter|foil|wrap|bag|bags|"
    r"candle|pet litter|cat litter|dog food|cat food|bird seed|"
    r"body wash|hand wash|sanitizer|cotton bud|cotton swab|"
    r"razor|shaving|makeup|cosmetic|perfume|cologne|nail polish|"
    r"bin liner|cling film|plastic wrap|aluminum foil|"
    r"kitchen towel|paper towel|napkin|straw|cupcake liner|"
    r"feminine|pads?\b|notebook|plastic tray|beauty cream|stain remover|"
    r"fabric stain|butterflay|butterfly pads|cotton pads"
    r")\b"
    r"|مبيض|منظف|غسيل|شامبو|حفاض|مناديل|صابون|مبيد|معطر|"
    r"بطارية|كيس قمامة|ورق ألمنيوم|غسول|دفت"
)

# Map Gulf / Arabic grocery phrasing → USDA-friendly English queries.
GULF_SYNONYMS: dict[str, str] = {
    "laban": "buttermilk fluid cultured",
    "fresh laban": "buttermilk fluid cultured",
    "fresh laban full fat": "buttermilk fluid whole",
    "fresh laban low fat": "buttermilk fluid lowfat",
    "labneh": "yogurt plain whole milk",
    "halloumi": "cheese mozzarella",
    "halloumi cheese": "cheese mozzarella",
    "triangle cheese": "cheese processed",
    "processed cheese": "cheese processed",
    "white cheese": "cheese feta",
    "akawi": "cheese feta",
    "nabulsi": "cheese feta",
    "vimto": "fruit flavored drink",
    "karak": "tea with milk",
    "arabic coffee": "coffee brewed",
    "saudi coffee": "coffee brewed",
    "dates": "dates medjool",
    "ajwa": "dates medjool",
    "tahini": "sesame butter tahini",
    "tahina": "sesame butter tahini",
    "samna": "butter ghee",
    "ghee": "butter ghee",
    "basmati rice": "rice white long-grain cooked",
    "calrose rice": "rice white medium-grain cooked",
    "egyptian rice": "rice white medium-grain cooked",
    "mineral bottled water": "water bottled",
    "natural mineral water": "water bottled",
    "sparkling water": "water bottled carbonated",
    "tomato ketchup": "catsup",
    "ketchup": "catsup",
    "hot sauce": "sauce hot chile",
    "olive oil": "oil olive salad or cooking",
    "extra virgin olive oil": "oil olive salad or cooking",
    "sunflower oil": "oil sunflower",
    "corn oil": "oil corn salad or cooking",
    "whipping cream": "cream fluid heavy whipping",
    "cooking cream": "cream fluid light whipping",
    "milk powder": "milk dry whole",
    "full cream milk": "milk whole 3.25% milkfat",
    "full fat milk": "milk whole 3.25% milkfat",
    "low fat milk": "milk lowfat 1% milkfat",
    "skimmed milk": "milk nonfat skim",
    "orange juice": "orange juice raw",
    "apple juice": "apple juice canned or bottled unsweetened",
    "mango juice": "mango nectar canned",
    "whole chicken": "chicken, broilers or fryers, meat and skin, raw",
    "chicken breast": "chicken, broilers or fryers, breast, meat only, raw",
    "white basmati rice": "rice, white, long-grain, regular, raw",
    "basmati rice": "rice, white, long-grain, regular, raw",
    "calrose rice": "rice, white, medium-grain, raw",
    "triangle cheese": "cheese, pasteurized process, american",
    "turkish labneh": "yogurt, greek, plain, whole milk",
    "full fat fresh laban": "milk, buttermilk, fluid, whole",
    "activia low fat laban": "yogurt, plain, lowfat",
    "sliced black olives": "olives, ripe, canned",
    "whole black olives": "olives, ripe, canned",
    "cornflakes": "cereals ready-to-eat, kellogg, kellogg's corn flakes",
    "earl grey tea": "tea, black, brewed, prepared with tap water",
    "carbonated soft drink": "beverages, carbonated, cola",
    "bicarbonate of soda": "leavening agents, baking soda",
    "finest tahini": "seeds, sesame butter, tahini, from roasted and toasted kernels",
    "alnakhla finest tahina": "seeds, sesame butter, tahini, from roasted and toasted kernels",
    "ajinomoto": "seasoning mix, dry, flavor enhancer",
    "eggs": "egg whole raw fresh",
    "fine sugar": "sugars granulated",
    "brown sugar": "sugars brown",
    "natural honey": "honey",
    "turmeric powder": "spices turmeric ground",
    "black pepper": "spices pepper black",
    "white flour": "wheat flour white all-purpose",
    "all purpose flour": "wheat flour white all-purpose",
    "corn flour": "corn flour whole-grain yellow",
    "baking powder": "leavening agents baking powder",
    "butter": "butter salted",
    "unsalted butter": "butter without salt",
    "unsalted natural butter": "butter without salt",
    "shredded mozzarella cheese": "cheese mozzarella",
    "sweetened condensed milk": "milk canned condensed sweetened",
    "evaporated milk": "milk canned evaporated without vitamin a",
    "yogurt": "yogurt plain whole milk",
    "greek yogurt": "yogurt greek plain nonfat",
    "pita bread": "bread pita white",
    "arabic bread": "bread pita white",
    "toast bread": "bread white commercially prepared",
    "sliced bread": "bread white commercially prepared",
}

TOKEN_RE = re.compile(r"[a-z0-9]+")


@dataclass
class GroceryClass:
    class_id: int
    item_identity: str
    name_en: str
    name_ar: str
    calories_kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    serving_size_g: float
    serving_label_en: str
    serving_label_ar: str
    category: str
    image_url: str | None
    source: str
    match_description: str | None
    image_count: int
    is_food: bool


def _get_json(url: str, path: str, prefer_count: bool = False) -> tuple[str | None, Any]:
    headers = {
        "apikey": os.environ["FARQ_SUPABASE_SERVICE_KEY"],
        "Authorization": f"Bearer {os.environ['FARQ_SUPABASE_SERVICE_KEY']}",
        "User-Agent": UA,
    }
    if prefer_count:
        headers["Prefer"] = "count=exact"
    req = urllib.request.Request(url.rstrip("/") + path, headers=headers)
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.headers.get("content-range"), json.loads(resp.read().decode())


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return s[:80] or "item"


def is_food_name(name_en: str, name_ar: str = "") -> bool:
    blob = f"{name_en} {name_ar}"
    if not name_en.strip() and not name_ar.strip():
        return False
    if NON_FOOD_RE.search(blob):
        return False
    # Require at least some latin letters for matching, or Arabic food words
    if not TOKEN_RE.search(name_en.lower()) and not name_ar.strip():
        return False
    return True


def tokens(text: str) -> set[str]:
    return set(TOKEN_RE.findall(text.lower()))


def build_usda_index() -> list[dict[str, Any]]:
    if USDA_INDEX.exists():
        print(f"Loading USDA index {USDA_INDEX}")
        return json.loads(USDA_INDEX.read_text(encoding="utf-8"))

    print(f"Building USDA index from {USDA_JSON} ...")
    raw = json.loads(USDA_JSON.read_text(encoding="utf-8"))
    foods = raw["SRLegacyFoods"]
    index: list[dict[str, Any]] = []
    for food in foods:
        kcal = prot = carb = fat = None
        for n in food.get("foodNutrients") or []:
            nut = n.get("nutrient") or {}
            name = nut.get("name") or ""
            unit = (nut.get("unitName") or "").lower()
            amount = n.get("amount")
            if amount is None:
                continue
            if name == "Energy" and unit == "kcal":
                kcal = float(amount)
            elif name == "Protein":
                prot = float(amount)
            elif name == "Total lipid (fat)":
                fat = float(amount)
            elif name.startswith("Carbohydrate"):
                carb = float(amount)
        if kcal is None:
            continue
        desc = food.get("description") or ""
        cat = (food.get("foodCategory") or {}).get("description") or ""
        portions = food.get("foodPortions") or []
        serving_g = 100.0
        if portions:
            gw = portions[0].get("gramWeight")
            if gw and float(gw) > 0:
                serving_g = float(gw)
        index.append(
            {
                "fdc_id": food.get("fdcId"),
                "description": desc,
                "description_l": desc.lower(),
                "tokens": sorted(tokens(desc)),
                "category": cat,
                "calories_kcal_100g": kcal,
                "protein_g_100g": prot or 0.0,
                "carbs_g_100g": carb or 0.0,
                "fat_g_100g": fat or 0.0,
                "serving_size_g": serving_g,
            }
        )
    USDA_INDEX.parent.mkdir(parents=True, exist_ok=True)
    USDA_INDEX.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(index)} USDA foods → {USDA_INDEX}")
    return index


def score_match(query: str, entry: dict[str, Any]) -> float:
    q_toks = tokens(query)
    if not q_toks:
        return 0.0
    e_toks = set(entry["tokens"])
    if not e_toks:
        return 0.0
    inter = q_toks & e_toks
    if not inter:
        return 0.0
    precision = len(inter) / len(q_toks)
    recall = len(inter) / len(e_toks)
    # Prefer shorter descriptions when token coverage is equal
    length_penalty = min(1.0, 12 / max(1, len(e_toks)))
    bonus = 0.15 if entry["description_l"].startswith(query.lower()[: min(12, len(query))]) else 0.0
    # Prefer generic (no brand-ish commas with many modifiers) lightly
    return 0.55 * precision + 0.35 * recall + 0.1 * length_penalty + bonus


def resolve_query(name_en: str) -> str:
    key = name_en.strip().lower()
    if key in GULF_SYNONYMS:
        return GULF_SYNONYMS[key]
    # try progressive prefix of tokens for synonym hits
    parts = key.split()
    for n in range(min(4, len(parts)), 0, -1):
        sub = " ".join(parts[:n])
        if sub in GULF_SYNONYMS:
            return GULF_SYNONYMS[sub]
    # strip common retail adjectives
    cleaned = re.sub(
        r"\b(fresh|natural|original|premium|family|pack|size|large|small|medium|"
        r"full fat|low fat|skimmed|unsalted|salted|organic|extra virgin)\b",
        " ",
        key,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or key


def match_usda(name_en: str, index: list[dict[str, Any]]) -> dict[str, Any] | None:
    query = resolve_query(name_en)
    best: dict[str, Any] | None = None
    best_score = 0.0
    q_toks = tokens(query)
    if not q_toks:
        return None
    # Candidate filter: share at least one meaningful token
    stop = {"and", "or", "with", "the", "of", "in", "a", "an", "to", "for", "raw", "cooked", "regular", "fluid"}
    meaningful = q_toks - stop
    if not meaningful:
        meaningful = q_toks
    # Anchor: prefer matches that contain the first content token (avoids chicken→turkey).
    anchor = next(iter([t for t in TOKEN_RE.findall(query.lower()) if t not in stop]), None)
    for entry in index:
        e_toks = set(entry["tokens"])
        if not (meaningful & e_toks):
            continue
        if anchor and anchor not in e_toks and len(meaningful) <= 4:
            # allow synonym-expanded queries where anchor may differ slightly
            if anchor not in {"butter", "milk", "cheese", "rice", "oil", "juice", "chicken", "yogurt", "tea", "water"}:
                pass
            elif anchor not in e_toks:
                continue
        s = score_match(query, entry)
        if s > best_score:
            best_score = s
            best = entry
    if best is None or best_score < 0.48:
        return None
    # Grocery catalog uses per-100g values (standard packaged-food convention).
    return {
        "source": "usda_sr_legacy",
        "match_description": best["description"],
        "match_score": round(best_score, 3),
        "fdc_id": best["fdc_id"],
        "calories_kcal": round(best["calories_kcal_100g"], 1),
        "protein_g": round(best["protein_g_100g"], 1),
        "carbs_g": round(best["carbs_g_100g"], 1),
        "fat_g": round(best["fat_g_100g"], 1),
        "serving_size_g": 100.0,
        "category": best["category"] or "grocery",
        "query_used": query,
    }


def fetch_off_fallback(name_en: str) -> dict[str, Any] | None:
    """Try Open Food Facts search; may 503 — fail soft."""
    qs = urllib.parse.urlencode(
        {
            "search_terms": name_en,
            "search_simple": 1,
            "action": "process",
            "json": 1,
            "page_size": 5,
        }
    )
    url = f"https://world.openfoodfacts.org/cgi/search.pl?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        return None
    for prod in data.get("products") or []:
        nuts = prod.get("nutriments") or {}
        kcal = nuts.get("energy-kcal_100g")
        if kcal is None:
            continue
        return {
            "source": "open_food_facts",
            "match_description": prod.get("product_name") or name_en,
            "match_score": None,
            "fdc_id": prod.get("code"),
            "calories_kcal": round(float(kcal), 1),  # per 100g
            "protein_g": round(float(nuts.get("proteins_100g") or 0), 1),
            "carbs_g": round(float(nuts.get("carbohydrates_100g") or 0), 1),
            "fat_g": round(float(nuts.get("fat_100g") or 0), 1),
            "serving_size_g": 100.0,
            "category": "grocery",
            "query_used": name_en,
        }
    return None


def pull_grocery_items() -> list[dict[str, Any]]:
    base = os.environ["FARQ_SUPABASE_URL"]
    items: list[dict[str, Any]] = []
    for rid in GROCERY_RESTAURANT_IDS:
        offset = 0
        while True:
            path = (
                "/rest/v1/provider_items"
                f"?select=id,name_en,name_ar,name_norm,image,calories,provider_restaurant_id"
                f"&provider_restaurant_id=eq.{rid}&limit=1000&offset={offset}"
            )
            _, rows = _get_json(base, path, prefer_count=True)
            items.extend(rows)
            print(f"  restaurant {rid}: +{len(rows)} (total {len(items)})")
            if len(rows) < 1000:
                break
            offset += 1000
            time.sleep(0.05)
    return items


def group_classes(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for row in items:
        name_en = (row.get("name_en") or row.get("name_norm") or "").strip()
        name_ar = (row.get("name_ar") or "").strip()
        key = (row.get("name_norm") or name_en or name_ar).strip().lower()
        if not key:
            continue
        food = is_food_name(name_en or key, name_ar)
        g = groups.get(key)
        if g is None:
            groups[key] = {
                "name_norm": key,
                "name_en": name_en or key.title(),
                "name_ar": name_ar,
                "images": [],
                "is_food": food,
            }
            g = groups[key]
        else:
            if not g["name_ar"] and name_ar:
                g["name_ar"] = name_ar
            if len(name_en) > len(g["name_en"]):
                g["name_en"] = name_en
            g["is_food"] = g["is_food"] and food
        img = row.get("image")
        if img and img not in g["images"]:
            g["images"].append(img)
    return sorted(groups.values(), key=lambda x: (-len(x["images"]), x["name_en"]))


def seed_calora(rows: list[dict[str, Any]]) -> int:
    url = os.environ.get("CALORIE_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("CALORIE_SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("Skip Calora seed: missing env")
        return 0
    endpoint = f"{url}/rest/v1/nutrition_items?on_conflict=item_identity"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
        "User-Agent": UA,
    }
    # Upsert in chunks (class_id must stay unique — replace grocery.* identities)
    # First clear previous grocery.* rows to avoid class_id collisions with essential.
    del_req = urllib.request.Request(
        f"{url}/rest/v1/nutrition_items?item_identity=like.grocery.*",
        method="DELETE",
        headers={**headers, "Prefer": "return=minimal"},
    )
    try:
        with urllib.request.urlopen(del_req, timeout=60) as resp:
            print(f"Cleared previous grocery.* rows: HTTP {resp.status}")
    except Exception as exc:
        print(f"Clear grocery rows warning: {exc}")

    # Keep essential class_ids 0..N; assign grocery class_ids starting at 1000
    payload = []
    for r in rows:
        payload.append(
            {
                "class_id": r["class_id"],
                "item_identity": r["item_identity"],
                "name_en": r["name_en"],
                "name_ar": r.get("name_ar"),
                "calories_kcal": r["calories_kcal"],
                "protein_g": r["protein_g"],
                "carbs_g": r["carbs_g"],
                "fat_g": r["fat_g"],
                "serving_size_g": r["serving_size_g"],
                "serving_label_en": r.get("serving_label_en") or "serving",
                "serving_label_ar": r.get("serving_label_ar") or "حصة",
                "category": r.get("category") or "grocery",
                "image_url": r.get("image_url"),
            }
        )

    seeded = 0
    chunk = 50
    for i in range(0, len(payload), chunk):
        body = json.dumps(payload[i : i + chunk]).encode()
        req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                if resp.status not in (200, 201):
                    raise RuntimeError(f"seed failed {resp.status}")
            seeded += len(payload[i : i + chunk])
        except Exception as exc:
            print(f"  chunk {i} failed ({exc}); retrying row-by-row")
            for row in payload[i : i + chunk]:
                body = json.dumps(row).encode()
                req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
                try:
                    with urllib.request.urlopen(req, timeout=60) as resp:
                        seeded += 1
                except Exception as row_exc:
                    print(f"  skip {row['item_identity']}: {row_exc}")
        if seeded % 200 == 0 or i + chunk >= len(payload):
            print(f"  seeded {seeded}/{len(payload)}")
    return seeded


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if "FARQ_SUPABASE_URL" not in os.environ or "FARQ_SUPABASE_SERVICE_KEY" not in os.environ:
        print("Missing FARQ_SUPABASE_* in .env", file=sys.stderr)
        return 1

    print("Pulling grocery items from Farq (read-only)...")
    items = pull_grocery_items()
    print(f"Raw items: {len(items)}")
    groups = group_classes(items)
    food_groups = [g for g in groups if g["is_food"]]
    non_food = len(groups) - len(food_groups)
    print(f"Unique classes: {len(groups)} (food={len(food_groups)}, non_food_filtered={non_food})")

    (OUT_DIR / "classes_raw.json").write_text(
        json.dumps(groups, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    index = build_usda_index()
    cache: dict[str, Any] = {}
    if CACHE_PATH.exists():
        cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))

    catalog: list[GroceryClass] = []
    off_attempts = 0

    for i, g in enumerate(food_groups):
        name_en = g["name_en"]
        identity = f"grocery.{slugify(g['name_norm'])}"
        cached = cache.get(identity)
        if cached and cached.get("source"):
            nut = cached
        else:
            nut = match_usda(name_en, index)
            if nut is None and off_attempts < 400:
                # Soft OFF fallback for unmatched batch (rate-limit friendly)
                off_attempts += 1
                nut = fetch_off_fallback(resolve_query(name_en))
                time.sleep(0.2)
            if nut is None:
                # Last resort: 100g placeholder with zeros flagged via source
                nut = {
                    "source": "unmatched",
                    "match_description": None,
                    "match_score": 0,
                    "fdc_id": None,
                    "calories_kcal": 0.0,
                    "protein_g": 0.0,
                    "carbs_g": 0.0,
                    "fat_g": 0.0,
                    "serving_size_g": 100.0,
                    "category": "grocery",
                    "query_used": resolve_query(name_en),
                }
            cache[identity] = nut

        catalog.append(
            GroceryClass(
                class_id=1000 + i,
                item_identity=identity,
                name_en=name_en,
                name_ar=g.get("name_ar") or "",
                calories_kcal=float(nut["calories_kcal"]),
                protein_g=float(nut["protein_g"]),
                carbs_g=float(nut["carbs_g"]),
                fat_g=float(nut["fat_g"]),
                serving_size_g=float(nut["serving_size_g"]),
                serving_label_en="100g",
                serving_label_ar="100غ",
                category=str(nut.get("category") or "grocery"),
                image_url=g["images"][0] if g["images"] else None,
                source=str(nut.get("source") or "unknown"),
                match_description=nut.get("match_description"),
                image_count=len(g["images"]),
                is_food=True,
            )
        )
        if (i + 1) % 200 == 0:
            print(f"  matched progress {i+1}/{len(food_groups)}")
            CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    # Recount from catalog sources
    src_counts: dict[str, int] = defaultdict(int)
    for c in catalog:
        src_counts[c.source] += 1

    rows = [asdict(c) for c in catalog]
    nutrition_path = OUT_DIR / "nutrition.json"
    nutrition_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    # Labels for recognition (food classes with ≥2 images preferred for training)
    labels = {
        "num_classes": len(catalog),
        "version": "grocery-tamimi-calories-1.0",
        "classes": [
            {
                "class_id": c.class_id,
                "item_identity": c.item_identity,
                "name_en": c.name_en,
                "name_ar": c.name_ar,
                "calories": c.calories_kcal,
                "protein": c.protein_g,
                "carbs": c.carbs_g,
                "fat": c.fat_g,
                "serving_size_g": c.serving_size_g,
                "category": c.category,
                "image_count": c.image_count,
                "source": c.source,
            }
            for c in catalog
        ],
    }
    (OUT_DIR / "labels.json").write_text(
        json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Training-ready subset: food classes with calories + enough images
    train_subset = [
        c
        for c in catalog
        if c.source != "unmatched" and c.image_count >= 2 and c.calories_kcal >= 0
    ][:300]
    (OUT_DIR / "train_subset_300.json").write_text(
        json.dumps([asdict(c) for c in train_subset], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Append grocery nutrition into mobile sample (alongside essential) for catalog search
    sample_path = ROOT / "mobile" / "assets" / "nutrition.sample.json"
    essential = []
    if sample_path.exists():
        existing = json.loads(sample_path.read_text(encoding="utf-8"))
        essential = [r for r in existing if not str(r.get("item_identity", "")).startswith("grocery.")]
    grocery_sample = [
        {
            "class_id": c.class_id,
            "item_identity": c.item_identity,
            "name_en": c.name_en,
            "name_ar": c.name_ar,
            "calories_kcal": c.calories_kcal,
            "protein_g": c.protein_g,
            "carbs_g": c.carbs_g,
            "fat_g": c.fat_g,
            "serving_size_g": c.serving_size_g,
            "serving_label_en": c.serving_label_en,
            "serving_label_ar": c.serving_label_ar,
            "category": c.category,
        }
        for c in catalog
        if c.source != "unmatched"
    ]
    sample_path.write_text(
        json.dumps(essential + grocery_sample, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    summary = {
        "raw_items": len(items),
        "unique_classes": len(groups),
        "food_classes": len(food_groups),
        "non_food_filtered": non_food,
        "sources": dict(src_counts),
        "train_subset": len(train_subset),
        "nutrition_path": str(nutrition_path),
        "mobile_sample_rows": len(essential) + len(grocery_sample),
    }
    (OUT_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))

    print("Seeding Calora nutrition_items...")
    seed_rows = [r for r in rows if r["source"] != "unmatched"]
    seeded = seed_calora(seed_rows)
    print(f"Done. Seeded {seeded} grocery nutrition rows into Calora.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
