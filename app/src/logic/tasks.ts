/**
 * CARE TASKS (Phase 2) — misting, leaf cleaning, pruning check, repot check.
 *
 * Rides the same event-anchored philosophy as watering: each task has a
 * last-done anchor on the plant and the next due date is COMPUTED here,
 * never stored. Plants without a task configured never show it — zero noise
 * for the 80% of plants that only need water.
 */
import type { Plant } from '../types';

const MS_PER_DAY = 86_400_000;

export type CareTaskType = 'mist' | 'clean' | 'prune' | 'repot_check';

export interface CareTask {
  type: CareTaskType;
  /** Short label for card rows, e.g. "Mist". */
  label: string;
  /** Whole days until due (<= 0 means due now). */
  daysUntil: number;
}

const PRUNE_MIN_GAP_DAYS = 270; // re-prompt at most once a season
const REPOT_CHECK_DAYS = 456; // ~15 months since potting

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  then.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - then.getTime()) / MS_PER_DAY);
}

/** Recurring-task days-until-due, or null if the task is off for this plant. */
function recurringDaysUntil(
  every: number | undefined,
  lastDone: string | null | undefined,
  fallbackAnchor: string,
  now: Date,
): number | null {
  if (!every || every <= 0) return null;
  const elapsed = daysSince(lastDone ?? fallbackAnchor, now);
  if (elapsed === null) return null;
  return every - elapsed;
}

/** All care tasks configured for this plant, due or not (for detail view). */
export function getCareTasks(plant: Plant, now: Date = new Date()): CareTask[] {
  const tasks: CareTask[] = [];

  const mist = recurringDaysUntil(plant.mist_every_days, plant.last_misted, plant.created_at, now);
  if (mist !== null) tasks.push({ type: 'mist', label: 'Mist', daysUntil: mist });

  const clean = recurringDaysUntil(
    plant.clean_every_days,
    plant.last_cleaned,
    plant.created_at,
    now,
  );
  if (clean !== null) tasks.push({ type: 'clean', label: 'Clean leaves', daysUntil: clean });

  // Pruning check: spring (Mar–May), only for plants the user has pruned
  // before (logging a prune opts the plant in), at most once a season.
  const month = now.getMonth() + 1;
  if (month >= 3 && month <= 5 && plant.last_pruned) {
    const since = daysSince(plant.last_pruned, now);
    if (since !== null && since >= PRUNE_MIN_GAP_DAYS) {
      tasks.push({ type: 'prune', label: 'Prune check', daysUntil: 0 });
    }
  }

  // Repot check: ~15 months since the plant was potted (created) or last
  // repotted. There's no "dismiss" for a check you disagree with, so it only
  // surfaces for a 2-week window every ~3 months — quiet, self-clearing.
  const potted = plant.last_repotted ?? plant.created_at;
  const sincePot = daysSince(potted, now);
  if (sincePot !== null && sincePot >= REPOT_CHECK_DAYS) {
    const overBy = sincePot - REPOT_CHECK_DAYS;
    if (overBy % 90 < 14) {
      tasks.push({ type: 'repot_check', label: 'Repot check', daysUntil: 0 });
    }
  }

  return tasks;
}

/** Only the tasks due now (daysUntil <= 0) — what cards and the queue show. */
export function getDueTasks(plant: Plant, now: Date = new Date()): CareTask[] {
  return getCareTasks(plant, now).filter((t) => t.daysUntil <= 0);
}

/**
 * Next due Date for a recurring task (mist/clean) — used by the notification
 * digest. Returns null if the task is off. Past-due tasks return today.
 */
export function getNextTaskDueDate(
  plant: Plant,
  type: 'mist' | 'clean',
  now: Date = new Date(),
): Date | null {
  const every = type === 'mist' ? plant.mist_every_days : plant.clean_every_days;
  const last = type === 'mist' ? plant.last_misted : plant.last_cleaned;
  if (!every || every <= 0) return null;
  const anchor = new Date(last ?? plant.created_at);
  const due = new Date(anchor.getTime() + every * MS_PER_DAY);
  return due.getTime() < now.getTime() ? now : due;
}
