#!/usr/bin/env bash
# Train Calora YOLO on a rented GPU (RunPod / Vast / Lambda).
# Prerequisites: repo cloned, .env with FARQ_* + CALORIE_* filled.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt

export PYTHONPATH="$PWD"
export PYTHONUNBUFFERED=1

echo "==> Dataset from Farq (read-only)"
python -m dataset.generate --name farq_yolo

echo "==> Train"
python -m train.train_yolo \
  --data data/datasets/farq_yolo/data.yaml \
  --epochs "${TRAIN_EPOCHS:-80}" \
  --batch "${BATCH_SIZE:-16}" \
  --name farq_cloud_v1 \
  --device 0

echo "==> Export ONNX"
python -m export.export_models \
  --weights models/runs/farq_cloud_v1/weights/best.pt \
  --labels data/datasets/farq_yolo/labels.json \
  --out models/exports/farq_cloud_v1

echo "Done → models/exports/farq_cloud_v1"
ls -lah models/exports/farq_cloud_v1
