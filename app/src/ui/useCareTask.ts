/** Shared care-task completion: log → toast w/ undo → reschedule digest. */
import { useToast } from './Toast';
import { mistPlant, cleanPlant, prunePlant, undoAction } from '../logic/actions';
import { rescheduleWateringReminders } from '../logic/notify';
import { getPlants } from '../data/db';
import type { CareTask } from '../logic/tasks';
import type { Plant } from '../types';

export function useCareTaskAction() {
  const toast = useToast();

  async function completeTask(plant: Plant, task: CareTask) {
    // Repot check has no one-tap completion — repotting is logged from the
    // detail view (it also suppresses fertilizer for two weeks).
    if (task.type === 'repot_check') return;
    const run = task.type === 'mist' ? mistPlant : task.type === 'clean' ? cleanPlant : prunePlant;
    const message =
      task.type === 'mist'
        ? `${plant.name} misted`
        : task.type === 'clean'
          ? `${plant.name} — leaves cleaned`
          : `${plant.name} pruned`;
    const { undo } = await run(plant);
    rescheduleWateringReminders(getPlants());
    toast.show({
      message,
      onUndo: async () => {
        await undoAction(undo);
        rescheduleWateringReminders(getPlants());
      },
    });
  }

  return { completeTask };
}
