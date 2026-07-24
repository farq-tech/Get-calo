# Farq-free bootstrap path

You do **not** need Farq access to develop and demo Calora.

## What works without Farq

| Capability | How |
|------------|-----|
| Mobile camera UI + nutrition cards | Bundled `nutrition.sample.json` + mock/on-device inference |
| Admin dashboard | Your Calora Supabase project |
| Feedback corrections | `prediction_feedback` table |
| Model registry | `model_versions` + promote/rollback |
| Training pipeline smoke test | `python -m dataset.generate_demo` (Wikimedia meal photos) |

## Generate demo dataset

```bash
cd ml
source .venv/bin/activate   # or create venv first
pip install -r requirements.txt
python -m dataset.generate_demo
```

Output: `data/datasets/demo_yolo/` with YOLO folders, `labels.json`, `nutrition_seed.json`.

## Seed nutrition into Calora Supabase

```bash
cd ml
python scripts/seed_demo_nutrition.py
```

## Train (small demo)

```bash
python -m train.train_yolo --data ../data/datasets/demo_yolo/data.yaml --epochs 30
python -m train.evaluate --weights models/runs/<run>/weights/best.pt
python -m export.export_models --weights models/runs/<run>/weights/best.pt \
  --labels ../data/datasets/demo_yolo/labels.json
```

Acceptance gates may reject a tiny demo model — lower `MIN_MAP50_ACCEPT` in `.env` for bootstrap only, or pass evaluate with `--no-gate` if available.

## When Farq access arrives

1. Add `FARQ_SUPABASE_URL` + read-only key to `.env`
2. Map columns in `docs/FARQ_READONLY_MAPPING.md`
3. Run `python -m dataset.generate` (Farq path) instead of `generate_demo`
4. Retrain and promote a new model version

Farq remains read-only and is never used for inference.
