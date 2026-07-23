import { create } from 'zustand';

import type { LocaleCode, ModelInfo, ScanResult } from '@/types';
import { LOW_CONFIDENCE_THRESHOLD } from '@/types';
import { detectDeviceLocale } from '@/i18n';

interface SettingsState {
  locale: LocaleCode;
  hapticsEnabled: boolean;
  confidenceThreshold: number;
  hydrated: boolean;
  setLocale: (locale: LocaleCode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setHydrated: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  locale: detectDeviceLocale(),
  hapticsEnabled: true,
  confidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
  hydrated: false,
  setLocale: (locale) => set({ locale }),
  setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
  setHydrated: (hydrated) => set({ hydrated }),
}));

interface ScanState {
  lastResult: ScanResult | null;
  setLastResult: (result: ScanResult | null) => void;
  clear: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  lastResult: null,
  setLastResult: (lastResult) => set({ lastResult }),
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
