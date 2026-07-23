# AI Calorie Scanner

Standalone, production-ready on-device food recognition and nutrition app.

**Independent from Farq.** Farq Supabase is used only as a *read-only* source of product metadata and image URLs for building the YOLO training dataset. Inference never calls Farq (or any cloud Vision API).

```
Camera → On-device YOLO → class_id → Local nutrition DB → Calories / macros
```

## Architecture

| Layer | Tech | Role |
|-------|------|------|
| Mobile | Expo (React Native) + ONNX Runtime / TFLite / CoreML | Camera, on-device inference, offline nutrition |
| ML | Ultralytics YOLO + Python | Dataset gen, train, evaluate, export |
| Admin | Next.js | Model versions, feedback review, dataset ops |
| Data (train) | Farq Supabase (read-only) | Product images + item identities |
| Data (app) | Own Supabase | Feedback, model registry, nutrition sync |

Cloud inference cost ≈ **$0**. Recognition runs on the phone.

## Repo layout

```
├── mobile/          # iOS/Android app (camera + YOLO + nutrition UI)
├── ml/              # Dataset → train → evaluate → export pipeline
├── admin/           # Ops dashboard
├── supabase/        # Own project migrations (feedback, models, nutrition)
├── packages/shared/ # Shared TypeScript types
├── docs/            # Production deployment guide
├── models/          # Versioned exported model artifacts (gitignored binaries)
└── data/            # Local dataset workspace (gitignored)
```

## Quick start

### 1. Environment

```bash
cp .env.example .env
# Fill FARQ_* (read-only) and CALORIE_* (own project) keys
```

### 2. Supabase (own project only)

```bash
# Apply migrations in supabase/migrations to your Calorie Scanner project
# Never run these against Farq.
```

### 3. ML pipeline

```bash
npm run ml:setup
npm run ml:pipeline   # download → validate → augment → train → export
```

Exports land in `models/<version>/` as:

- `model.mlpackage` / CoreML
- `model.tflite`
- `model.onnx`
- `nutrition.sqlite` + `labels.json`
- `manifest.json` (version, metrics, dataset hash)

### 4. Mobile

```bash
cd mobile && npm install && npx expo start
```

### 5. Admin

```bash
cd admin && npm install && npm run dev
```

## Product flow

1. User opens camera (one tap).
2. YOLO detects food → `class_id` + confidence.
3. App looks up nutrition in the **local** SQLite DB.
4. Shows calories, protein, carbs, fat, serving size, confidence.
5. If confidence is low / unknown → “We couldn’t confidently identify this meal.” + correction UI.
6. Corrections sync to a **separate feedback database**; approved rows feed future training.

## Training rules (non-negotiable)

- Classes = **canonical `item_identity`**, never raw `provider_items`.
- Multiple provider images for the same food → one class.
- Auto-reject models below configured mAP / precision gates.
- Every model is versioned with dataset version + metrics + rollback.

## Performance targets

| Metric | Target |
|--------|--------|
| Recognition | < 500 ms |
| Cold start | < 2 s |
| Inference | Offline, on-device |
| Model updates | Background download |

## License

Proprietary — independent product, not part of Farq.
