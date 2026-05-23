import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, USERS_COLLECTION } from './firebase';
import type { PetSpecies, TimerMode, TimerStatus } from './types';

export interface RemotePetSettings {
  species?: PetSpecies;
  name?: string;
}

export interface UserProfile {
  displayName?: string;
  photoURL?: string;
}

export async function saveUserProfile(uid: string, profile: UserProfile): Promise<void> {
  await setDoc(
    userDoc(uid),
    { ...profile, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export interface SessionPayload {
  startedAt: Date;
  endedAt: Date;
  mode: 'focus' | 'rest';
  preset: string;
  plannedDurationSec: number;
  actualDurationSec: number;
  completed: boolean;
  dateKey: string;
}

const userDoc = (uid: string) => doc(db, USERS_COLLECTION, uid);
const sessionsCol = (uid: string) =>
  collection(db, USERS_COLLECTION, uid, 'sessions');
const dailyDoc = (uid: string, dateKey: string) =>
  doc(db, USERS_COLLECTION, uid, 'daily', dateKey);

export async function savePetSettings(uid: string, settings: RemotePetSettings): Promise<void> {
  await setDoc(
    userDoc(uid),
    { ...settings, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function subscribeToPetSettings(
  uid: string,
  cb: (s: RemotePetSettings) => void,
): Unsubscribe {
  return onSnapshot(userDoc(uid), (snap) => {
    const data = snap.data();
    if (!data) return;
    cb({ species: data.species, name: data.name });
  });
}

export interface RemoteGoals {
  dailyGoalMin?: number;
  weeklyGoalMin?: number;
}

export async function saveGoals(uid: string, goals: RemoteGoals): Promise<void> {
  await setDoc(
    userDoc(uid),
    { ...goals, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function subscribeToGoals(uid: string, cb: (g: RemoteGoals) => void): Unsubscribe {
  return onSnapshot(userDoc(uid), (snap) => {
    const data = snap.data();
    if (!data) return;
    cb({
      dailyGoalMin: typeof data.dailyGoalMin === 'number' ? data.dailyGoalMin : undefined,
      weeklyGoalMin: typeof data.weeklyGoalMin === 'number' ? data.weeklyGoalMin : undefined,
    });
  });
}

// ---------------------------------------------------------------------------
// Lifetime focus + level — drives the character growth system. totalFocusSec
// is incremented atomically by saveSession; level is the cached derived value
// (also stored so the celebration trigger has a stable "was" anchor).
// ---------------------------------------------------------------------------

export interface UserProgress {
  totalFocusSec: number;
  level: number;
}

export function subscribeToUserProgress(
  uid: string,
  cb: (p: UserProgress) => void,
): Unsubscribe {
  return onSnapshot(userDoc(uid), (snap) => {
    const data = snap.data();
    if (!data) return;
    cb({
      totalFocusSec: typeof data.totalFocusSec === 'number' ? data.totalFocusSec : 0,
      level: typeof data.level === 'number' ? data.level : 1,
    });
  });
}

export async function saveUserLevel(uid: string, level: number): Promise<void> {
  await setDoc(
    userDoc(uid),
    { level, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

// ---------------------------------------------------------------------------
// Inventory — coins are derived from totalFocusSec (10min = 1coin); only the
// spent counter, the owned set, and the per-slot equip choice are persisted.
// arrayUnion makes ownership idempotent so double-buy is harmless on the
// ownership side; coinsSpent could be double-incremented under a true
// concurrent purchase but that's a single-user app in practice.
// ---------------------------------------------------------------------------

export interface InventorySnapshot {
  coinsSpent: number;
  ownedItems: string[];
  equippedHat: string | null;
  equippedAccessory: string | null;
}

export function subscribeToInventory(
  uid: string,
  cb: (inv: InventorySnapshot) => void,
): Unsubscribe {
  return onSnapshot(userDoc(uid), (snap) => {
    const data = snap.data();
    if (!data) return;
    cb({
      coinsSpent: typeof data.coinsSpent === 'number' ? data.coinsSpent : 0,
      ownedItems: Array.isArray(data.ownedItems)
        ? (data.ownedItems as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      equippedHat: typeof data.equippedHat === 'string' ? data.equippedHat : null,
      equippedAccessory:
        typeof data.equippedAccessory === 'string' ? data.equippedAccessory : null,
    });
  });
}

export async function purchaseItem(
  uid: string,
  itemId: string,
  price: number,
): Promise<void> {
  await setDoc(
    userDoc(uid),
    {
      ownedItems: arrayUnion(itemId),
      coinsSpent: increment(price),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function setEquippedItem(
  uid: string,
  slot: 'hat' | 'accessory',
  itemId: string | null,
): Promise<void> {
  const field = slot === 'hat' ? 'equippedHat' : 'equippedAccessory';
  await setDoc(
    userDoc(uid),
    { [field]: itemId, updatedAt: serverTimestamp() },
    { merge: true },
  );
}


export interface DailyAggregate {
  date: string;
  totalFocusSec: number;
  sessions: number;
}

const dailyCol = (uid: string) => collection(db, USERS_COLLECTION, uid, 'daily');

/** Subscribe to the most recent `days` of daily aggregates ending today. */
export function subscribeToRecentDailies(
  uid: string,
  days: number,
  cb: (rows: DailyAggregate[]) => void,
): Unsubscribe {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));
  const startKey = isoDate(start);
  const q = query(
    dailyCol(uid),
    where('date', '>=', startKey),
    orderBy('date', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    const rows: DailyAggregate[] = [];
    snap.forEach((d) => {
      const data = d.data();
      rows.push({
        date: data.date,
        totalFocusSec: data.totalFocusSec ?? 0,
        sessions: data.sessions ?? 0,
      });
    });
    cb(rows);
  });
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Study rooms (shared across users) — top-level collection, sibling of
// pet_timer_users. Member docs live as a subcollection. Loose-sync model:
// status/mode/todayMin are pushed on state-change boundaries, not every tick.
// ---------------------------------------------------------------------------

const ROOMS_COLLECTION = 'pet_timer_rooms';

const roomDoc = (roomId: string) => doc(db, ROOMS_COLLECTION, roomId);
const roomMembersCol = (roomId: string) =>
  collection(db, ROOMS_COLLECTION, roomId, 'members');
const roomMemberDoc = (roomId: string, uid: string) =>
  doc(db, ROOMS_COLLECTION, roomId, 'members', uid);

export interface RoomMember {
  uid: string;
  displayName: string;
  photoURL: string | null;
  petSpecies: PetSpecies;
  status: TimerStatus;
  mode: TimerMode;
  todayMin: number;
  lastSeen: Date | null;
}

// Ambiguous characters (I, O, 0, 1) omitted so users don't misread codes.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(length = 6): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

export interface RoomMemberIdentity {
  displayName: string;
  photoURL?: string | null;
  species: PetSpecies;
}

/** Create a new room. The 6-char code doubles as the document ID. */
export async function createRoom(
  uid: string,
  identity: RoomMemberIdentity,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const ref = roomDoc(code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;
    await setDoc(ref, {
      code,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    await joinRoom(code, uid, identity);
    return code;
  }
  throw new Error('방 코드 생성에 실패했습니다. 다시 시도해 주세요.');
}

export async function joinRoom(
  roomId: string,
  uid: string,
  identity: RoomMemberIdentity,
): Promise<void> {
  const exists = (await getDoc(roomDoc(roomId))).exists();
  if (!exists) throw new Error('방을 찾을 수 없습니다.');
  await setDoc(
    roomMemberDoc(roomId, uid),
    {
      uid,
      displayName: identity.displayName || '익명',
      photoURL: identity.photoURL ?? null,
      petSpecies: identity.species,
      status: 'idle',
      mode: 'focus',
      todayMin: 0,
      joinedAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function leaveRoom(roomId: string, uid: string): Promise<void> {
  await deleteDoc(roomMemberDoc(roomId, uid));
}

/** Push a partial status patch for the current user's room membership. */
export async function updateMemberStatus(
  roomId: string,
  uid: string,
  patch: {
    status?: TimerStatus;
    mode?: TimerMode;
    todayMin?: number;
    displayName?: string;
    photoURL?: string | null;
    petSpecies?: PetSpecies;
  },
): Promise<void> {
  await setDoc(
    roomMemberDoc(roomId, uid),
    { ...patch, lastSeen: serverTimestamp() },
    { merge: true },
  );
}

export function subscribeToRoomMembers(
  roomId: string,
  cb: (members: RoomMember[]) => void,
): Unsubscribe {
  return onSnapshot(roomMembersCol(roomId), (snap) => {
    const rows: RoomMember[] = [];
    snap.forEach((d) => {
      const data = d.data();
      rows.push({
        uid: data.uid ?? d.id,
        displayName: data.displayName ?? '익명',
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
        petSpecies: (data.petSpecies as PetSpecies) ?? 'fennec',
        status: (data.status as TimerStatus) ?? 'idle',
        mode: (data.mode as TimerMode) ?? 'focus',
        todayMin: typeof data.todayMin === 'number' ? data.todayMin : 0,
        lastSeen:
          data.lastSeen && typeof data.lastSeen.toDate === 'function'
            ? data.lastSeen.toDate()
            : null,
      });
    });
    cb(rows);
  });
}

export async function saveSession(uid: string, session: SessionPayload): Promise<void> {
  await addDoc(sessionsCol(uid), {
    startedAt: Timestamp.fromDate(session.startedAt),
    endedAt: Timestamp.fromDate(session.endedAt),
    mode: session.mode,
    preset: session.preset,
    plannedDurationSec: session.plannedDurationSec,
    actualDurationSec: session.actualDurationSec,
    completed: session.completed,
    dateKey: session.dateKey,
  });

  // Atomic increment on the daily aggregate. Focus-mode sessions add to
  // totalFocusSec; rest sessions only bump the count.
  await setDoc(
    dailyDoc(uid, session.dateKey),
    {
      date: session.dateKey,
      totalFocusSec: increment(
        session.mode === 'focus' ? session.actualDurationSec : 0,
      ),
      sessions: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // Lifetime accumulator drives the level system. Only focus mode counts.
  if (session.mode === 'focus' && session.actualDurationSec > 0) {
    await setDoc(
      userDoc(uid),
      {
        totalFocusSec: increment(session.actualDurationSec),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
}
