/**
 * Calora spacing · radius · elevation · motion — Design System v1.0
 * 8pt base grid. Soft elevation only.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  card: 28,
  full: 999,
} as const;

export const elevation = {
  e0: {
    borderWidth: 1,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  e1: {
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  e2: {
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

/** Durations in ms — match design system motion tokens */
export const motion = {
  micro: 180,
  standard: 240,
  emphasized: 300,
  countUp: 900,
  macroFill: 700,
  macroStagger: 80,
  scanSweep: 3400,
  morph: 650,
  reveal: 420,
  checkIn: 320,
  stepBase: 620,
  stepJitter: 320,
  sattamStartType: 320,
  sattamCharMs: 140,
  sattamCursorHold: 150,
  sattamCreditDelay: 340,
  sattamMorphDelay: 1750,
  sattamStepsDelay: 2500,
} as const;
