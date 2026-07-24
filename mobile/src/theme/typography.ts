/**
 * Calora typography — Syne (display/brand) + IBM Plex Sans Arabic (UI / RTL).
 */

export const fontFamilies = {
  display: 'Syne_700Bold',
  displayMedium: 'Syne_600SemiBold',
  displayRegular: 'Syne_500Medium',
  body: 'IBMPlexSansArabic_400Regular',
  bodyMedium: 'IBMPlexSansArabic_500Medium',
  bodySemiBold: 'IBMPlexSansArabic_600SemiBold',
  bodyBold: 'IBMPlexSansArabic_700Bold',
} as const;

export const typography = {
  brand: {
    fontFamily: fontFamilies.display,
    fontSize: 42,
    letterSpacing: -1.2,
    lineHeight: 48,
  },
  brandSm: {
    fontFamily: fontFamilies.display,
    fontSize: 28,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  heroNumber: {
    fontFamily: fontFamilies.display,
    fontSize: 72,
    letterSpacing: -2.4,
    lineHeight: 78,
  },
  /** Result food title — Plex 600 · 24 */
  foodTitle: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 24,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  /** Plex 600 · 28/34 — UI headlines (not Syne) */
  h1: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 28,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  h2: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 20,
    letterSpacing: -0.2,
    lineHeight: 28,
  },
  h3: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 17,
    letterSpacing: 0,
    lineHeight: 24,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 24,
  },
  bodySm: {
    fontFamily: fontFamilies.body,
    fontSize: 14,
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
    letterSpacing: 0.4,
    lineHeight: 16,
  },
  label: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    lineHeight: 18,
  },
  button: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 16,
    letterSpacing: 0.2,
    lineHeight: 22,
  },
} as const;

export type TypographyToken = keyof typeof typography;
