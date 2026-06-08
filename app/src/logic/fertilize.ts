/** FERTILIZING LOGIC — rides on watering count, never a separate schedule. */
import type { Plant } from '../types';

export function isFeedDue(plant: Plant): boolean {
  if (plant.carnivore) return false;
  if (!plant.fert_type || plant.fert_type === 'none') return false;
  if (!plant.feed_every_n_waterings || plant.feed_every_n_waterings <= 0) return false;
  if (plant.no_fert_until && new Date() < new Date(plant.no_fert_until)) return false;
  const count = plant.watering_count || 0;
  const lastFedAt = plant.last_fed_at_count || 0;
  return count - lastFedAt >= plant.feed_every_n_waterings;
}

/** Distilled/rain reminder shows for water-sensitive plants. */
export function needsDistilled(plant: Plant): boolean {
  return plant.water_source === 'distilled_or_rain';
}
