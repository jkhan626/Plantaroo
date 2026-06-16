/**
 * DATA LAYER — Firestore source of truth + in-memory session cache + an
 * AsyncStorage mirror for instant, offline-first cold starts.
 *
 * Ported from the web app's `db*` API so feature code stays storage-agnostic:
 *   reads come from the in-memory `_cache`; ALL writes go through
 *   dbPut/dbAdd/dbDelete, which write to Firestore, update the cache, persist
 *   the mirror, and notify subscribers.
 *
 * Firestore layout: users/{uid}/plants, /history, /profileCache, /journal
 * Doc id = String(id) for plants/history (integer `id` preserved in the doc);
 * cacheKey for profileCache. IDs stay integers (genId), as the UI relies on it.
 *
 * SHARED ACCOUNTS: the signed-in user (`_signedInUid`) may view another owner's
 * data when they've been added as a co-owner. `_activeOwnerUid` is whose subtree
 * the cache mirrors and where every read/write goes — it defaults to the signed-in
 * user and is changed via switchAccount(). Auth-bound actions (account deletion,
 * the names-free watering summary) always use the signed-in uid, never the active
 * owner. While a *shared* account is active we attach onSnapshot listeners so a
 * co-owner's edits show live; own-account behaviour (refresh on open) is unchanged.
 */
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import { writeWateringSummary } from '../lib/wateringSummary';
import type { Plant, HistoryEntry, JournalEntry, Store } from '../types';

type Cache = {
  plants: Plant[];
  history: HistoryEntry[];
  journal: JournalEntry[];
  profileCache: Record<string, any>;
};

const EMPTY_CACHE = (): Cache => ({ plants: [], history: [], journal: [], profileCache: {} });

let _signedInUid: string | null = null; // the authenticated user
let _activeOwnerUid: string | null = null; // whose data is loaded (defaults to signed-in)
let _activeOwnerName: string | null = null; // display name when viewing a shared account
let _cache: Cache = EMPTY_CACHE();
let _hydrated = false;

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
function activeOwnerPrefKey(signedInUid: string) {
  return `plantaroo:activeOwner:${signedInUid}`;
}

/** The account whose data is currently loaded (own uid, or a co-owned one). */
export function getUid(): string | null {
  return _activeOwnerUid;
}
/** The authenticated user — used for auth-bound actions, never for data paths. */
export function getSignedInUid(): string | null {
  return _signedInUid;
}
/** True when the loaded account is the signed-in user's own. */
export function isViewingOwnAccount(): boolean {
  return !!_signedInUid && _signedInUid === _activeOwnerUid;
}
/** Display name of the shared account being viewed, or null when on own data. */
export function getActiveOwnerName(): string | null {
  return isViewingOwnAccount() ? null : _activeOwnerName;
}

/** Synchronous snapshot reads for render (never hit the network). */
export function getPlants(): Plant[] {
  return _cache.plants;
}
export function getHistory(): HistoryEntry[] {
  return _cache.history;
}
export function getJournal(): JournalEntry[] {
  return _cache.journal;
}

/**
 * True once the first load has settled — either the disk mirror had data, or
 * the initial cloud refresh finished (successfully or not). Screens show
 * skeleton rows while this is false and the cache is empty.
 */
export function isHydrated(): boolean {
  return _hydrated;
}

/**
 * Begin a session: hydrate instantly from disk (so the UI paints offline),
 * then refresh from the cloud in the background. If the user last had a
 * co-owned account open, restore it (falling back to own data if access was
 * revoked while they were away).
 */
export async function startSession(uid: string): Promise<void> {
  _signedInUid = uid;
  _activeOwnerUid = uid;
  _activeOwnerName = null;

  // Restore a previously-selected co-owned account, if any.
  let restored: { ownerUid: string; ownerName?: string } | null = null;
  try {
    const raw = await AsyncStorage.getItem(activeOwnerPrefKey(uid));
    if (raw) {
      const pref = JSON.parse(raw);
      if (pref?.ownerUid && pref.ownerUid !== uid) restored = pref;
    }
  } catch {
    /* ignore */
  }
  if (restored) {
    _activeOwnerUid = restored.ownerUid;
    _activeOwnerName = restored.ownerName ?? null;
  }

  _hydrated = false;
  await hydrateFromDisk();
  if (_cache.plants.length > 0 || _cache.history.length > 0) _hydrated = true;
  emit();
  // Fire-and-forget cloud refresh; failures keep the disk snapshot.
  loadAllFromCloud()
    .then(() => {
      persistToDisk();
      if (!isViewingOwnAccount()) attachLiveSync();
    })
    .catch(async (e) => {
      // Access to the co-owned account may have been revoked — fall back to own.
      if (!isViewingOwnAccount() && isPermissionError(e)) {
        await switchAccount(uid, null);
      }
      /* otherwise offline — keep the disk snapshot */
    })
    .finally(() => {
      _hydrated = true;
      emit();
    });
}

export function endSession() {
  detachLiveSync();
  _signedInUid = null;
  _activeOwnerUid = null;
  _activeOwnerName = null;
  _cache = EMPTY_CACHE();
  _hydrated = false;
  emit();
}

/**
 * Switch the active account to `ownerUid` (own uid to return home). Resets the
 * cache, hydrates that account's disk mirror, then refreshes from the cloud and
 * attaches live sync for shared accounts. Remembers the choice across launches.
 */
export async function switchAccount(ownerUid: string, ownerName: string | null): Promise<void> {
  if (!_signedInUid) throw new Error('Not signed in');
  detachLiveSync();
  _activeOwnerUid = ownerUid;
  _activeOwnerName = ownerUid === _signedInUid ? null : ownerName;
  _cache = EMPTY_CACHE();
  _hydrated = false;
  emit();

  // Persist the selection (so the app reopens on the same account).
  try {
    if (ownerUid === _signedInUid) {
      await AsyncStorage.removeItem(activeOwnerPrefKey(_signedInUid));
    } else {
      await AsyncStorage.setItem(
        activeOwnerPrefKey(_signedInUid),
        JSON.stringify({ ownerUid, ownerName }),
      );
    }
  } catch {
    /* ignore */
  }

  await hydrateFromDisk();
  emit();
  try {
    await loadAllFromCloud();
    persistToDisk();
    if (!isViewingOwnAccount()) attachLiveSync();
  } catch {
    /* offline — keep the disk snapshot */
  } finally {
    _hydrated = true;
    emit();
  }
}

/** Pull-to-refresh: re-fetch everything from Firestore and persist. */
export async function refreshFromCloud(): Promise<void> {
  if (!_activeOwnerUid) return;
  try {
    await loadAllFromCloud();
    persistToDisk();
  } catch {
    /* offline — keep what we have */
  } finally {
    _hydrated = true;
    emit();
  }
}

async function hydrateFromDisk(): Promise<void> {
  if (!_activeOwnerUid) return;
  try {
    const raw = await AsyncStorage.getItem(diskKey(_activeOwnerUid));
    if (raw) {
      const parsed = JSON.parse(raw) as Cache;
      _cache = {
        plants: parsed.plants ?? [],
        history: parsed.history ?? [],
        journal: parsed.journal ?? [],
        profileCache: parsed.profileCache ?? {},
      };
    }
  } catch {
    /* corrupt or missing — start empty */
  }
}

let _persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistToDisk() {
  if (!_activeOwnerUid) return;
  const uid = _activeOwnerUid;
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    AsyncStorage.setItem(diskKey(uid), JSON.stringify(_cache)).catch(() => {});
  }, 150);
}

function isPermissionError(e: any): boolean {
  const code = String(e?.code ?? '');
  return code.includes('permission-denied') || code.includes('PERMISSION_DENIED');
}

// ---- live sync (shared accounts only) ----------------------------------
let _liveUnsubs: Array<() => void> = [];
function attachLiveSync() {
  detachLiveSync();
  const owner = _activeOwnerUid;
  if (!owner || owner === _signedInUid) return; // own account uses refresh-on-open
  const watch = (store: 'plants' | 'history' | 'journal') => {
    const unsub = onSnapshot(
      collection(db, 'users', owner, store),
      (snap) => {
        if (_activeOwnerUid !== owner) return; // switched away mid-flight
        const next: any[] = [];
        snap.forEach((d) => next.push(d.data()));
        _cache[store] = next as any;
        persistToDisk();
        emit();
      },
      () => {
        /* listener error — fall back to the cached snapshot */
      },
    );
    _liveUnsubs.push(unsub);
  };
  watch('plants');
  watch('history');
  watch('journal');
}
function detachLiveSync() {
  _liveUnsubs.forEach((u) => {
    try {
      u();
    } catch {
      /* ignore */
    }
  });
  _liveUnsubs = [];
}

// ---- Firestore helpers -------------------------------------------------
/** The owner uid for data paths (active account). Throws if no session. */
function requireOwnerUid(): string {
  if (!_activeOwnerUid) throw new Error('Not signed in');
  return _activeOwnerUid;
}
function colRef(store: Store) {
  return collection(db, 'users', requireOwnerUid(), store);
}
function docRef(store: Store, docId: string | number) {
  // '/' is illegal in Firestore doc ids; only profileCache keys could contain one.
  return doc(db, 'users', requireOwnerUid(), store, String(docId).replace(/\//g, '_'));
}
function keyField(store: Store): 'cacheKey' | 'id' {
  return store === 'profileCache' ? 'cacheKey' : 'id';
}

/** Pull every store from Firestore into the in-memory cache (called on refresh). */
export async function loadAllFromCloud(): Promise<void> {
  const stores: Store[] = ['plants', 'history', 'journal', 'profileCache'];
  await Promise.all(
    stores.map(async (store) => {
      const snap = await getDocs(colRef(store));
      if (store === 'profileCache') {
        const next: Record<string, any> = {};
        snap.forEach((d) => {
          next[d.id] = d.data();
        });
        _cache.profileCache = next;
      } else {
        const next: any[] = [];
        snap.forEach((d) => next.push(d.data()));
        _cache[store] = next;
      }
    }),
  );

  // Publish the names-free watering summary for the Notion routine — only for
  // the signed-in user's own account (a co-owner mustn't overwrite their own
  // summary with someone else's plants, and can't write the owner's).
  if (isViewingOwnAccount()) writeWateringSummary(_cache.plants);
}

// ---- public db* API ----------------------------------------------------
export async function dbGetAll(store: 'plants'): Promise<Plant[]>;
export async function dbGetAll(store: 'history'): Promise<HistoryEntry[]>;
export async function dbGetAll(store: 'journal'): Promise<JournalEntry[]>;
export async function dbGetAll(store: 'profileCache'): Promise<any[]>;
export async function dbGetAll(store: Store): Promise<any[]> {
  if (store === 'profileCache') return Object.values(_cache.profileCache);
  return (_cache[store] as any[]).slice();
}

export async function dbGet(store: 'profileCache', key: string): Promise<any>;
export async function dbGet(store: 'plants' | 'history' | 'journal', key: number): Promise<any>;
export async function dbGet(store: Store, key: string | number): Promise<any> {
  if (store === 'profileCache') return _cache.profileCache[key as string];
  const arr = _cache[store] as Array<{ id: number }>;
  return arr.find((x) => x.id === key);
}

export async function dbPut(store: Store, item: any): Promise<string | number> {
  const key = item[keyField(store)];
  await setDoc(docRef(store, key), item);
  // Replace the array/object reference (immutable) so React's useMemo/identity
  // checks see the change and recompute.
  if (store === 'profileCache') {
    _cache.profileCache = { ..._cache.profileCache, [key]: item };
  } else {
    const arr = _cache[store] as any[];
    const i = arr.findIndex((x) => x.id === key);
    _cache[store] = (i >= 0 ? arr.map((x) => (x.id === key ? item : x)) : [...arr, item]) as any;
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
    const next = { ..._cache.profileCache };
    delete next[key as string];
    _cache.profileCache = next;
  } else {
    _cache[store] = (_cache[store] as any[]).filter((x) => x.id !== key) as any;
  }
  persistToDisk();
  emit();
}

/**
 * Permanently delete every doc in the SIGNED-IN user's own subtree (account
 * deletion). Always operates on own data, never a co-owned account — switches
 * home first so the paths and disk mirror are the user's own.
 */
export async function deleteAllUserData(): Promise<void> {
  if (!_signedInUid) return;
  if (!isViewingOwnAccount()) await switchAccount(_signedInUid, null);
  const stores: Store[] = ['plants', 'history', 'journal', 'profileCache'];
  for (const store of stores) {
    const snap = await getDocs(colRef(store));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
  await AsyncStorage.removeItem(diskKey(_signedInUid)).catch(() => {});
  await AsyncStorage.removeItem(activeOwnerPrefKey(_signedInUid)).catch(() => {});
  _cache = EMPTY_CACHE();
  emit();
}
