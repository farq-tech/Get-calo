/**
 * Calora design tokens — deep charcoal/ink with teal–emerald accent.
 * Dark mode is the product default. No purple, cream, or terracotta.
 */

export const colors = {
  // Atmospheric backgrounds
  bg: '#0A0E0D',
  bgElevated: '#121816',
  bgCard: '#161E1B',
  bgMuted: '#1C2622',

  // Gradients (use with LinearGradient)
  gradientDeep: ['#070A09', '#0A0E0D', '#0F1A16'] as const,
  gradientAtmosphere: ['#0A0E0D', '#0D1613', '#0A1210'] as const,
  gradientTealWash: ['rgba(16,185,129,0.18)', 'rgba(10,14,13,0)'] as const,
  gradientShutter: ['#2DD4A8', '#10B981'] as const,

  // Accent — teal / emerald
  accent: '#2DD4A8',
  accentStrong: '#10B981',
  accentSoft: 'rgba(45,212,168,0.14)',
  accentBorder: 'rgba(45,212,168,0.35)',
  accentMuted: '#1A9B78',

  // Text
  text: '#F2F7F5',
  textSecondary: '#A8B8B2',
  textMuted: '#6B7C75',
  textInverse: '#0A0E0D',

  // Semantic macros
  protein: '#5EEAD4',
  carbs: '#FBBF24',
  fat: '#FB923C',
  calories: '#2DD4A8',

  // UI chrome
  border: 'rgba(242,247,245,0.08)',
  borderStrong: 'rgba(242,247,245,0.14)',
  overlay: 'rgba(7,10,9,0.72)',
  overlayHeavy: 'rgba(7,10,9,0.88)',
  danger: '#F87171',
  warning: '#FBBF24',
  success: '#34D399',

  // Confidence
  confidenceHigh: '#34D399',
  confidenceMid: '#FBBF24',
  confidenceLow: '#F87171',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof colors;
