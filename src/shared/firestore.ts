import {
  addDoc,
  collection,
  doc,
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
import type { PetSpecies } from './types';

export interface RemotePetSettings {
  species?: PetSpecies;
  name?: string;
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
}
