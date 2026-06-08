/**
 * Mutating plant actions — water, skip, repot, edit date — each writes through
 * the db* API and appends a history entry. Returns an undo token where the web
 * app offered undo. Ported faithfully from the web app's handlers.
 */
import { dbPut, dbAdd, dbDelete, genId } from '../data/db';
import {
  getEffectiveStartingInterval,
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
