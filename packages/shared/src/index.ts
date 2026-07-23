/** Shared domain types for AI Calorie Scanner (Calora). */

export type ModelStatus =
  | "candidate"
  | "accepted"
  | "rejected"
  | "production"
  | "rolled_back";

export type FeedbackStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "used_in_training";

export type ClientPlatform = "ios" | "android" | "all";

export interface NutritionItem {
  id: string;
  class_id: number;
  item_identity: string;
  name_en: string;
  name_ar: string | null;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_size_g: number;
  serving_label_en: string | null;
  serving_label_ar: string | null;
  category: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelVersion {
  id: string;
  version: string;
  dataset_version_id: string | null;
  trained_at: string;
  status: ModelStatus;
  precision: number | null;
  recall: number | null;
  map50: number | null;
  map50_95: number | null;
  false_positives: number | null;
  false_negatives: number | null;
  metrics: Record<string, unknown>;
  artifact_urls: Record<string, unknown>;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PredictionFeedback {
  id: string;
  user_id: string | null;
  device_id: string | null;
  predicted_class_id: number | null;
  predicted_item_identity: string | null;
  predicted_confidence: number | null;
  corrected_item_identity: string | null;
  corrected_name: string | null;
  image_storage_path: string | null;
  locale: string | null;
  status: FeedbackStatus;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface DatasetVersion {
  id: string;
  version: string;
  source: string;
  class_count: number;
  image_count: number;
  content_hash: string;
  split_train: number;
  split_val: number;
  split_test: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface InferenceResult {
  class_id: number;
  item_identity: string;
  confidence: number;
  /** xyxy normalized or pixel coords depending on runtime */
  bbox?: [number, number, number, number];
  label?: string;
  nutrition?: Pick<
    NutritionItem,
    | "name_en"
    | "name_ar"
    | "calories_kcal"
    | "protein_g"
    | "carbs_g"
    | "fat_g"
    | "serving_size_g"
    | "serving_label_en"
  >;
}

export interface ClientManifest {
  id: string;
  platform: ClientPlatform;
  model_version_id: string;
  nutrition_db_url: string | null;
  labels_url: string | null;
  min_app_version: string | null;
  force_update: boolean;
  active: boolean;
  created_at: string;
}
