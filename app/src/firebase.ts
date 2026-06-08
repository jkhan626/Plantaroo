/**
 * Firebase init for React Native.
 *
 * - Auth uses AsyncStorage persistence so the user stays signed in across app
 *   restarts (the RN equivalent of browserLocalPersistence).
 * - Firestore uses the default (in-memory) cache. The web app relied on
 *   IndexedDB persistentLocalCache, which doesn't exist in RN; our own
 *   AsyncStorage mirror in data/db.ts provides the offline-first cold start.
 *
 * The web Firebase config is NOT a secret (public by design); per-user
 * isolation is enforced by firestore.rules. Same project as the web app
 * (plantaroo-204ca) so data syncs across web + mobile for the same account.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  // @ts-expect-error - getReactNativePersistence is exported from firebase/auth at runtime
  getReactNativePersistence,
  type Auth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBfQ0-PFAaglQvowhD4uh17QAYrqBiqMtA',
  authDomain: 'plantaroo-204ca.firebaseapp.com',
  projectId: 'plantaroo-204ca',
  storageBucket: 'plantaroo-204ca.firebasestorage.app',
  messagingSenderId: '870788325984',
  appId: '1:870788325984:web:ebf0121f07cec2b4175905',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Already initialized (e.g. fast refresh) — reuse it.
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };
