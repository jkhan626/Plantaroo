/**
 * Update handling:
 *  - OTA: the latest JS bundle is fetched on cold launch automatically
 *    (configured in app.json updates: checkAutomatically ON_LOAD). We also
 *    fetch silently when the app returns to the foreground.
 *  - Forced native update: a world-readable Firestore doc `public/appConfig`
 *    can hold `minBuildIOS` / `minBuildAndroid`. If the installed native build
 *    is below that minimum, the app shows a blocking "update required" screen.
 *    Fail-open: any error (offline, missing doc) never locks the user out.
 */
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import * as Application from 'expo-application';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/** App Store page for Plantaroo (Apple ID 6778036982). */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6778036982';

/** True if the installed native build is below the server-required minimum. */
export async function isForcedUpdateRequired(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'public', 'appConfig'));
    if (!snap.exists()) return false;
    const data = snap.data() as { minBuildIOS?: number; minBuildAndroid?: number };
    const min = Platform.OS === 'ios' ? data.minBuildIOS : data.minBuildAndroid;
    if (!min) return false;
    const current = parseInt(Application.nativeBuildVersion ?? '0', 10) || 0;
    return current < min;
  } catch {
    return false; // never lock users out on a transient error
  }
}

/** Silently fetch the latest OTA update (applied on next launch). */
export async function fetchOtaUpdateSilently(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const res = await Updates.checkForUpdateAsync();
    if (res.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    /* ignore — OTA is best-effort */
  }
}
