# Farq schema mapping (read-only) — wired to live Farq project

Calora **only SELECTs** from Farq. Never modify Farq.

## Live mapping (`mpgbvtaguerncgbzvpwg`)

| Pipeline need | Farq source |
|---------------|-------------|
| YOLO class (`item_identity`) | `canonical_items.id` → `canonical:{id}` |
| Training images | `provider_items.image` where `canonical_item_id` is set |
| Name EN / AR | `canonical_items.canonical_name_*` (fallback `provider_items.name_*`) |
| Calories | `provider_items.calories` (median per canonical); also parsed from names like `Cal 691` |
| Protein / carbs / fat | **Not in Farq today** → null until enriched |
| Serving | `canonical_items.size_value` / `size_unit` |
| Category | `canonical_items.category` |

**Never** train on `provider_items.id`. Multiple provider images for one `canonical_item_id` = one class.

## Scale (approx)

| Resource | Count |
|----------|------:|
| `canonical_items` | ~34,730 |
| `provider_items` with image + canonical link | ~94,448 |

## Env

```bash
FARQ_SUPABASE_URL=https://mpgbvtaguerncgbzvpwg.supabase.co
FARQ_SUPABASE_SERVICE_KEY=...   # read usage only
FARQ_MAX_ROWS=20000             # optional cap for smoke runs (0 = all)
MAX_CLASSES=500
MIN_IMAGES_PER_CLASS=5
```

## Commands

```bash
cd ml
python -c "from dataset.farq_client import probe_farq; print(probe_farq())"
python -m dataset.generate --name farq_yolo
```
