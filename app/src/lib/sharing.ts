/**
 * SHARING — two capability-token flows, both built on the existing
 * world-readable `public/{uid}/...` pattern (same shape as the watering
 * summary), so they ship OTA with no native modules and no Cloud Functions.
 *
 * 1. GUEST / AWAY MODE (plant-sitter): the owner publishes a watering schedule
 *    for a date window to `public/{ownerUid}/shares/{token}`. A static web page
 *    on jamasha.com reads it (world-readable) and lets the sitter check plants
 *    off; check-offs land in `.../shares/{token}/events`. The owner's app drains
 *    that inbox on open and replays each as a real waterPlant() so history and
 *    the learning model stay correct.
 *
 * 2. CO-OWNER (Planta "Family"): the owner publishes an invite to
 *    `public/{ownerUid}/invites/{token}`; the invitee (signed in with their own
 *    account) stamps acceptance; the owner's app finalizes by writing
 *    `users/{ownerUid}/members/{memberUid}`, which the security rules use to
 *    grant the member full read/write to the owner's subtree.
 *
 * The token is an unguessable capability; shares/invites are revocable.
 */
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import { getSignedInUid, getPlants, isViewingOwnAccount } from '../data/db';
import { currentUser } from './auth';
import { getDueDatesInWindow } from '../logic/schedule';
import { waterPlant } from '../logic/actions';

const WEB_BASE = 'https://jamasha.com/plantaroo';
const MS_PER_DAY = 86_400_000;
/** Strip photos if the assembled share doc would approach Firestore's 1 MB cap. */
const MAX_SHARE_BYTES = 900_000;

export function sitterUrl(uid: string, token: string): string {
  return `${WEB_BASE}/sitter/?u=${uid}&t=${token}`;
}
export function joinUrl(uid: string, token: string): string {
  return `${WEB_BASE}/join/?u=${uid}&t=${token}`;
}

function makeToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < 24; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}
function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function ownerLabel(): string {
  const u = currentUser();
  return u?.displayName || u?.email?.split('@')[0] || 'A Plantaroo user';
}

// =======================================================================
// GUEST / AWAY MODE
// =======================================================================

export interface GuestSharePlant {
  id: number;
  name: string;
  room: string;
  photo: string | null;
  dueDates: string[]; // YYYY-MM-DD within the window
}
export interface GuestShare {
  token: string;
  ownerName: string;
  status: 'active' | 'revoked';
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  plants: GuestSharePlant[];
  createdAt: string; // ISO
}

/** Preview the schedule for a window without publishing (drives the picker UI). */
export function buildAwaySchedule(start: Date, end: Date): GuestSharePlant[] {
  return getPlants()
    .map((p) => ({
      id: p.id,
      name: p.name,
      room: p.room || '',
      photo: p.photo ?? null,
      dueDates: getDueDatesInWindow(p, start, end),
    }))
    .filter((p) => p.dueDates.length > 0)
    .sort(
      (a, b) => (a.room || '').localeCompare(b.room || '') || a.name.localeCompare(b.name),
    );
}

/** Publish a plant-sitter schedule and return the shareable jamasha.com link. */
export async function createGuestShare(
  start: Date,
  end: Date,
): Promise<{ token: string; url: string; plantCount: number }> {
  const uid = getSignedInUid();
  if (!uid) throw new Error('Not signed in');
  if (!isViewingOwnAccount()) throw new Error('Switch to your own plants to share them.');
  const token = makeToken();
  let plants = buildAwaySchedule(start, end);

  let share: GuestShare = {
    token,
    ownerName: ownerLabel(),
    status: 'active',
    start: toYMD(start),
    end: toYMD(end),
    plants,
    createdAt: new Date().toISOString(),
  };
  // Keep the doc under the 1 MB limit — drop photos if base64 pushes it over.
  if (JSON.stringify(share).length > MAX_SHARE_BYTES) {
    plants = plants.map((p) => ({ ...p, photo: null }));
    share = { ...share, plants };
  }

  await setDoc(doc(db, 'public', uid, 'shares', token), share);
  return { token, url: sitterUrl(uid, token), plantCount: plants.length };
}

export async function listGuestShares(): Promise<GuestShare[]> {
  const uid = getSignedInUid();
  if (!uid) return [];
  const snap = await getDocs(collection(db, 'public', uid, 'shares'));
  return snap.docs
    .map((d) => d.data() as GuestShare)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Revoke a share: delete the doc (and best-effort its check-off inbox). */
export async function revokeGuestShare(token: string): Promise<void> {
  const uid = getSignedInUid();
  if (!uid) return;
  try {
    const events = await getDocs(collection(db, 'public', uid, 'shares', token, 'events'));
    await Promise.all(events.docs.map((d) => deleteDoc(d.ref)));
  } catch {
    /* ignore — owner may delete leftover events later */
  }
  await deleteDoc(doc(db, 'public', uid, 'shares', token));
}

const APPLIED_KEY = (uid: string) => `plantaroo:guestEventsApplied:${uid}`;

/**
 * Drain sitter check-offs into real waterings. Safe to call repeatedly: each
 * event is applied once (tracked by id in AsyncStorage). Only runs on the
 * signed-in user's OWN account (waterPlant writes to the active account, and
 * these are the owner's own shares). Returns how many waterings were applied.
 */
export async function drainGuestEvents(): Promise<number> {
  const uid = getSignedInUid();
  if (!uid || !isViewingOwnAccount()) return 0;

  let applied: Set<string>;
  try {
    applied = new Set(JSON.parse((await AsyncStorage.getItem(APPLIED_KEY(uid))) || '[]'));
  } catch {
    applied = new Set();
  }

  let count = 0;
  let dirty = false;
  let shares;
  try {
    shares = await getDocs(collection(db, 'public', uid, 'shares'));
  } catch {
    return 0; // offline — try again next open
  }

  for (const s of shares.docs) {
    let events;
    try {
      events = await getDocs(collection(db, 'public', uid, 'shares', s.id, 'events'));
    } catch {
      continue;
    }
    const pending = events.docs
      .map((d) => ({ key: `${s.id}:${d.id}`, ...(d.data() as any) }))
      .filter((e) => !applied.has(e.key))
      .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));

    for (const e of pending) {
      const plant = getPlants().find((p) => p.id === e.plantId);
      if (plant && e.type === 'Watered') {
        try {
          await waterPlant(plant, null, e.date ? new Date(e.date) : undefined);
          count++;
          applied.add(e.key);
          dirty = true;
        } catch {
          /* leave unapplied — retry next open */
        }
      } else {
        // Plant not loaded yet → retry next open. If it's truly gone (event is
        // old and the plant no longer exists), stop retrying after two weeks.
        const ageOk = e.at && Date.now() - new Date(e.at).getTime() > 14 * MS_PER_DAY;
        if (!plant && ageOk) {
          applied.add(e.key);
          dirty = true;
        }
      }
    }
  }

  if (dirty) await AsyncStorage.setItem(APPLIED_KEY(uid), JSON.stringify([...applied])).catch(() => {});
  return count;
}

// =======================================================================
// CO-OWNER (invites + memberships)
// =======================================================================

export interface Membership {
  ownerUid: string;
  ownerName: string;
}
export interface Coowner {
  uid: string;
  name: string | null;
  addedAt: string;
}

const MEMBERSHIPS_KEY = (uid: string) => `plantaroo:memberships:${uid}`;

/** Owner: publish an invite and return the shareable jamasha.com link. */
export async function createInvite(): Promise<{ token: string; url: string }> {
  const uid = getSignedInUid();
  if (!uid) throw new Error('Not signed in');
  const token = makeToken();
  await setDoc(doc(db, 'public', uid, 'invites', token), {
    ownerName: ownerLabel(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  return { token, url: joinUrl(uid, token) };
}

/** Parse a pasted join link or `uid:token` code into its parts. */
export function parseJoinCode(input: string): { ownerUid: string; token: string } | null {
  const s = input.trim();
  // Full URL form
  const m = s.match(/[?&]u=([^&\s]+)[^]*?[?&]t=([^&\s]+)/);
  if (m) return { ownerUid: decodeURIComponent(m[1]), token: decodeURIComponent(m[2]) };
  // uid:token form
  const parts = s.split(/[:\s]+/).filter(Boolean);
  if (parts.length === 2) return { ownerUid: parts[0], token: parts[1] };
  return null;
}

/** Invitee: accept an invite. Stamps the invite and records the membership locally. */
export async function acceptInvite(ownerUid: string, token: string): Promise<Membership> {
  const me = getSignedInUid();
  if (!me) throw new Error('Not signed in');
  if (ownerUid === me) throw new Error("That's your own invite link — share it with someone else.");
  const ref = doc(db, 'public', ownerUid, 'invites', token);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('This invite is no longer valid.');
  const data = snap.data() as any;
  await updateDoc(ref, { acceptedBy: me, acceptedByName: ownerLabel(), status: 'accepted' });
  const membership: Membership = { ownerUid, ownerName: data.ownerName || 'Shared account' };
  await addLocalMembership(me, membership);
  return membership;
}

async function addLocalMembership(me: string, m: Membership): Promise<void> {
  const list = await listMemberships();
  const next = [...list.filter((x) => x.ownerUid !== m.ownerUid), m];
  await AsyncStorage.setItem(MEMBERSHIPS_KEY(me), JSON.stringify(next)).catch(() => {});
}

/** Accounts the signed-in user has been granted co-owner access to. */
export async function listMemberships(): Promise<Membership[]> {
  const me = getSignedInUid();
  if (!me) return [];
  try {
    return JSON.parse((await AsyncStorage.getItem(MEMBERSHIPS_KEY(me))) || '[]');
  } catch {
    return [];
  }
}

export async function removeLocalMembership(ownerUid: string): Promise<void> {
  const me = getSignedInUid();
  if (!me) return;
  const list = (await listMemberships()).filter((x) => x.ownerUid !== ownerUid);
  await AsyncStorage.setItem(MEMBERSHIPS_KEY(me), JSON.stringify(list)).catch(() => {});
}

/**
 * Owner: turn accepted invites into real memberships under the owner's subtree.
 * Only the owner can write there, so the grant must happen on the owner's device.
 * Safe to call on every app open. Returns how many new members were finalized.
 */
export async function finalizePendingInvites(): Promise<number> {
  const uid = getSignedInUid();
  if (!uid) return 0;
  let snap;
  try {
    snap = await getDocs(collection(db, 'public', uid, 'invites'));
  } catch {
    return 0;
  }
  let n = 0;
  for (const d of snap.docs) {
    const inv = d.data() as any;
    if (inv.status === 'accepted' && inv.acceptedBy) {
      await setDoc(
        doc(db, 'users', uid, 'members', inv.acceptedBy),
        { role: 'coowner', name: inv.acceptedByName ?? null, addedAt: new Date().toISOString() },
        { merge: true },
      );
      await updateDoc(d.ref, { status: 'finalized' }).catch(() => {});
      n++;
    }
  }
  return n;
}

/** Owner: who currently has co-owner access to my plants. */
export async function listCoowners(): Promise<Coowner[]> {
  const uid = getSignedInUid();
  if (!uid) return [];
  const snap = await getDocs(collection(db, 'users', uid, 'members'));
  return snap.docs.map((d) => ({ uid: d.id, name: (d.data() as any).name ?? null, addedAt: (d.data() as any).addedAt ?? '' }));
}

/** Owner: revoke a co-owner's access. */
export async function revokeCoowner(memberUid: string): Promise<void> {
  const uid = getSignedInUid();
  if (!uid) return;
  await deleteDoc(doc(db, 'users', uid, 'members', memberUid));
}
