import { create } from 'zustand';

import type { LocaleCode, ModelInfo, ScanResult } from '@/types';
import { LOW_CONFIDENCE_THRESHOLD } from '@/types';
import { detectDeviceLocale } from '@/i18n';

interface SettingsState {
  locale: LocaleCode;
  hapticsEnabled: boolean;
  shareFeedbackEnabled: boolean;
  confidenceThreshold: number;
  hydrated: boolean;
  setLocale: (locale: LocaleCode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setShareFeedbackEnabled: (enabled: boolean) => void;
  setHydrated: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  locale: detectDeviceLocale(),
  hapticsEnabled: true,
  shareFeedbackEnabled: false,
  confidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
  hydrated: false,
  setLocale: (locale) => set({ locale }),
  setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
  setShareFeedbackEnabled: (shareFeedbackEnabled) => set({ shareFeedbackEnabled }),
  setHydrated: (hydrated) => set({ hydrated }),
}));

interface ScanState {
  lastResult: ScanResult | null;
  setLastResult: (result: ScanResult | null) => void;
  applyNutritionOverride: (nutrition: ScanResult['nutrition'], nameHint?: string) => void;
  clear: () => void;
}

export const useScanStore = create<ScanState>((set, get) => ({
  lastResult: null,
  setLastResult: (lastResult) => set({ lastResult }),
  applyNutritionOverride: (nutrition) => {
    const current = get().lastResult;
    if (!current || !nutrition) return;
    set({
      lastResult: {
        ...current,
        nutrition,
        topDetection: {
          classId: nutrition.classId,
          confidence: 1,
          bbox: current.topDetection?.bbox ?? { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
          label: nutrition.nameEn,
        },
        confidence: 1,
        lowConfidence: false,
        usedFallback: true,
      },
    });
  },
  clear: () => set({ lastResult: null }),
}));

interface ModelState {
  info: ModelInfo | null;
  setInfo: (info: ModelInfo) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  info: null,
  setInfo: (info) => set({ info }),
}));
