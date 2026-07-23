"""Shared ML pipeline settings. Farq is read-only source only."""

from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), str(ROOT / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Farq — READ ONLY for dataset generation
    farq_supabase_url: str = ""
    farq_supabase_service_key: str = ""

    # Own Calorie Scanner project
    calorie_supabase_url: str = ""
    calorie_supabase_service_key: str = ""

    dataset_output_dir: Path = ROOT / "data" / "datasets"
    image_cache_dir: Path = ROOT / "data" / "raw" / "images"
    models_dir: Path = ROOT / "models"

    min_images_per_class: int = 8
    max_classes: int = 5000
    # Cap provider image rows fetched from Farq (None / 0 = all). Useful for smoke runs.
    farq_max_rows: int = 0
    min_image_side: int = 128
    max_aspect_ratio: float = 3.0
    phash_duplicate_threshold: int = 6

    yolo_model: str = "yolov8n.pt"
    train_epochs: int = 100
    img_size: int = 640
    batch_size: int = 16
    confidence_threshold: float = 0.45

    min_map50_accept: float = 0.55
    min_precision_accept: float = 0.50
    min_recall_accept: float = 0.45

    train_split: float = 0.8
    val_split: float = 0.1
    test_split: float = 0.1

    # Farq schema (Get-calo / Farq production) — do not modify Farq
    farq_provider_items_table: str = "provider_items"
    farq_canonical_items_table: str = "canonical_items"
    farq_items_table: str = "provider_items"  # legacy alias
    farq_identity_column: str = "canonical_item_id"
    farq_image_url_column: str = "image"
    farq_name_en_column: str = "name_en"
    farq_name_ar_column: str = "name_ar"
    farq_calories_column: str = "calories"
    farq_protein_column: str = "protein"
    farq_carbs_column: str = "carbs"
    farq_fat_column: str = "fat"
    farq_serving_column: str = "size_value"
    farq_category_column: str = "category"


settings = Settings()
