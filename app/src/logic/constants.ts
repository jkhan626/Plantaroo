/** Constants & option metadata — ported from the web app. */
import type {
  SoilType,
  MoisturePref,
  FertType,
  WaterSource,
} from '../types';

export const SOIL_TABLE: Record<
  SoilType,
  { label: string; short: string; mult: number | null }
> = {
  chunky_aroid: { label: 'Forbidden Cereal / Chunky Aroid', short: 'Chunky Aroid', mult: 0.45 },
  orchid_bark: { label: 'Pure Orchid Bark', short: 'Orchid Bark', mult: 0.5 },
  sphagnum_moss: { label: 'Sphagnum Moss', short: 'Sphagnum', mult: 0.7 },
  regular_perlite: { label: 'Regular Potting + Perlite', short: 'Potting + Perlite', mult: 1.0 },
  cactus_gritty: { label: 'Cactus / Succulent Gritty', short: 'Cactus / Gritty', mult: 1.3 },
  carnivore_peat: { label: 'Carnivore Peat / Perlite', short: 'Carnivore Peat', mult: null },
};

export const SOIL_OPTIONS: SoilType[] = [
  'regular_perlite',
  'chunky_aroid',
  'orchid_bark',
  'sphagnum_moss',
  'cactus_gritty',
  'carnivore_peat',
];

export const ROOMS = [
  'Bedroom',
  'Living Room',
  'Office',
  'Kitchen',
  'Bathroom',
  'Front Window',
  'Side Window',
  'Balcony',
];

export const MOISTURE_OPTIONS: MoisturePref[] = ['moist', 'light_dry', 'moderate_dry', 'full_dry'];
export const FERT_TYPE_OPTIONS: FertType[] = ['balanced', 'orchid_30_10_10', 'high_phosphorus', 'none'];
export const WATER_SRC_OPTIONS: WaterSource[] = ['tap_ok', 'distilled_or_rain'];

/** Longer labels for pickers. */
export const DROPDOWN_LABELS: Record<string, string> = {
  moist: 'Moist (keep evenly moist)',
  light_dry: 'Light dry (top inch)',
  moderate_dry: 'Moderate dry (top half)',
  full_dry: 'Full dry (whole pot)',
  balanced: 'Balanced',
  orchid_30_10_10: 'Orchid 30-10-10',
  high_phosphorus: 'High Phosphorus',
  none: 'None',
  tap_ok: 'Tap OK',
  distilled_or_rain: 'Distilled or rain only',
};

/** Shorter labels for the detail view. */
export const DISPLAY_LABELS: Record<string, string> = {
  moist: 'Moist',
  light_dry: 'Light dry',
  moderate_dry: 'Moderate dry',
  full_dry: 'Full dry',
  balanced: 'Balanced',
  orchid_30_10_10: 'Orchid 30-10-10',
  high_phosphorus: 'High Phosphorus',
  none: 'None',
  tap_ok: 'Tap OK',
  distilled_or_rain: 'Distilled / rain only',
};

export function displayLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return DISPLAY_LABELS[key] ?? key;
}
