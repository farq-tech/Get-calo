import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';

import type { LocaleCode } from '@/types';
import en from './en.json';
import ar from './ar.json';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
} as const;

function detectDeviceLocale(): LocaleCode {
  const code = Localization.getLocales()[0]?.languageCode?.toLowerCase();
  return code === 'ar' ? 'ar' : 'en';
}

export function isRtlLocale(locale: LocaleCode): boolean {
  return locale === 'ar';
}

/**
 * Apply RTL layout for Arabic. May require a reload on some platforms
 * when switching mid-session (I18nManager.isRTL is sticky until restart).
 */
export function applyRtl(locale: LocaleCode): boolean {
  const wantRtl = isRtlLocale(locale);
  const needsReload = I18nManager.isRTL !== wantRtl;
  if (needsReload) {
    I18nManager.allowRTL(wantRtl);
    I18nManager.forceRTL(wantRtl);
  }
  return needsReload;
}

export async function initI18n(preferred?: LocaleCode): Promise<LocaleCode> {
  const locale = preferred ?? detectDeviceLocale();

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources,
      lng: locale,
      fallbackLng: 'en',
      compatibilityJSON: 'v4',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  } else {
    await i18n.changeLanguage(locale);
  }

  applyRtl(locale);
  return locale;
}

export async function setAppLanguage(locale: LocaleCode): Promise<boolean> {
  await i18n.changeLanguage(locale);
  const needsReload = applyRtl(locale);

  // Web can flip direction immediately without a full reload.
  if (typeof document !== 'undefined') {
    document.documentElement.dir = isRtlLocale(locale) ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    return false;
  }

  return needsReload;
}

export { detectDeviceLocale };
export default i18n;
