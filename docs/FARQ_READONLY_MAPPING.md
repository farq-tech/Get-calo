# Farq schema mapping (read-only)

The ML pipeline reads Farq via Supabase REST/`select` only. Adjust env vars if your Farq column names differ — **do not change Farq**.

| Pipeline field | Default Farq column / setting |
|----------------|-------------------------------|
| Canonical class | `item_identity` (`FARQ_IDENTITY_COLUMN`) |
| Image URL | `image_url` |
| Names | `name_en`, `name_ar` |
| Macros | `calories`, `protein`, `carbs`, `fat` |
| Serving | `serving_size_g` |
| Category | `category` |
| Table | `items` (`FARQ_ITEMS_TABLE`) |

## Rules

1. **Never** use `provider_items.id` or provider SKUs as YOLO class names.
2. Group every row by `item_identity` before assigning `class_id`.
3. Multiple provider images for one identity → one class, many samples.
4. If Farq exposes views, prefer a read-only view that already resolves identity + image URL + nutrition.

Example env override:

```bash
FARQ_ITEMS_TABLE=catalog_items_view
FARQ_IDENTITY_COLUMN=canonical_item_id
FARQ_IMAGE_URL_COLUMN=primary_image_url
```
