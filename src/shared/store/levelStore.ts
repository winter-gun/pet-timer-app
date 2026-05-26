import { create } from 'zustand';
import { computeLevel } from '../level';

interface LevelState {
  /** Lifetime focused seconds. Locally accumulated by the timer tick and
   *  reconciled (via max-merge) with the Firestore value when signed in,
   *  so the coin counter never goes backward on a server snapshot. */
  totalFocusSec: number;
  /** Cached stored level on the user doc — kept ≥ computed(totalFocusSec). */
  level: number;
  /** Set transiently to the new level when a level-up just happened; null otherwise. */
  justLeveledUpTo: number | null;

  /** Add focused seconds locally (drives real-time coin accrual). Persists
   *  on minute boundaries to avoid 1 disk write/sec. */
  addFocusSec: (sec: number) => void;
  applyServerUpdate: (totalFocusSec: number, level: number) => void;
  markLevelUp: (level: number) => void;
  clearLevelUp: () => void;
}

const STORE_KEY_TOTAL_FOCUS = 'level.totalFocusSec';
const STORE_KEY_LEVEL = 'level.level';

let syncing = false;
let clearLevelUpTimer: number | null = null;

function sync(payload: Partial<LevelState>) {
  if (syncing) return;
  window.electronAPI?.syncState('level', payload);
}

function persistTotal(totalFocusSec: number, level: number) {
  void window.electronAPI?.storeSet(STORE_KEY_TOTAL_FOCUS, totalFocusSec);
  void window.electronAPI?.storeSet(STORE_KEY_LEVEL, level);
}

export const useLevelStore = create<LevelState>((set, get) => ({
  totalFocusSec: 0,
  level: 1,
  justLeveledUpTo: null,

  addFocusSec: (sec) => {
    if (sec <= 0) return;
    const prev = get();
    const nextTotal = prev.totalFocusSec + sec;
    const computed = computeLevel(nextTotal).level;
    const nextLevel = Math.max(prev.level, computed);
    const leveledUp = nextLevel > prev.level;
    set({ totalFocusSec: nextTotal, level: nextLevel });
    // Minute boundaries (or level-ups) write to disk — most ticks just live in memory.
    const crossedMinute = Math.floor(nextTotal / 60) !== Math.floor(prev.totalFocusSec / 60);
    if (crossedMinute || leveledUp) {
      persistTotal(nextTotal, nextLevel);
    }
    sync({ totalFocusSec: nextTotal, level: nextLevel });
    // Offline level-ups trigger the celebration too — the Firestore listener
    // path in App.tsx only fires for sign-in users.
    if (leveledUp) {
      get().markLevelUp(nextLevel);
      if (clearLevelUpTimer != null) window.clearTimeout(clearLevelUpTimer);
      clearLevelUpTimer = window.setTimeout(() => {
        useLevelStore.getState().clearLevelUp();
        clearLevelUpTimer = null;
      }, 6000);
    }
  },

  applyServerUpdate: (totalFocusSec, level) => {
    // Max-merge: if local already counted more (offline session not yet
    // round-tripped through Firestore), don't regress. Otherwise the server
    // value wins (e.g. a session completed on another device).
    const prev = get();
    const nextTotal = Math.max(prev.totalFocusSec, totalFocusSec);
    const nextLevel = Math.max(prev.level, level, computeLevel(nextTotal).level);
    set({ totalFocusSec: nextTotal, level: nextLevel });
    persistTotal(nextTotal, nextLevel);
    sync({ totalFocusSec: nextTotal, level: nextLevel });
  },
  markLevelUp: (level) => {
    set({ justLeveledUpTo: level });
    sync({ justLeveledUpTo: level });
  },
  clearLevelUp: () => {
    set({ justLeveledUpTo: null });
    sync({ justLeveledUpTo: null });
  },
}));

async function initFromStore() {
  if (typeof window === 'undefined' || !window.electronAPI) return;
  const api = window.electronAPI;
  const [total, level] = await Promise.all([
    api.storeGet<number>(STORE_KEY_TOTAL_FOCUS),
    api.storeGet<number>(STORE_KEY_LEVEL),
  ]);
  const patch: Partial<LevelState> = {};
  if (typeof total === 'number' && total > 0) patch.totalFocusSec = total;
  if (typeof level === 'number' && level > 1) patch.level = level;
  if (Object.keys(patch).length > 0) {
    useLevelStore.setState(patch);
  }
}

if (typeof window !== 'undefined') {
  void initFromStore();

  window.electronAPI?.onStateBroadcast((channel, payload) => {
    if (channel !== 'level') return;
    syncing = true;
    useLevelStore.setState(payload as Partial<LevelState>);
    syncing = false;
  });
}
