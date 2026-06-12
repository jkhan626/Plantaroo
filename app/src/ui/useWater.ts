/** Shared watering action: late-prompt → water → toast w/ undo → reschedule. */
import { Alert } from 'react-native';
import { useToast } from './Toast';
import { waterPlant, undoAction, type LateChoice } from '../logic/actions';
import { getDaysUntilDue } from '../logic/schedule';
import { rescheduleWateringReminders } from '../logic/notify';
import { recordWateringForReview } from '../lib/review';
import { writeWateringSummary } from '../lib/wateringSummary';
import { getPlants } from '../data/db';
import type { Plant } from '../types';

export interface WaterCallbacks {
  /** Runs after the watering write completes (late prompt resolved, if any). */
  onWatered?: (fed: boolean) => void;
  /** Runs if the user cancels out of the late prompt. */
  onCancel?: () => void;
  /** Suppress the undo toast (the care queue shows its own confirmation). */
  silent?: boolean;
}

export function useWaterAction() {
  const toast = useToast();

  async function doWater(plant: Plant, late: LateChoice, cb?: WaterCallbacks) {
    const { undo, fed } = await waterPlant(plant, late);
    const plants = getPlants();
    rescheduleWateringReminders(plants);
    recordWateringForReview();
    writeWateringSummary(plants);
    if (!cb?.silent) {
      toast.show({
        message: fed ? `${plant.name} watered + fed` : `${plant.name} watered`,
        onUndo: async () => {
          await undoAction(undo);
          const updated = getPlants();
          rescheduleWateringReminders(updated);
          writeWateringSummary(updated);
        },
      });
    }
    cb?.onWatered?.(fed);
  }

  function water(plant: Plant, cb?: WaterCallbacks) {
    const days = getDaysUntilDue(plant);
    if (plant.last_watered && days < 0) {
      Alert.alert(
        'Watering late?',
        `${plant.name} was due ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago.`,
        [
          {
            text: 'Still wet — it lasted',
            onPress: () => doWater(plant, 'still_wet', cb),
          },
          {
            text: 'Just got busy',
            onPress: () => doWater(plant, 'too_busy', cb),
          },
          { text: 'Cancel', style: 'cancel', onPress: () => cb?.onCancel?.() },
        ],
      );
    } else {
      doWater(plant, null, cb);
    }
  }

  return { water };
}
