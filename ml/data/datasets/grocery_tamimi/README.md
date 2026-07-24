# Grocery nutrition catalog (Tamimi Markets → Calora)

Source: Farq `provider_items` for Tamimi Markets / Bett Reema (**read-only**).

Calories: matched to **USDA SR Legacy** (per 100 g) with Gulf synonym map; Open Food Facts used as fallback when available.

## Rebuild

```bash
cd /agent
python3 ml/scripts/build_grocery_nutrition_catalog.py
```

Outputs under `ml/data/datasets/grocery_tamimi/`:

| File | Purpose |
|------|---------|
| `nutrition.json` | All food classes + kcal/macros |
| `labels.json` | Class list for recognition |
| `train_subset_300.json` | Top classes by image count (for YOLO) |
| `summary.json` | Counts / sources |

## Prepare recognition dataset

```bash
python3 ml/scripts/prepare_grocery_yolo.py --max-classes 100
```

Then train with Ultralytics against `ml/data/datasets/grocery_yolo/yolo/data.yaml`.

## Notes

- Values are **kcal per 100 g** (packaged-food convention).
- Non-food household SKUs (bleach, detergent, pads, …) are filtered out.
- Unmatched names stay in `nutrition.json` with `source: unmatched` and are **not** seeded to Calora until a match exists.
