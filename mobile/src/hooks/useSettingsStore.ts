import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Platform } from 'react-native';

import type { LocaleCode, ModelInfo, ScanResult } from '@/types';
import { LOW_CONFIDENCE_THRESHOLD } from '@/types';
import { detectDeviceLocale } from '@/i18n';

const GOAL_OPTIONS = [1500, 1800, 2000, 2200, 2500] as const;

const webStorage = {
  getItem: (name: string) => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(name);
  },
};

interface SettingsState {
  locale: LocaleCode;
  hapticsEnabled: boolean;
  shareFeedbackEnabled: boolean;
  confidenceThreshold: number;
  dailyGoalKcal: number;
  hydrated: boolean;
  setLocale: (locale: LocaleCode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setShareFeedbackEnabled: (enabled: boolean) => void;
  setDailyGoalKcal: (kcal: number) => void;
  cycleDailyGoal: () => void;
  setHydrated: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      locale: detectDeviceLocale(),
      hapticsEnabled: true,
      shareFeedbackEnabled: false,
      confidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
      dailyGoalKcal: 2000,
      hydrated: false,
      setLocale: (locale) => set({ locale }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setShareFeedbackEnabled: (shareFeedbackEnabled) => set({ shareFeedbackEnabled }),
      setDailyGoalKcal: (dailyGoalKcal) => set({ dailyGoalKcal }),
      cycleDailyGoal: () => {
        const current = get().dailyGoalKcal;
        const idx = GOAL_OPTIONS.indexOf(current as (typeof GOAL_OPTIONS)[number]);
        const next = GOAL_OPTIONS[(idx + 1) % GOAL_OPTIONS.length] ?? 2000;
        set({ dailyGoalKcal: next });
      },
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: 'calora-settings-v1',
      storage: createJSONStorage(() =>
        Platform.OS === 'web' ? webStorage : webStorage,
      ),
      partialize: (state) => ({
        locale: state.locale,
        shareFeedbackEnabled: state.shareFeedbackEnabled,
        dailyGoalKcal: state.dailyGoalKcal,
        hapticsEnabled: state.hapticsEnabled,
      }),
    },
  ),
);

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
    if (!nutrition) return;
    if (!current) {
      const detection = {
        classId: nutrition.classId,
        confidence: 1,
        bbox: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
        label: nutrition.nameEn,
      };
      set({
        lastResult: {
          imageUri: '',
          detections: [detection],
          topDetection: detection,
          nutrition,
          confidence: 1,
          lowConfidence: false,
          modelVersion: 'manual-1.0',
          inferredAt: new Date().toISOString(),
          usedFallback: true,
        },
      });
      return;
    }
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
