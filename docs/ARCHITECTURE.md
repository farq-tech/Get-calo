# System Architecture

## Independence from Farq

```
┌─────────────────────┐     READ-ONLY      ┌──────────────────────┐
│  Farq Supabase      │ ─────────────────► │  Dataset Generator   │
│  (product metadata  │   image URLs +     │  (ml/dataset)        │
│   + item_identity)  │   item identities  └──────────┬───────────┘
└─────────────────────┘                               │
                                                      ▼
┌─────────────────────┐                    ┌──────────────────────┐
│  Mobile App         │ ◄── model CDN ─── │  Train / Export      │
│  (on-device YOLO)    │                    │  YOLO → CoreML/TFLite│
│  local nutrition DB │                    │  / ONNX              │
└─────────┬───────────┘                    └──────────────────────┘
          │ feedback only
          ▼
┌─────────────────────┐
│  Calorie Scanner    │
│  Supabase           │
│  • feedback         │
│  • model_versions   │
│  • nutrition_items  │
│  • dataset_runs     │
└─────────────────────┘
```

**Never:**

- Modify Farq schema or code
- Call Farq APIs for inference
- Use `provider_items` as YOLO class names
- Send meal photos to cloud Vision APIs

## On-device inference path

1. Capture JPEG/HEIC → resize to model input (640×640 default).
2. Run YOLO (CoreML on iOS, TFLite/ONNX on Android).
3. NMS → top detection with `class_id`, `confidence`, bbox.
4. If `confidence < threshold` → soft-fail UI.
5. Else `nutritionDb.getByClassId(class_id)` → macros + serving.
6. Render calorie card; optional user correction → feedback queue.

## Dataset pipeline

```
Farq metadata → download → validate → dedupe (perceptual hash)
  → group by item_identity → labels → YOLO folders
  → augment → train/val/test split → train → evaluate gates
  → export CoreML / TFLite / ONNX → register version
```

## Model versioning

Each artifact set includes:

| Field | Purpose |
|-------|---------|
| `version` | Semver or `vYYYYMMDD.N` |
| `trained_at` | ISO timestamp |
| `dataset_version` | Hash of class list + image set |
| `metrics` | precision, recall, mAP50, mAP50-95 |
| `status` | `candidate` / `accepted` / `rejected` / `production` / `rolled_back` |

Rollback = mark previous `production` version active on CDN + push OTA manifest to clients.

## Scalability (millions of users)

- Inference cost stays ~$0 (device GPU/NPU).
- CDN for model + nutrition DB updates (delta packs).
- Feedback writes are append-only, rate-limited, RLS-protected.
- Admin approval gates training re-ingestion.
- No realtime image upload required for recognition.
