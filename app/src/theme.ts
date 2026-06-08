/**
 * Design tokens — ported from the Plantaroo web app's CSS custom properties,
 * tuned for a modern, quiet, iOS-native dark aesthetic.
 *
 * Principles (from the web app): no colored pill badges (status = subtle
 * colored text), no emoji (SVG icons), 14px radii, generous whitespace,
 * font weights capped at 700, only things needing attention draw the eye.
 */

export const colors = {
  bg: '#000000',
  bgElevated: '#0A0A0A',
  surface: '#111116',
  surfaceElevated: '#1C1C24',
  surfacePressed: 'rgba(255,255,255,0.03)',

  border: 'rgba(255,255,255,0.06)',
  borderSubtle: 'rgba(255,255,255,0.04)',
  hairline: 'rgba(255,255,255,0.08)',

  textPrimary: '#F5F5F7',
  textSecondary: '#8A8A92',
  textTertiary: '#666',
  textMuted: '#555',
  textFaint: '#444',

  green: '#30D158',
  greenBright: '#4BE572',
  greenDeep: '#159B46',
  greenBg: 'rgba(48,209,88,0.10)',
  greenBgStrong: 'rgba(48,209,88,0.16)',

  orange: '#FF9F0A',
  orangeBg: 'rgba(255,159,10,0.12)',
  red: '#FF453A',
  redSoft: '#FF8A80',
  redBg: 'rgba(255,69,58,0.08)',
  blue: '#0A84FF',
  lightBlue: '#5AC8FA',
  purple: '#BF5AF2',
  purpleBg: 'rgba(191,90,242,0.12)',

  black: '#000000',
  white: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.6)',
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 100,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const font = {
  // System font stack. RN maps undefined fontFamily to SF Pro on iOS.
  size: {
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 15,
    xl: 16,
    title: 22,
    hero: 28,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fab: {
    shadowColor: colors.green,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  floatNav: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
} as const;

/** Status color for a "days until due" value — mirrors getNextDueTextAndClass. */
export function dueColor(daysUntil: number, neverWatered: boolean): string {
  if (neverWatered) return colors.blue;
  if (daysUntil < 0) return colors.red;
  if (daysUntil === 0) return colors.red;
  if (daysUntil <= 2) return colors.orange;
  return colors.textTertiary;
}
