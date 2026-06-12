/**
 * Publish a names-free watering summary to public/summary in Firestore.
 * The Claude Agent "Plantaroo Watering" routine reads this to generate
 * reminders on Life OS. Called after any plant change (water, skip, edit).
 *
 * Privacy: only counts + dates — never plant names, notes, rooms, photos.
 */
import { setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { getAuth } from 'firebase/auth';
import type { Plant } from '../types';

const MS_PER_DAY = 86_400_000;

interface WateringSummary {
  totalPlants: number;
  neverWateredCount: number;
  dueDates: string[];
  newestWateringDaysAgo: number | null;
  updatedAt: string;
}

/** Compute next due date for a plant (same logic as the schedule module). */
function getNextDueDate(plant: Plant): Date | null {
  if (!plant.last_watered) return null;

  const lastWateredMs = new Date(plant.last_watered).getTime();
  const interval = plant.current_interval ?? 7;
  const baseDays = interval * (plant.seasonal_multiplier ?? 1.0);
  const dueMs = lastWateredMs + baseDays * MS_PER_DAY;

  return new Date(dueMs);
}

/** Convert a Date to YYYY-MM-DD string (local time, ET assumed). */
function toYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Build the summary object. */
function buildWateringSummary(plants: Plant[]): Omit<WateringSummary, 'updatedAt'> {
  const dueDates: string[] = [];
  let neverWatered = 0;
  let newestMs: number | null = null;

  for (const p of plants) {
    if (!p.last_watered) {
      neverWatered++;
      continue;
    }

    const lwMs = new Date(p.last_watered).getTime();
    if (newestMs === null || lwMs > newestMs) {
      newestMs = lwMs;
    }

    const due = getNextDueDate(p);
    if (due) {
      dueDates.push(toYMD(due));
    }
  }

  dueDates.sort();

  return {
    totalPlants: plants.length,
    neverWateredCount: neverWatered,
    dueDates,
    newestWateringDaysAgo:
      newestMs === null ? null : Math.floor((Date.now() - newestMs) / MS_PER_DAY),
  };
}

/** Fire-and-forget: publish the summary (never throws). */
let _lastSummaryJSON: string | null = null;

export async function writeWateringSummary(plants: Plant[]): Promise<void> {
  try {
    const auth = getAuth();
    if (!auth.currentUser) return; // Only write when signed in

    const summary = buildWateringSummary(plants);
    const json = JSON.stringify(summary);

    // Skip if unchanged
    if (json === _lastSummaryJSON) return;
    _lastSummaryJSON = json;

    const summaryWithTimestamp: WateringSummary = {
      ...summary,
      updatedAt: new Date().toISOString(),
    };

    const summaryDoc = doc(db, 'public', auth.currentUser.uid, 'summary');
    await setDoc(summaryDoc, summaryWithTimestamp);
  } catch (e) {
    console.warn('[Plantaroo] watering summary write failed:', e);
    // Fire-and-forget: never throw
  }
}
