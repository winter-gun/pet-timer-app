import { create } from 'zustand';
import {
  createRoom as fsCreateRoom,
  joinRoom as fsJoinRoom,
  leaveRoom as fsLeaveRoom,
  subscribeToRoomMembers,
  updateMemberStatus,
  type RoomMember,
  type RoomMemberIdentity,
} from '../firestore';
import type { TimerMode, TimerStatus } from '../types';
import { useAuthStore } from './authStore';
import { usePetStore } from './petStore';

/** Prefer the Google profile name; fall back to pet name; finally anonymous. */
function buildIdentity(): RoomMemberIdentity {
  const user = useAuthStore.getState().user;
  const pet = usePetStore.getState();
  const displayName =
    (user?.displayName && user.displayName.trim()) ||
    (pet.name && pet.name.trim()) ||
    '익명';
  return {
    displayName,
    photoURL: user?.photoURL ?? null,
    species: pet.species,
  };
}

const STORE_KEY_ROOM_ID = 'room.currentId';

interface RoomState {
  roomId: string | null;
  members: RoomMember[];
  attaching: boolean;
  error: string | null;
  // Internal: live Firestore listener handle (not synced cross-window).
  _unsub: (() => void) | null;

  create: () => Promise<string | null>;
  join: (roomId: string) => Promise<boolean>;
  leave: () => Promise<void>;
  attach: () => void;
  detach: () => void;
  clearError: () => void;
}

let syncing = false;

function sync(payload: Partial<Pick<RoomState, 'roomId' | 'members'>>) {
  if (syncing) return;
  window.electronAPI?.syncState('room', payload);
}

function persistRoomId(roomId: string | null) {
  void window.electronAPI?.storeSet(STORE_KEY_ROOM_ID, roomId);
}

function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

export const useRoomStore = create<RoomState>((set, get) => ({
  roomId: null,
  members: [],
  attaching: false,
  error: null,
  _unsub: null,

  create: async () => {
    const user = useAuthStore.getState().user;
    if (!user) {
      set({ error: '로그인이 필요합니다.' });
      return null;
    }
    try {
      set({ attaching: true, error: null });
      const code = await fsCreateRoom(user.uid, buildIdentity());
      set({ roomId: code, attaching: false });
      sync({ roomId: code });
      persistRoomId(code);
      get().attach();
      return code;
    } catch (err) {
      set({ attaching: false, error: (err as Error).message });
      return null;
    }
  },

  join: async (rawCode) => {
    const user = useAuthStore.getState().user;
    if (!user) {
      set({ error: '로그인이 필요합니다.' });
      return false;
    }
    const code = normalizeCode(rawCode);
    if (code.length !== 6) {
      set({ error: '코드는 6자입니다.' });
      return false;
    }
    try {
      set({ attaching: true, error: null });
      await fsJoinRoom(code, user.uid, buildIdentity());
      set({ roomId: code, attaching: false });
      sync({ roomId: code });
      persistRoomId(code);
      get().attach();
      return true;
    } catch (err) {
      set({ attaching: false, error: (err as Error).message });
      return false;
    }
  },

  leave: async () => {
    const { roomId } = get();
    const user = useAuthStore.getState().user;
    get().detach();
    if (roomId && user) {
      try {
        await fsLeaveRoom(roomId, user.uid);
      } catch {
        // Best-effort — the local detach already happened, no need to block UI.
      }
    }
    set({ roomId: null, members: [], error: null });
    sync({ roomId: null, members: [] });
    persistRoomId(null);
  },

  attach: () => {
    const { roomId, _unsub } = get();
    _unsub?.();
    if (!roomId) {
      set({ _unsub: null, members: [] });
      return;
    }
    const unsub = subscribeToRoomMembers(roomId, (members) => {
      set({ members });
      // Pet window has no Firestore listener of its own — push the latest
      // roster across IPC so the friends strip stays in sync.
      sync({ members });
    });
    set({ _unsub: unsub });
  },

  detach: () => {
    const { _unsub } = get();
    _unsub?.();
    set({ _unsub: null });
  },

  clearError: () => set({ error: null }),
}));

// ---------------------------------------------------------------------------
// Push helpers — called from timerStore. Keep the writes here so timerStore
// doesn't need to know about Firestore room internals.
// ---------------------------------------------------------------------------

export function pushRoomStatus(patch: {
  status?: TimerStatus;
  mode?: TimerMode;
  todayMin?: number;
}): void {
  const { roomId } = useRoomStore.getState();
  const user = useAuthStore.getState().user;
  if (!roomId || !user) return;
  void updateMemberStatus(roomId, user.uid, patch);
}

// ---------------------------------------------------------------------------
// Persistence + IPC sync
// ---------------------------------------------------------------------------

async function initFromStore() {
  if (typeof window === 'undefined' || !window.electronAPI) return;
  const stored = await window.electronAPI.storeGet<string | null>(STORE_KEY_ROOM_ID);
  if (typeof stored === 'string' && stored) {
    useRoomStore.setState({ roomId: stored });
  }
}

if (typeof window !== 'undefined') {
  void initFromStore();

  window.electronAPI?.onStateBroadcast((channel, payload) => {
    if (channel !== 'room') return;
    syncing = true;
    useRoomStore.setState(payload as Partial<RoomState>);
    syncing = false;
  });
}
