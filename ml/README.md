# AI Calorie Scanner — YOLO Training Pipeline

End-to-end ML pipeline under `/agent/ml` for training an on-device food detector.

## Critical rules

- **Farq Supabase is READ-ONLY.** Dataset generation only fetches product metadata and image URLs. Never insert/update/delete Farq data.
- **Classes = canonical `item_identity`.** Never use `provider_items` as class labels. Multiple provider images for the same food share one class.
- **On-device export:** ONNX, CoreML (Darwin), TFLite.
- **Synthetic boxes:** Farq product photos have no GT bounding boxes. Each image is treated as a single-object sample with a centered YOLO box covering ~90% of the frame:

  ```
  class_id  0.5  0.5  0.9  0.9
  ```

## Layout

```
ml/
  config/settings.py          # pydantic settings + Farq column mapping
  dataset/
    farq_client.py            # read-only Farq fetch, group by item_identity
    download_images.py        # async download → image_cache_dir/{identity_hash}/
    validate.py               # corrupt / size / aspect / blur / phash filters
    dedupe.py                 # identity + phash helpers
    labels.py                 # contiguous class_id + labels.json / nutrition
    augment.py                # OpenCV/Pillow augmentations
    generate.py               # full dataset orchestrator → YOLO folders + data.yaml
  train/
    train_yolo.py             # Ultralytics training
    evaluate.py               # mAP / precision / recall gates + metrics.json
  export/
    export_models.py          # ONNX / CoreML / TFLite + nutrition.sqlite + manifest
  versioning/
    registry.py               # Calorie Scanner model_versions register/promote/rollback
  scripts/
    run_full_pipeline.py      # generate → train → evaluate → export → register
  tests/
    test_validate.py
```

## Setup

```bash
cd /agent/ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `ml/.env` (Farq keys are read-only; Calorie keys are for registry writes only):

```env
FARQ_SUPABASE_URL=https://xxxx.supabase.co
FARQ_SUPABASE_SERVICE_KEY=...
CALORIE_SUPABASE_URL=https://yyyy.supabase.co
CALORIE_SUPABASE_SERVICE_KEY=...
```

Adjust Farq column names in `config/settings.py` if the live schema differs (`farq_*_column`).

## Run steps

All module CLIs assume the working directory is `/agent/ml` so imports resolve (`config`, `dataset`, …).

### 1. Generate dataset

```bash
cd /agent/ml
python -m dataset.generate --name farq_yolo -v
```

Produces:

- `data/datasets/farq_yolo/images/{train,val,test}/`
- `data/datasets/farq_yolo/labels/{train,val,test}/`
- `data/datasets/farq_yolo/data.yaml`
- `data/datasets/farq_yolo/labels.json`
- `data/datasets/farq_yolo/nutrition.json`

### 2. Train

```bash
python -m train.train_yolo --data data/datasets/farq_yolo/data.yaml
```

### 3. Evaluate (rejects below gates)

```bash
python -m train.evaluate \
  --weights models/runs/<run>/weights/best.pt \
  --data data/datasets/farq_yolo/data.yaml
```

Gates (from settings): `min_map50_accept`, `min_precision_accept`, `min_recall_accept`.

### 4. Export on-device models

```bash
python -m export.export_models \
  --weights models/runs/<run>/weights/best.pt \
  --labels data/datasets/farq_yolo/labels.json
```

Writes ONNX / TFLite / CoreML (when available), `labels.json`, `nutrition.sqlite`, and `manifest.json`.

### 5. Register version (Calorie Scanner only)

```bash
python -m versioning.registry register \
  --version v20260723.1 \
  --weights models/runs/<run>/weights/best.pt \
  --export-dir models/exported/<run> \
  --metrics models/runs/<run>/eval/metrics.json \
  --promote
```

## Full pipeline

```bash
cd /agent/ml
python -m scripts.run_full_pipeline -v
```

Useful flags: `--skip-generate`, `--skip-train`, `--skip-export`, `--skip-register`, `--epochs 50`, `--promote`.

Rejected models (failed eval gates) exit with code `2` and are **not** exported/registered when running the full pipeline.

## Tests

```bash
cd /agent/ml
pytest tests/ -q
```

## Notes

- Image cache: `data/raw/images/{sha256(item_identity)[:16]}/`
- Broken download URLs are skipped after retries; Farq rows are never altered.
- Augmentation fills classes below `min_images_per_class` when generating.
