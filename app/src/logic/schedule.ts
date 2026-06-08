/**
 * CORE WATERING ALGORITHM — ported verbatim from the web app.
 *
 * Key invariants (do not change without reading the web app's CLAUDE.md):
 *  - learned_interval and seasonal_multiplier are ALWAYS separate; the
 *    multiplier is applied at display time, never stored.
 *  - The species baseline is blended in as a prior (weight 2) so a single
 *    gap can't hijack the schedule; it only drifts as real gaps accumulate.
 *  - The clamp keeps the learned interval within 0.5x–2x the soil-adjusted
 *    baseline.
 */
import type { Plant, LightType } from '../types';
import { SOIL_TABLE } from './constants';

const MS_PER_DAY = 86_400_000;

// ---- seasonal multiplier (display-time only, never stored) -------------
export function getSeasonalMultiplier(lightType: LightType): number {
  if (lightType === 'grow') return 1.0;
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 11 || month <= 2) return 1.3; // Nov–Feb
  if (month === 9 || month === 10) return 1.15; // Sep–Oct
  return 1.0;
}

export function getSeasonLabel(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 11 || m <= 2) return 'Winter';
  if (m >= 3 && m <= 5) return 'Spring';
  if (m >= 6 && m <= 8) return 'Summer';
  return 'Fall';
}

// ---- effective starting interval (soil-adjusted baseline) --------------
export function getEffectiveStartingInterval(plant: Plant): number {
  const soil = SOIL_TABLE[plant.soil_type];
  if (!soil || soil.mult === null) return 2; // carnivore peat: kept wet
  return plant.species_baseline_days * soil.mult;
}

// ---- learned interval (baseline prior + rolling last-5 gaps) -----------
export function getLearnedInterval(plant: Plant): number {
  const baseline = getEffectiveStartingInterval(plant);
  const gaps = plant.recent_valid_gaps || [];
  if (gaps.length === 0) return baseline;
  const PRIOR = 2; // baseline weighted as 2 pseudo-observations
  let sum = baseline * PRIOR;
  for (let i = 0; i < gaps.length; i++) sum += gaps[i];
  return sum / (PRIOR + gaps.length);
}

export function getClampedInterval(plant: Plant): number {
  const starting = getEffectiveStartingInterval(plant);
  const ci = getLearnedInterval(plant);
  const lo = starting * 0.5;
  const hi = starting * 2.0;
  return Math.max(lo, Math.min(hi, ci));
}

export function getNextDueDate(plant: Plant): Date | null {
  if (!plant.last_watered) return null; // never watered
  const clamped = getClampedInterval(plant);
  const seasonal = getSeasonalMultiplier(plant.light_type);
  const effective = clamped * seasonal;
  const last = new Date(plant.last_watered);
  return new Date(last.getTime() + effective * MS_PER_DAY);
}

/** Whole-day delta until due. -Infinity = never watered (needs water now). */
export function getDaysUntilDue(plant: Plant): number {
  const due = getNextDueDate(plant);
  if (!due) return -Infinity;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / MS_PER_DAY);
}

/** Push a new valid gap into the rolling window of 5 and recache the interval. */
export function updateIntervalFromGap(plant: Plant, gap: number): void {
  const gaps = (plant.recent_valid_gaps || []).slice();
  gaps.push(gap);
  if (gaps.length > 5) gaps.shift();
  plant.recent_valid_gaps = gaps;
  plant.current_interval = getLearnedInterval(plant);
}

// ---- display helpers ---------------------------------------------------
export function isWateredToday(plant: Plant): boolean {
  if (!plant.last_watered) return false;
  const lw = new Date(plant.last_watered);
  const now = new Date();
  return (
    lw.getFullYear() === now.getFullYear() &&
    lw.getMonth() === now.getMonth() &&
    lw.getDate() === now.getDate()
  );
}

export interface DueText {
  text: string;
  status: 'never' | 'overdue' | 'today' | 'soon' | 'later';
}

export function getDueText(plant: Plant): DueText {
  if (!plant.last_watered) return { text: 'Never watered', status: 'never' };
  const d = getDaysUntilDue(plant);
  if (d < -1) return { text: `${Math.abs(d)}d overdue`, status: 'overdue' };
  if (d === -1) return { text: '1d overdue', status: 'overdue' };
  if (d === 0) return { text: 'Due today', status: 'today' };
  if (d === 1) return { text: 'Due tomorrow', status: 'soon' };
  if (d === 2) return { text: 'In 2 days', status: 'soon' };
  return { text: `In ${d} days`, status: 'later' };
}

/** Short relative label for a last-watered date, e.g. "Today", "3d ago". */
export function relativeDayLabel(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso);
  then.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((now.getTime() - then.getTime()) / MS_PER_DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Format a Date for the "next due" detail row. */
export function formatDueDate(plant: Plant): string {
  const due = getNextDueDate(plant);
  if (!due) return 'After first watering';
  const d = getDaysUntilDue(plant);
  if (d < -1) return `${Math.abs(d)} days overdue`;
  if (d === -1) return '1 day overdue';
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
