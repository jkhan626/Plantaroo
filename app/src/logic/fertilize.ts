/** FERTILIZING LOGIC — rides on watering count, never a separate schedule. */
import type { Plant } from '../types';

/**
 * Winter feed pause (Phase 2): Nov–Feb, natural-light plants barely grow, so
 * the feed cadence doubles. Computed at display time like the seasonal
 * watering multiplier — NEVER stored. Grow lights keep the normal cadence.
 */
export function isWinterFeedPause(plant: Plant, now: Date = new Date()): boolean {
  if (plant.light_type === 'grow') return false;
  const m = now.getMonth() + 1;
  return m >= 11 || m <= 2;
}

/** Effective feed cadence after the winter pause (0 = never feeds). */
export function getEffectiveFeedEvery(plant: Plant, now: Date = new Date()): number {
  const base = plant.feed_every_n_waterings || 0;
  if (base <= 0) return 0;
  return isWinterFeedPause(plant, now) ? base * 2 : base;
}

export function isFeedDue(plant: Plant): boolean {
  if (plant.carnivore) return false;
  if (!plant.fert_type || plant.fert_type === 'none') return false;
  const every = getEffectiveFeedEvery(plant);
  if (every <= 0) return false;
  if (plant.no_fert_until && new Date() < new Date(plant.no_fert_until)) return false;
  const count = plant.watering_count || 0;
  const lastFedAt = plant.last_fed_at_count || 0;
  return count - lastFedAt >= every;
}

/** Distilled/rain reminder shows for water-sensitive plants. */
export function needsDistilled(plant: Plant): boolean {
  return plant.water_source === 'distilled_or_rain';
}
