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
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
}

export type NutrientLevel = 'Low' | 'Medium' | 'High';

export interface NutritionReport {
  foods: Array<{
    nameEn: string;
    nameAr: string;
    weightG: number;
    confidence: number;
    caloriesKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sugarG: number;
    sodiumMg: number;
  }>;
  mealSummary: {
    titleEn: string;
    titleAr: string;
    assumptionsEn: string;
    servingLabelEn: string;
    servingLabelAr: string;
    totalWeightG: number;
  };
  macros: {
    caloriesKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sugarG: number;
    sodiumMg: number;
    cholesterolMg: number;
    saturatedFatG: number;
    unsaturatedFatG: number;
  };
  micronutrients: Record<string, NutrientLevel>;
  healthAnalysis: {
    healthScore: number;
    proteinScore: number;
    fiberScore: number;
    sugarScore: number;
    fatQuality: string;
    sodiumLevel: string;
    mealBalance: string;
    processingLevel: string;
    hydrationSupport: string;
    energyDensity: string;
    whyEn: string;
    whyAr: string;
  };
  dietCompatibility: Record<string, boolean>;
  allergens: string[];
  improvements: Array<{
    actionEn: string;
    actionAr: string;
    kcalDelta: number;
    healthScoreDelta: number;
  }>;
  exerciseEquivalent: {
    walkingMin: number;
    runningMin: number;
    cyclingMin: number;
    swimmingMin: number;
    jumpRopeMin: number;
    strengthTrainingMin: number;
  };
  confidenceDetail: {
    foodRecognition: number;
    portionSize: number;
    calories: number;
    macronutrients: number;
    micronutrients: number;
    overall: number;
  };
}

export interface ScanResult {
  imageUri: string;
  detections: Detection[];
  topDetection: Detection | null;
  nutrition: NutritionItem | null;
  /** Per-item breakdown for mixed plates (AI multi-item). */
  items?: NutritionItem[];
  /** Full AI nutrition vision report when available. */
  report?: NutritionReport | null;
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

export const LOW_CONFIDENCE_THRESHOLD = 0.6;
