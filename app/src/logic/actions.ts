/**
 * Mutating plant actions — water, skip, repot, edit date — each writes through
 * the db* API and appends a history entry. Returns an undo token where the web
 * app offered undo. Ported faithfully from the web app's handlers.
 */
import { dbPut, dbAdd, dbDelete, genId, getPlants, getHistory } from '../data/db';
import {
  getEffectiveStartingInterval,
  getLearnedInterval,
  updateIntervalFromGap,
} from './schedule';
import { isFeedDue } from './fertilize';
import type { Plant, HistoryEntry, HistoryType, LateReason } from '../types';

const MS_PER_DAY = 86_400_000;

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

export interface UndoToken {
  snapshot: Plant;
  historyId: number;
}

export type LateChoice = 'still_wet' | 'too_busy' | null;

/** Water a plant. lateReason 'too_busy' discards the gap from learning. */
export async function waterPlant(
  input: Plant,
  lateReason: LateChoice = null,
): Promise<{ undo: UndoToken; fed: boolean }> {
  const snapshot = clone(input);
  const plant = clone(input);
  const now = new Date().toISOString();

  if (plant.last_watered) {
    const gapDays = (Date.now() - new Date(plant.last_watered).getTime()) / MS_PER_DAY;
    if (lateReason !== 'too_busy') {
      updateIntervalFromGap(plant, gapDays); // 'still_wet' & on-time gaps are valid evidence
    }
    // 'too_busy': discard the gap entirely — keep prior learning.
  } else {
    plant.current_interval = getEffectiveStartingInterval(plant);
    plant.recent_valid_gaps = [];
  }

  plant.last_watered = now;
  plant.watering_count = (plant.watering_count || 0) + 1;

  let type: HistoryType = 'Watered';
  if (isFeedDue(plant)) {
    plant.last_fertilized = now;
    plant.last_fed_at_count = plant.watering_count;
    type = 'Watered + Fed';
  }

  await dbPut('plants', plant);

  const label: LateReason =
    lateReason === 'still_wet' ? 'Still wet' : lateReason === 'too_busy' ? 'Too busy' : null;
  const entry: HistoryEntry = {
    id: genId(),
    plantId: plant.id,
    plantName: plant.name,
    date: now,
    type,
    lateReason: label,
  };
  const historyId = (await dbAdd('history', entry)) as number;

  return { undo: { snapshot, historyId }, fed: type === 'Watered + Fed' };
}

/** Skip: reset the schedule anchor to now WITHOUT learning a gap or feeding. */
export async function skipPlant(input: Plant): Promise<{ undo: UndoToken }> {
  const snapshot = clone(input);
  const plant = clone(input);
  const now = new Date().toISOString();
  plant.last_watered = now; // anchor moves; watering_count & gaps untouched
  await dbPut('plants', plant);

  const entry: HistoryEntry = {
    id: genId(),
    plantId: plant.id,
    plantName: plant.name,
    date: now,
    type: 'Skipped',
    lateReason: null,
  };
  const historyId = (await dbAdd('history', entry)) as number;
  return { undo: { snapshot, historyId } };
}

/** Repot: suppress fertilizer for 2 weeks. */
export async function repotPlant(input: Plant): Promise<{ undo: UndoToken }> {
  const snapshot = clone(input);
  const plant = clone(input);
  const now = new Date();
  plant.no_fert_until = new Date(now.getTime() + 14 * MS_PER_DAY).toISOString();
  await dbPut('plants', plant);

  const entry: HistoryEntry = {
    id: genId(),
    plantId: plant.id,
    plantName: plant.name,
    date: now.toISOString(),
    type: 'Repotted',
    lateReason: null,
  };
  const historyId = (await dbAdd('history', entry)) as number;
  return { undo: { snapshot, historyId } };
}

/** Restore a plant snapshot and remove the action's history entry. */
export async function undoAction(token: UndoToken): Promise<void> {
  await dbPut('plants', token.snapshot);
  await dbDelete('history', token.historyId);
}

/** YYYY-MM-DD -> ISO at local noon (avoids TZ day-shift). */
export function ymdToISO(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

/** Correct the last-watered date (no gap learning — this is a correction). */
export async function setLastWatered(input: Plant, iso: string | null): Promise<void> {
  const plant = clone(input);
  if (!iso) {
    plant.last_watered = null;
    plant.recent_valid_gaps = [];
    plant.current_interval = getEffectiveStartingInterval(plant);
    plant.watering_count = 0;
  } else {
    plant.last_watered = iso;
    if (!plant.watering_count) plant.watering_count = 1;
  }
  await dbPut('plants', plant);
}

/** Bulk-backfill last-watered for every never-watered plant. Returns count set. */
export async function bulkSetLastWatered(plants: Plant[], iso: string): Promise<number> {
  let n = 0;
  for (const p of plants) {
    if (!p.last_watered) {
      const plant = clone(p);
      plant.last_watered = iso;
      if (!plant.watering_count) plant.watering_count = 1;
      await dbPut('plants', plant);
      n++;
    }
  }
  return n;
}

/** Save notes (autosave on blur). */
export async function saveNotes(input: Plant, notes: string): Promise<void> {
  const plant = clone(input);
  plant.notes = notes;
  await dbPut('plants', plant);
}

/** Patch arbitrary editable fields (name, room, light, soil, profile, photo). */
export async function patchPlant(input: Plant, patch: Partial<Plant>): Promise<void> {
  const plant = { ...clone(input), ...patch };
  await dbPut('plants', plant);
}

/**
 * Rebuild a plant's watering-derived state purely from its remaining history.
 * Used after an event is removed ("unwater") so the schedule self-corrects
 * regardless of which event was deleted.
 */
export function recomputeWateringState(input: Plant, hist: HistoryEntry[]): Plant {
  const plant = clone(input);
  const events = hist
    .filter((h) => h.type === 'Watered' || h.type === 'Watered + Fed' || h.type === 'Skipped')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (events.length === 0) {
    plant.last_watered = null;
    plant.watering_count = 0;
    plant.recent_valid_gaps = [];
    plant.last_fertilized = null;
    plant.last_fed_at_count = 0;
    plant.current_interval = getEffectiveStartingInterval(plant);
    return plant;
  }

  // Anchor = most recent event (water or skip both move it).
  plant.last_watered = events[events.length - 1].date;

  const waterings = events.filter((e) => e.type !== 'Skipped');
  plant.watering_count = waterings.length;

  // Rebuild the rolling gap window from consecutive events; skips push no gap,
  // and "Too busy" gaps were discarded from learning.
  const gaps: number[] = [];
  for (let i = 1; i < events.length; i++) {
    const cur = events[i];
    if (cur.type === 'Skipped' || cur.lateReason === 'Too busy') continue;
    const g = (new Date(cur.date).getTime() - new Date(events[i - 1].date).getTime()) / MS_PER_DAY;
    if (g > 0) gaps.push(g);
  }
  plant.recent_valid_gaps = gaps.slice(-5);

  const fed = waterings.filter((e) => e.type === 'Watered + Fed');
  if (fed.length) {
    const lastFed = fed[fed.length - 1];
    plant.last_fertilized = lastFed.date;
    const idx = waterings.findIndex((e) => e.id === lastFed.id);
    plant.last_fed_at_count = idx >= 0 ? idx + 1 : plant.watering_count;
  } else {
    plant.last_fertilized = null;
    plant.last_fed_at_count = 0;
  }

  plant.current_interval = getLearnedInterval(plant);
  return plant;
}

/** Remove a history event and recompute the plant's schedule from what's left. */
export async function removeHistoryEntry(entry: HistoryEntry): Promise<void> {
  await dbDelete('history', entry.id);
  const plant = getPlants().find((p) => p.id === entry.plantId);
  if (!plant) return;
  const remaining = getHistory().filter((h) => h.plantId === plant.id);
  await dbPut('plants', recomputeWateringState(plant, remaining));
}
