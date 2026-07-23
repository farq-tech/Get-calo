# Deliverables checklist

| Deliverable | Location |
|-------------|----------|
| Complete mobile application | `mobile/` (Calora — Expo, camera, on-device YOLO, nutrition UI, EN/AR RTL) |
| YOLO training pipeline | `ml/train/`, `ml/scripts/run_full_pipeline.py` |
| Dataset generator from Supabase | `ml/dataset/generate.py` + `farq_client.py` (Farq **read-only**) |
| Image downloader | `ml/dataset/download_images.py` |
| Image validator | `ml/dataset/validate.py` |
| Automatic augmentation | `ml/dataset/augment.py` |
| Training scripts | `ml/train/train_yolo.py` |
| Evaluation + reject gates | `ml/train/evaluate.py` |
| CoreML export | `ml/export/export_models.py` (`coreml`, Darwin) |
| TensorFlow Lite export | `ml/export/export_models.py` (`tflite`) |
| ONNX export | `ml/export/export_models.py` (`onnx`) |
| Local nutrition database | `nutrition.sqlite` via export + `mobile/src/db/` |
| Model versioning / rollback | `ml/versioning/registry.py` + `model_versions` / `promote_model_version` |
| User feedback DB | `prediction_feedback` migration + `mobile/src/services/feedback.ts` |
| Admin dashboard | `admin/` |
| Production deployment guide | `docs/PRODUCTION_DEPLOYMENT.md` |
| Render blueprint | `render.yaml` |
| Architecture | `docs/ARCHITECTURE.md` |
| Farq column mapping | `docs/FARQ_READONLY_MAPPING.md` |

**Independence:** Farq is never modified and is never used for inference. Cloud Vision cost remains effectively zero.
