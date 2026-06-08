/**
 * Ask for an App Store review at a positive moment — after the user has
 * successfully watered a handful of times. Fires at most once (and iOS itself
 * throttles the system prompt further).
 */
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COUNT_KEY = 'plantaroo:reviewWaterCount';
const ASKED_KEY = 'plantaroo:reviewAsked';
const THRESHOLD = 5;

export async function recordWateringForReview(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return;
    const n = parseInt((await AsyncStorage.getItem(COUNT_KEY)) ?? '0', 10) + 1;
    await AsyncStorage.setItem(COUNT_KEY, String(n));
    if (n >= THRESHOLD && (await StoreReview.hasAction())) {
      await AsyncStorage.setItem(ASKED_KEY, '1');
      await StoreReview.requestReview();
    }
  } catch {
    /* never let review prompting interfere with watering */
  }
}
