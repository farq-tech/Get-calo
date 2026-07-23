export type LocaleCode = 'en' | 'ar';

export interface BoundingBox {
  /** Normalized 0–1 coordinates relative to image width/height */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  classId: number;
  confidence: number;
  bbox: BoundingBox;
  label?: string;
}

export interface NutritionItem {
  classId: number;
  itemIdentity: string;
  nameEn: string;
  nameAr: string | null;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingSizeG: number;
  servingLabelEn: string;
  servingLabelAr: string | null;
  category: string | null;
}

export interface ScanResult {
  imageUri: string;
  detections: Detection[];
  topDetection: Detection | null;
  nutrition: NutritionItem | null;
  confidence: number;
  lowConfidence: boolean;
  modelVersion: string;
  inferredAt: string;
  usedFallback: boolean;
}

export interface FeedbackPayload {
  predictedClassId: number | null;
  predictedItemIdentity: string | null;
  predictedConfidence: number | null;
  correctedItemIdentity: string | null;
  correctedName: string;
  imageUri?: string | null;
  locale: LocaleCode;
  deviceId?: string;
}

export interface ClientManifest {
  id: string;
  platform: 'ios' | 'android' | 'all';
  modelVersion: string;
  modelVersionId: string;
  artifactUrls: {
    onnx?: string;
    tflite?: string;
    coreml?: string;
    labels?: string;
    nutritionDb?: string;
  };
  nutritionDbUrl: string | null;
  labelsUrl: string | null;
  minAppVersion: string | null;
  forceUpdate: boolean;
  active: boolean;
}

export interface ModelInfo {
  version: string;
  loaded: boolean;
  backend: 'onnx' | 'tflite' | 'coreml' | 'mock';
  lastCheckedAt: string | null;
  updateAvailable: boolean;
  offline: boolean;
}

export interface AppSettings {
  locale: LocaleCode;
  hapticsEnabled: boolean;
  confidenceThreshold: number;
}

export const LOW_CONFIDENCE_THRESHOLD = 0.45;
