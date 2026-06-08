/**
 * DATA LAYER — Firestore source of truth + in-memory session cache + an
 * AsyncStorage mirror for instant, offline-first cold starts.
 *
 * Ported from the web app's `db*` API so feature code stays storage-agnostic:
 *   reads come from the in-memory `_cache`; ALL writes go through
 *   dbPut/dbAdd/dbDelete, which write to Firestore, update the cache, persist
 *   the mirror, and notify subscribers.
 *
 * Firestore layout: users/{uid}/plants, /history, /profileCache, /meta
 * Doc id = String(id) for plants/history (integer `id` preserved in the doc);
 * cacheKey for profileCache. IDs stay integers (genId), as the UI relies on it.
 */
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import type { Plant, HistoryEntry, Store } from '../types';

type Cache = {
  plants: Plant[];
  history: HistoryEntry[];
  profileCache: Record<string, any>;
};

let _uid: string | null = null;
let _cache: Cache = { plants: [], history: [], profileCache: {} };

// ---- change notification (screens subscribe) ---------------------------
type Listener = () => void;
const _listeners = new Set<Listener>();
export function subscribe(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
function emit() {
  _listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore listener errors */
    }
  });
}

// ---- id generator (integer semantics, collision-safe within a ms) ------
let _idSeq = 0;
export function genId(): number {
  return Date.now() * 1000 + (_idSeq++ % 1000);
}

// ---- session lifecycle -------------------------------------------------
function diskKey(uid: string) {
  return `plantaroo:cache:${uid}`;
}

export function getUid(): string | null {
  return _uid;
}

/** Synchronous snapshot reads for render (never hit the network). */
export function getPlants(): Plant[] {
  return _cache.plants;
}
export function getHistory(): HistoryEntry[] {
  return _cache.history;
}

/**
 * Begin a session: hydrate instantly from disk (so the UI paints offline),
 * then refresh from the cloud in the background.
 */
export async function startSession(uid: string): Promise<void> {
  _uid = uid;
  await hydrateFromDisk();
  emit();
  // Fire-and-forget cloud refresh; failures keep the disk snapshot.
  loadAllFromCloud()
    .then(() => {
      persistToDisk();
      emit();
    })
    .catch(() => {
      /* offline — keep the disk snapshot */
    });
}

export function endSession() {
  _uid = null;
  _cache = { plants: [], history: [], profileCache: {} };
  emit();
}

async function hydrateFromDisk(): Promise<void> {
  if (!_uid) return;
  try {
    const raw = await AsyncStorage.getItem(diskKey(_uid));
    if (raw) {
      const parsed = JSON.parse(raw) as Cache;
      _cache = {
        plants: parsed.plants ?? [],
        history: parsed.history ?? [],
        profileCache: parsed.profileCache ?? {},
      };
    }
  } catch {
    /* corrupt or missing — start empty */
  }
}

let _persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistToDisk() {
  if (!_uid) return;
  const uid = _uid;
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    AsyncStorage.setItem(diskKey(uid), JSON.stringify(_cache)).catch(() => {});
  }, 150);
}

// ---- Firestore helpers -------------------------------------------------
function requireUid(): string {
  if (!_uid) throw new Error('Not signed in');
  return _uid;
}
function colRef(store: Store) {
  return collection(db, 'users', requireUid(), store);
}
function docRef(store: Store, docId: string | number) {
  // '/' is illegal in Firestore doc ids; only profileCache keys could contain one.
  return doc(db, 'users', requireUid(), store, String(docId).replace(/\//g, '_'));
}
function keyField(store: Store): 'cacheKey' | 'id' {
  return store === 'profileCache' ? 'cacheKey' : 'id';
}

/** Pull every store from Firestore into the in-memory cache (called on refresh). */
export async function loadAllFromCloud(): Promise<void> {
  const stores: Store[] = ['plants', 'history', 'profileCache'];
  await Promise.all(
    stores.map(async (store) => {
      const snap = await getDocs(colRef(store));
      if (store === 'profileCache') {
        const next: Record<string, any> = {};
        snap.forEach((d) => {
          next[d.id] = d.data();
        });
        _cache.profileCache = next;
      } else if (store === 'plants') {
        const next: Plant[] = [];
        snap.forEach((d) => next.push(d.data() as Plant));
        _cache.plants = next;
      } else {
        const next: HistoryEntry[] = [];
        snap.forEach((d) => next.push(d.data() as HistoryEntry));
        _cache.history = next;
      }
    }),
  );
}

// ---- public db* API ----------------------------------------------------
export async function dbGetAll(store: 'plants'): Promise<Plant[]>;
export async function dbGetAll(store: 'history'): Promise<HistoryEntry[]>;
export async function dbGetAll(store: 'profileCache'): Promise<any[]>;
export async function dbGetAll(store: Store): Promise<any[]> {
  if (store === 'profileCache') return Object.values(_cache.profileCache);
  return (_cache[store] as any[]).slice();
}

export async function dbGet(store: 'profileCache', key: string): Promise<any>;
export async function dbGet(store: 'plants' | 'history', key: number): Promise<any>;
export async function dbGet(store: Store, key: string | number): Promise<any> {
  if (store === 'profileCache') return _cache.profileCache[key as string];
  const arr = _cache[store] as Array<{ id: number }>;
  return arr.find((x) => x.id === key);
}

export async function dbPut(store: Store, item: any): Promise<string | number> {
  const key = item[keyField(store)];
  await setDoc(docRef(store, key), item);
  if (store === 'profileCache') {
    _cache.profileCache[key] = item;
  } else {
    const arr = _cache[store] as Array<{ id: number }>;
    const i = arr.findIndex((x) => x.id === key);
    if (i >= 0) arr[i] = item;
    else arr.push(item);
  }
  persistToDisk();
  emit();
  return key;
}

export async function dbAdd(store: Store, item: any): Promise<string | number> {
  if (store !== 'profileCache' && (item.id === undefined || item.id === null)) {
    item.id = genId();
  }
  return dbPut(store, item);
}

export async function dbDelete(store: Store, key: string | number): Promise<void> {
  await deleteDoc(docRef(store, key));
  if (store === 'profileCache') {
    delete _cache.profileCache[key as string];
  } else {
    const arr = _cache[store] as Array<{ id: number }>;
    const i = arr.findIndex((x) => x.id === key);
    if (i >= 0) arr.splice(i, 1);
  }
  persistToDisk();
  emit();
}

/** Permanently delete every doc in the user's subtree (account deletion). */
export async function deleteAllUserData(): Promise<void> {
  const stores: Store[] = ['plants', 'history', 'profileCache'];
  for (const store of stores) {
    const snap = await getDocs(colRef(store));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
  if (_uid) {
    await AsyncStorage.removeItem(diskKey(_uid)).catch(() => {});
  }
  _cache = { plants: [], history: [], profileCache: {} };
  emit();
}
