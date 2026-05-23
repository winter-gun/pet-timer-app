import { create } from 'zustand';

interface LevelState {
  /** Lifetime focused seconds, mirrored from Firestore. */
  totalFocusSec: number;
  /** Cached stored level on the user doc — kept ≥ computed(totalFocusSec). */
  level: number;
  /** Set transiently to the new level when a level-up just happened; null otherwise. */
  justLeveledUpTo: number | null;

  applyServerUpdate: (totalFocusSec: number, level: number) => void;
  markLevelUp: (level: number) => void;
  clearLevelUp: () => void;
}

let syncing = false;

function sync(payload: Partial<LevelState>) {
  if (syncing) return;
  window.electronAPI?.syncState('level', payload);
}

export const useLevelStore = create<LevelState>((set) => ({
  totalFocusSec: 0,
  level: 1,
  justLeveledUpTo: null,

  applyServerUpdate: (totalFocusSec, level) => {
    set({ totalFocusSec, level });
    sync({ totalFocusSec, level });
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

if (typeof window !== 'undefined') {
  window.electronAPI?.onStateBroadcast((channel, payload) => {
    if (channel !== 'level') return;
    syncing = true;
    useLevelStore.setState(payload as Partial<LevelState>);
    syncing = false;
  });
}
