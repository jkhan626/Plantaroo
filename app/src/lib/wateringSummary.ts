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
import { isViewingOwnAccount } from '../data/db';
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
  // seasonal_multiplier is never stored (computed at display time) — kept here
  // only for backward compatibility with any legacy field; defaults to 1.0.
  const baseDays = interval * ((plant as any).seasonal_multiplier ?? 1.0);
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
    // Only publish for the user's own account — never overwrite my summary with
    // a co-owned account's plants (and I can't write the owner's summary anyway).
    if (!isViewingOwnAccount()) return;

    const summary = buildWateringSummary(plants);
    const json = JSON.stringify(summary);

    // Skip if unchanged
    if (json === _lastSummaryJSON) return;
    _lastSummaryJSON = json;

    const summaryWithTimestamp: WateringSummary = {
      ...summary,
      updatedAt: new Date().toISOString(),
    };

    // NOTE: must be an EVEN-segment path. `public/{uid}/summary` is 3 segments
    // and throws "Document references must have an even number of segments" —
    // which silently broke this write. The summary now lives on the `public/{uid}`
    // doc itself (the nightly Notion routine reads .../documents/public/{uid}).
    const summaryDoc = doc(db, 'public', auth.currentUser.uid);
    await setDoc(summaryDoc, summaryWithTimestamp);
  } catch (e) {
    console.warn('[Plantaroo] watering summary write failed:', e);
    // Fire-and-forget: never throw
  }
}
