/** Shared watering action: late-prompt → water → toast w/ undo → reschedule. */
import { Alert } from 'react-native';
import { useToast } from './Toast';
import { waterPlant, undoAction, type LateChoice } from '../logic/actions';
import { getDaysUntilDue } from '../logic/schedule';
import { rescheduleWateringReminders } from '../logic/notify';
import { getPlants } from '../data/db';
import type { Plant } from '../types';

export function useWaterAction() {
  const toast = useToast();

  async function doWater(plant: Plant, late: LateChoice) {
    const { undo, fed } = await waterPlant(plant, late);
    rescheduleWateringReminders(getPlants());
    toast.show({
      message: fed ? `${plant.name} watered + fed` : `${plant.name} watered`,
      onUndo: async () => {
        await undoAction(undo);
        rescheduleWateringReminders(getPlants());
      },
    });
  }

  function water(plant: Plant) {
    const days = getDaysUntilDue(plant);
    if (plant.last_watered && days < 0) {
      Alert.alert(
        'Watering late?',
        `${plant.name} was due ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago.`,
        [
          {
            text: 'Still wet — it lasted',
            onPress: () => doWater(plant, 'still_wet'),
          },
          {
            text: 'Just got busy',
            onPress: () => doWater(plant, 'too_busy'),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } else {
      doWater(plant, null);
    }
  }

  return { water };
}
