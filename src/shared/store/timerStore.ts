import { create } from 'zustand';
import type { TimerMode, TimerStatus } from '../types';
import { saveSession, type SessionPayload } from '../firestore';
import { useAuthStore } from './authStore';

export type TimerPreset = 'pomodoro' | 'short' | 'long' | 'custom';

interface PresetDef {
  focusMin: number;
  restMin: number;
}

export const PRESETS: Record<Exclude<TimerPreset, 'custom'>, PresetDef> = {
  pomodoro: { focusMin: 25, restMin: 5 },
  short:    { focusMin: 15, restMin: 3 },
  long:     { focusMin: 50, restMin: 10 },
};

export const PRESET_LABELS: Record<TimerPreset, string> = {
  pomodoro: '포모도로',
  short:    '단기 집중',
  long:     '장기 집중',
  custom:   '자유 설정',
};

export const PRESET_DESCRIPTIONS: Record<TimerPreset, string> = {
  pomodoro: '25분 집중 / 5분 휴식',
  short:    '15분 집중 / 3분 휴식',
  long:     '50분 집중 / 10분 휴식',
  custom:   '직접 설정',
};

interface TimerState {
  status: TimerStatus;
  mode: TimerMode;
  preset: TimerPreset;
  customFocusMin: number;
  customRestMin: number;
  durationSec: number;
  remainingSec: number;
  todayTotal: number;
  lastSavedDate: string;

  start: (durationSec?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  tick: () => void;
  setMode: (mode: TimerMode) => void;
  setDuration: (sec: number) => void;
  setPreset: (preset: TimerPreset) => void;
  setCustomDurations: (focusMin: number, restMin: number) => void;
}

const STORE_KEY_PRESET = 'timer.preset';
const STORE_KEY_CUSTOM_FOCUS = 'timer.customFocusMin';
const STORE_KEY_CUSTOM_REST = 'timer.customRestMin';
const STORE_KEY_TODAY_TOTAL = 'todayTotal';
const STORE_KEY_LAST_DATE = 'lastSavedDate';

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveDuration(
  preset: TimerPreset,
  mode: TimerMode,
  customFocusMin: number,
  customRestMin: number,
): number {
  if (preset === 'custom') {
    return (mode === 'focus' ? customFocusMin : customRestMin) * 60;
  }
  return (mode === 'focus' ? PRESETS[preset].focusMin : PRESETS[preset].restMin) * 60;
}

const DEFAULT_PRESET: TimerPreset = 'pomodoro';
const DEFAULT_FOCUS_MIN = PRESETS.pomodoro.focusMin;
const DEFAULT_REST_MIN = PRESETS.pomodoro.restMin;
const DEFAULT_DURATION = DEFAULT_FOCUS_MIN * 60;

// Prevents broadcast-triggered setState from echoing back to the main process.
let syncing = false;

function sync(payload: Partial<TimerState>) {
  if (syncing) return;
  window.electronAPI?.syncState('timer', payload);
}

function persistTodayTotal(total: number, date: string) {
  void window.electronAPI?.storeSet(STORE_KEY_TODAY_TOTAL, total);
  void window.electronAPI?.storeSet(STORE_KEY_LAST_DATE, date);
}

// Module-level: tracks the in-flight session metadata so we can write it to
// Firestore on stop() or natural completion. Kept outside the store because
// it's only meaningful in the renderer that drives tick() — broadcasting it
// across windows would add noise without value.
interface CurrentSession {
  startedAt: Date;
  preset: TimerPreset;
  mode: TimerMode;
  plannedDurationSec: number;
}
let currentSession: CurrentSession | null = null;

function persistSession(actualDurationSec: number, completed: boolean) {
  if (!currentSession) return;
  const user = useAuthStore.getState().user;
  const payload: SessionPayload = {
    startedAt: currentSession.startedAt,
    endedAt: new Date(),
    mode: currentSession.mode,
    preset: currentSession.preset,
    plannedDurationSec: currentSession.plannedDurationSec,
    actualDurationSec,
    completed,
    dateKey: todayKey(),
  };
  currentSession = null;
  if (!user) return;
  void saveSession(user.uid, payload);
}

export const useTimerStore = create<TimerState>((set, get) => ({
  status: 'idle',
  mode: 'focus',
  preset: DEFAULT_PRESET,
  customFocusMin: DEFAULT_FOCUS_MIN,
  customRestMin: DEFAULT_REST_MIN,
  durationSec: DEFAULT_DURATION,
  remainingSec: DEFAULT_DURATION,
  todayTotal: 0,
  lastSavedDate: todayKey(),

  start: (durationSec) => {
    const d = durationSec ?? get().durationSec;
    const { mode, preset } = get();
    currentSession = {
      startedAt: new Date(),
      preset,
      mode,
      plannedDurationSec: d,
    };
    set({ status: 'running', durationSec: d, remainingSec: d });
    sync({ status: 'running', mode, durationSec: d, remainingSec: d });
  },

  pause: () => {
    set({ status: 'paused' });
    sync({ status: 'paused' });
  },

  resume: () => {
    set({ status: 'running' });
    sync({ status: 'running' });
  },

  stop: () => {
    const state = get();
    const elapsed = state.durationSec - state.remainingSec;
    // Persist whatever was actually accumulated. Skip zero-length stops
    // (user clicked start then immediately stop) — those aren't sessions.
    if (currentSession && elapsed > 0) {
      persistSession(elapsed, false);
    } else {
      currentSession = null;
    }
    const d = state.durationSec;
    set({ status: 'idle', remainingSec: d });
    sync({ status: 'idle', remainingSec: d });
  },

  tick: () => {
    const state = get();
    if (state.status !== 'running') return;

    const today = todayKey();
    const rollover = today !== state.lastSavedDate;
    let todayTotal = state.todayTotal;
    let lastSavedDate = state.lastSavedDate;
    if (rollover) {
      todayTotal = 0;
      lastSavedDate = today;
    }
    if (state.mode === 'focus') {
      todayTotal += 1;
    }

    let nextStatus: TimerStatus = state.status;
    let nextRemaining = state.remainingSec - 1;
    if (state.remainingSec <= 1) {
      nextStatus = 'idle';
      nextRemaining = 0;
      // Natural completion — full planned duration was served.
      if (currentSession) {
        persistSession(currentSession.plannedDurationSec, true);
      }
    }

    set({
      status: nextStatus,
      remainingSec: nextRemaining,
      todayTotal,
      lastSavedDate,
    });

    // Broadcast on minute boundary (pet displays minutes), date rollover, or
    // status change. Avoids 1 IPC/sec when the pet would render identically.
    const statusChanged = nextStatus !== state.status;
    const minuteBoundary = state.mode === 'focus' && todayTotal > 0 && todayTotal % 60 === 0;

    if (rollover || minuteBoundary || statusChanged) {
      const payload: Partial<TimerState> = { todayTotal };
      if (rollover) payload.lastSavedDate = lastSavedDate;
      if (statusChanged) {
        payload.status = nextStatus;
        payload.remainingSec = nextRemaining;
      }
      sync(payload);
      persistTodayTotal(todayTotal, lastSavedDate);
    }
  },

  setMode: (mode) => {
    const { preset, customFocusMin, customRestMin } = get();
    const dur = resolveDuration(preset, mode, customFocusMin, customRestMin);
    set({ mode, durationSec: dur, remainingSec: dur });
    sync({ mode, durationSec: dur, remainingSec: dur });
  },

  setDuration: (sec) => {
    set({ durationSec: sec, remainingSec: sec });
    sync({ durationSec: sec, remainingSec: sec });
  },

  setPreset: (preset) => {
    const { mode, customFocusMin, customRestMin } = get();
    const dur = resolveDuration(preset, mode, customFocusMin, customRestMin);
    set({ preset, durationSec: dur, remainingSec: dur });
    sync({ preset, durationSec: dur, remainingSec: dur });
    void window.electronAPI?.storeSet(STORE_KEY_PRESET, preset);
  },

  setCustomDurations: (focusMin, restMin) => {
    const { preset, mode } = get();
    const updates: Partial<TimerState> = {
      customFocusMin: focusMin,
      customRestMin: restMin,
    };
    if (preset === 'custom') {
      const dur = (mode === 'focus' ? focusMin : restMin) * 60;
      updates.durationSec = dur;
      updates.remainingSec = dur;
    }
    set(updates);
    sync(updates);
    void window.electronAPI?.storeSet(STORE_KEY_CUSTOM_FOCUS, focusMin);
    void window.electronAPI?.storeSet(STORE_KEY_CUSTOM_REST, restMin);
  },
}));

// Async load of persisted state. Runs in every renderer on module load —
// both windows end up in sync because they read from the same electron-store.
async function initFromStore() {
  if (typeof window === 'undefined' || !window.electronAPI) return;
  const api = window.electronAPI;

  const [preset, cf, cr, total, date] = await Promise.all([
    api.storeGet<TimerPreset>(STORE_KEY_PRESET),
    api.storeGet<number>(STORE_KEY_CUSTOM_FOCUS),
    api.storeGet<number>(STORE_KEY_CUSTOM_REST),
    api.storeGet<number>(STORE_KEY_TODAY_TOTAL),
    api.storeGet<string>(STORE_KEY_LAST_DATE),
  ]);

  const validPresets: TimerPreset[] = ['pomodoro', 'short', 'long', 'custom'];
  const resolvedPreset: TimerPreset =
    preset && validPresets.includes(preset) ? preset : DEFAULT_PRESET;
  const cfResolved = typeof cf === 'number' && cf > 0 ? cf : DEFAULT_FOCUS_MIN;
  const crResolved = typeof cr === 'number' && cr > 0 ? cr : DEFAULT_REST_MIN;
  const today = todayKey();
  const todayTotal = date === today && typeof total === 'number' ? total : 0;

  useTimerStore.setState((current) => {
    // Preserve a running session — only refresh durationSec when idle.
    if (current.status !== 'idle') {
      return {
        preset: resolvedPreset,
        customFocusMin: cfResolved,
        customRestMin: crResolved,
        todayTotal,
        lastSavedDate: today,
      };
    }
    const dur = resolveDuration(resolvedPreset, current.mode, cfResolved, crResolved);
    return {
      preset: resolvedPreset,
      customFocusMin: cfResolved,
      customRestMin: crResolved,
      todayTotal,
      lastSavedDate: today,
      durationSec: dur,
      remainingSec: dur,
    };
  });

  if (date !== today) {
    void api.storeSet(STORE_KEY_TODAY_TOTAL, 0);
    void api.storeSet(STORE_KEY_LAST_DATE, today);
  }
}

if (typeof window !== 'undefined') {
  initFromStore();
}

// Register broadcast listener once at module load (runs per-window)
if (typeof window !== 'undefined') {
  window.electronAPI?.onStateBroadcast((channel, payload) => {
    if (channel !== 'timer') return;
    syncing = true;
    useTimerStore.setState(payload as Partial<TimerState>);
    syncing = false;
  });
}
