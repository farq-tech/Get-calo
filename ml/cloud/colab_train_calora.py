#!/usr/bin/env python3
"""Calora YOLO training for Google Colab (copy cells into a notebook).

Usage in Colab:
  1. Runtime → GPU
  2. Paste FARQ_* / CALORIE_* secrets into the CONFIG cell
  3. Run all

Or run as a script after cloning the repo on any GPU machine:
  python ml/cloud/colab_train_calora.py
"""

from __future__ import annotations

# ═══════════════════════════════════════════════════════════
# CELL 1 — config (fill in Colab; do not commit real keys)
# ═══════════════════════════════════════════════════════════
import os
from pathlib import Path

CONFIG = {
    "FARQ_SUPABASE_URL": os.environ.get("FARQ_SUPABASE_URL", ""),
    "FARQ_SUPABASE_SERVICE_KEY": os.environ.get("FARQ_SUPABASE_SERVICE_KEY", ""),
    "CALORIE_SUPABASE_URL": os.environ.get("CALORIE_SUPABASE_URL", ""),
    "CALORIE_SUPABASE_SERVICE_KEY": os.environ.get("CALORIE_SUPABASE_SERVICE_KEY", ""),
    # Caps — raise after first successful run
    "FARQ_MAX_ROWS": "20000",
    "MAX_CLASSES": "500",
    "MIN_IMAGES_PER_CLASS": "4",
    "TRAIN_EPOCHS": "80",
    "BATCH_SIZE": "16",
    "IMG_SIZE": "640",
    "YOLO_MODEL": "yolov8n.pt",
}

# ═══════════════════════════════════════════════════════════
# CELL 2 — clone / install
# ═══════════════════════════════════════════════════════════
def setup_repo(repo_url: str = "https://github.com/farq-sa/Get-calo.git", branch: str = "main") -> Path:
    root = Path("/content/Get-calo") if Path("/content").exists() else Path(__file__).resolve().parents[2]
    if Path("/content").exists() and not root.exists():
        import subprocess

        subprocess.check_call(["git", "clone", "--branch", branch, "--depth", "1", repo_url, str(root)])
        # Prefer feature branch if main is behind
        try:
            subprocess.check_call(
                ["git", "-C", str(root), "fetch", "origin", "cursor/ai-calorie-scanner-929b"],
                stderr=subprocess.DEVNULL,
            )
            subprocess.check_call(
                ["git", "-C", str(root), "checkout", "cursor/ai-calorie-scanner-929b"],
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            pass

    ml = root / "ml"
    os.chdir(ml)
    import subprocess

    subprocess.check_call(
        [
            "pip",
            "install",
            "-q",
            "ultralytics",
            "supabase",
            "opencv-python-headless",
            "pillow",
            "imagehash",
            "aiohttp",
            "aiofiles",
            "python-dotenv",
            "pyyaml",
            "tqdm",
            "onnx",
            "onnxruntime-gpu",
            "httpx",
            "pydantic-settings",
        ]
    )
    return ml


# ═══════════════════════════════════════════════════════════
# CELL 3 — write .env + build dataset from Farq (read-only)
# ═══════════════════════════════════════════════════════════
def write_env(ml: Path) -> None:
    lines = [f"{k}={v}" for k, v in CONFIG.items() if v]
    (ml / ".env").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (ml.parent / ".env").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Wrote .env (Farq read-only + Calora)")


def build_dataset() -> Path:
    import sys

    sys.path.insert(0, str(Path.cwd()))
    from dataset.generate import generate_dataset

    out = generate_dataset(dataset_name="farq_yolo")
    print("Dataset:", out)
    return out


# ═══════════════════════════════════════════════════════════
# CELL 4 — train on GPU
# ═══════════════════════════════════════════════════════════
def train(data_yaml: Path) -> Path:
    import sys

    sys.path.insert(0, str(Path.cwd()))
    from train.train_yolo import train_yolo

    run = train_yolo(
        data_yaml,
        model=CONFIG["YOLO_MODEL"],
        epochs=int(CONFIG["TRAIN_EPOCHS"]),
        batch=int(CONFIG["BATCH_SIZE"]),
        imgsz=int(CONFIG["IMG_SIZE"]),
        device="0",  # Colab / cloud GPU
        run_name="farq_colab_v1",
        workers=2,
    )
    print("Run dir:", run)
    return run


# ═══════════════════════════════════════════════════════════
# CELL 5 — export ONNX + package
# ═══════════════════════════════════════════════════════════
def export_and_pack(run_dir: Path) -> Path:
    import sys

    sys.path.insert(0, str(Path.cwd()))
    from export.export_models import export_models

    weights = run_dir / "weights" / "best.pt"
    labels = Path("data/datasets/farq_yolo/labels.json")
    out = export_models(
        weights,
        labels_json=labels,
        out_dir=Path("models/exports/farq_colab_v1"),
        include_tflite=False,  # ONNX first; TFLite optional later
        include_coreml=False,
    )
    print("Export:", out)
    return Path("models/exports/farq_colab_v1")


def maybe_register(version: str = "v0.2.0-colab") -> None:
    """Register + promote in Calora Supabase if service key present."""
    import json

    import httpx

    url = CONFIG.get("CALORIE_SUPABASE_URL", "").rstrip("/")
    key = CONFIG.get("CALORIE_SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("Skip registry — no CALORIE_* key")
        return
    payload = {
        "version": version,
        "status": "accepted",
        "notes": "Trained on cloud GPU via Colab/remote script",
        "artifact_urls": {"onnx": "models/exports/farq_colab_v1/best.onnx"},
        "metrics": {"source": "colab"},
    }
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    r = httpx.post(f"{url}/rest/v1/model_versions", headers=headers, json=payload, timeout=60)
    print("register", r.status_code)
    httpx.post(
        f"{url}/rest/v1/rpc/promote_model_version",
        headers=headers,
        json={"p_version": version},
        timeout=30,
    )


# ═══════════════════════════════════════════════════════════
# main
# ═══════════════════════════════════════════════════════════
def main() -> None:
    if not CONFIG["FARQ_SUPABASE_URL"] or not CONFIG["FARQ_SUPABASE_SERVICE_KEY"]:
        raise SystemExit(
            "Set FARQ_SUPABASE_URL and FARQ_SUPABASE_SERVICE_KEY in CONFIG / env first."
        )
    ml = setup_repo()
    write_env(ml)
    ds = build_dataset()
    run = train(ds / "data.yaml")
    pack = export_and_pack(run)
    maybe_register()
    print("\nDONE. Download from:", pack.resolve())
    print("Files:", list(pack.glob("*")))


if __name__ == "__main__":
    main()
