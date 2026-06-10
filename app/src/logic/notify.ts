/**
 * Local watering reminders — scheduled on-device (no server, no APNs).
 *
 * Strategy: whenever plant data changes we cancel all pending notifications
 * and reschedule one notification per upcoming due-day at 9am local, capped to
 * stay well under iOS's 64-pending limit. Overdue / never-watered plants roll
 * into the next 9am reminder.
 */
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Plant } from '../types';
import { getNextDueDate, getDaysUntilDue } from './schedule';
import { getNextTaskDueDate } from './tasks';

const ENABLED_KEY = 'plantaroo:notifyEnabled';
const REMINDER_HOUR = 9;
const MAX_DAYS = 30;

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function getNotifyEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ENABLED_KEY);
    return v === null ? true : v === '1'; // default on
  } catch {
    return true;
  }
}

export async function setNotifyEnabled(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Ask for permission. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const res = await Notifications.requestPermissionsAsync();
      status = res.status;
    }
    return status === 'granted';
  } catch {
    return false;
  }
}

async function hasPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** The next REMINDER_HOUR:00 at-or-after `from`. */
function nextReminderSlot(due: Date, from: Date): Date {
  const slot = new Date(due);
  slot.setHours(REMINDER_HOUR, 0, 0, 0);
  // If a plant's due-day 9am has already passed, fold it into the next 9am.
  if (slot.getTime() <= from.getTime()) {
    const todaySlot = new Date(from);
    todaySlot.setHours(REMINDER_HOUR, 0, 0, 0);
    if (todaySlot.getTime() > from.getTime()) return todaySlot;
    const tomorrow = new Date(from);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(REMINDER_HOUR, 0, 0, 0);
    return tomorrow;
  }
  return slot;
}

/**
 * Recompute and reschedule all watering reminders from the current plant list.
 * Safe to call after any data mutation.
 */
export async function rescheduleWateringReminders(plants: Plant[]): Promise<void> {
  let enabled = await getNotifyEnabled();
  if (enabled && !(await hasPermission())) enabled = false;

  // App-icon badge = plants due now (Phase 5, OTA-able). Cleared when off.
  const dueNow = plants.filter((p) => getDaysUntilDue(p) <= 0).length;
  Notifications.setBadgeCountAsync(enabled ? dueNow : 0).catch(() => {});

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    return;
  }
  if (!enabled || plants.length === 0) return;

  const now = new Date();
  const horizon = new Date(now.getTime() + MAX_DAYS * 86_400_000);

  // Bucket plants by the reminder slot they belong to. Water names and
  // non-water care tasks (mist/clean) share a slot so each day gets ONE digest.
  const buckets = new Map<string, { when: Date; names: string[]; taskCount: number }>();
  function bucketFor(when: Date) {
    const key = dayKey(when);
    let b = buckets.get(key);
    if (!b) {
      b = { when, names: [], taskCount: 0 };
      buckets.set(key, b);
    }
    return b;
  }
  for (const p of plants) {
    const due = getNextDueDate(p) ?? now; // never-watered => now
    const when = nextReminderSlot(due, now);
    if (when.getTime() <= horizon.getTime()) bucketFor(when).names.push(p.name);

    // Recurring care tasks ride the same digest (Phase 2).
    for (const type of ['mist', 'clean'] as const) {
      const taskDue = getNextTaskDueDate(p, type, now);
      if (!taskDue) continue;
      const taskWhen = nextReminderSlot(taskDue, now);
      if (taskWhen.getTime() <= horizon.getTime()) bucketFor(taskWhen).taskCount++;
    }
  }

  const slots = Array.from(buckets.values()).sort(
    (a, b) => a.when.getTime() - b.when.getTime(),
  );

  for (const { when, names, taskCount } of slots) {
    const count = names.length;
    let body =
      count === 1
        ? `${names[0]} needs water today.`
        : count > 1
          ? `${count} plants need water today.`
          : '';
    if (taskCount > 0) {
      const tasks = `${taskCount} care task${taskCount === 1 ? '' : 's'}`;
      body = body ? `${body} Plus ${tasks}.` : `${tasks} due today.`;
    }
    if (!body) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Plantaroo', body, sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
        },
      });
    } catch {
      /* skip this slot on error */
    }
  }
}

/** Cancel everything (e.g. on sign-out or when reminders are turned off). */
export async function cancelAllReminders(): Promise<void> {
  Notifications.setBadgeCountAsync(0).catch(() => {});
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* ignore */
  }
}
