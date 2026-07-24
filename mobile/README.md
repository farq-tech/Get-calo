# Calora — AI Calorie Scanner (Mobile)

On-device YOLO food recognition with offline nutrition lookup. Dark teal UI, English + Arabic (RTL).

```
Camera → On-device YOLO → class_id → SQLite nutrition → Calories / macros
```

Cloud is used **only** for optional correction feedback and model OTA manifests — never for inference.

## Requirements

- Node 20+
- Expo CLI / `npx expo`
- iOS Simulator, Android emulator, or device
- **Expo Go**: works with mock inference (ONNX native module not available)
- **Production / Dev Client**: custom build with `onnxruntime-react-native` + model binaries

## Expo project

Linked to Expo dashboard project **get-calo**:

- Project ID: `c32f6466-2d14-45e7-a9ad-17ba2ee4179c`
- Do **not** run `create-expo-app` — this `mobile/` app is already the product.

```bash
# One-time (needs Expo login / EXPO_TOKEN)
cd mobile
npx eas-cli@latest init --id c32f6466-2d14-45e7-a9ad-17ba2ee4179c
```

## Quick start

```bash
cd mobile
# .env already uses Calora Supabase (EXPO_PUBLIC_*)
npm install
npx expo start
```

Env vars (from repo root `.env.example`):

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Calorie Scanner Supabase (NOT Farq) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key for feedback + manifests |
| `EXPO_PUBLIC_MODEL_CDN_URL` | CDN base for OTA model artifacts |

Without Supabase env, the app still runs fully offline with the bundled nutrition seed and mock detector.

## App routes

| Route | Role |
|-------|------|
| `/` | Redirect → camera |
| `/camera` | Full-bleed camera, Calora wordmark, one-tap shutter |
| `/result` | Large calorie number, macros, confidence |
| `/correct` | Search / correct food identity + feedback upload |
| `/settings` | EN/AR toggle (RTL), model version, offline status |

## On-device model wiring

### Expo Go (default today)

`src/inference/yolo.ts` dynamically imports `onnxruntime-react-native`. If the native module is missing, it falls back to a deterministic mock detector so UX, nutrition DB, and feedback flows remain demoable.

### Production backends

| Platform | Format | Integration |
|----------|--------|-------------|
| iOS | CoreML `.mlpackage` / `.mlmodel` | Bundle under `ios/` via Expo config plugin or copy into the Xcode project; load with Vision / CoreML. Prefer CoreML for Neural Engine. |
| Android | TFLite `.tflite` | Bundle in `android/app/src/main/assets/`; run with TensorFlow Lite (GPU / NNAPI delegates). |
| Cross-platform | ONNX `.onnx` | `onnxruntime-react-native` in a **dev client / EAS build** (not Expo Go). |

Pipeline exports (from repo `ml/` + `models/<version>/`):

- `model.mlpackage` / CoreML
- `model.tflite`
- `model.onnx`
- `nutrition.sqlite` + `labels.json`
- `manifest.json`

### Wire ONNX in a custom client

1. Place the model at `assets/models/food_yolo.onnx` (gitignored binaries).
2. Run `npx expo prebuild` then build with EAS or Xcode/Gradle.
3. In `src/inference/yolo.ts` → `loadModel()` / `runInference()`:
   - Create `InferenceSession` from the asset URI
   - Preprocess (letterbox 640, NCHW float32)
   - Run session → NMS → map class ids via `labels.json`
4. Point `modelManager.ts` at active `client_manifests` rows for OTA updates.

### CoreML (iOS) sketch

```swift
// Native module bridge → JS runInference(uri)
let model = try VNCoreMLModel(for: FoodYOLO().model)
let request = VNCoreMLRequest(model: model) { … }
```

### TFLite (Android) sketch

```kotlin
val interpreter = Interpreter(loadModelFile("food_yolo.tflite"))
interpreter.run(inputBuffer, outputBuffer)
```

## Local nutrition DB

- Seed: `assets/nutrition.sample.json` (20 Saudi / MENA + global foods)
- Runtime: `expo-sqlite` via `src/db/nutrition.ts`
- Lookup key: YOLO `class_id`

## Design notes

- Near-black charcoal (`#0A0E0D`) with teal/emerald accent (`#2DD4A8`)
- Syne (display) + IBM Plex Sans Arabic (UI / RTL)
- Motions: shutter pulse, calorie count-up, macro bar slide-in

## Scripts

```bash
npm start          # Expo dev server
npm run ios        # iOS
npm run android    # Android
npm run typecheck  # tsc
npm run prebuild   # generate native projects for ONNX / store builds
```
