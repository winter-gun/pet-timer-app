import { create } from 'zustand';
import type { PetPose, PetSpecies } from '../types';
import { savePetSettings } from '../firestore';
import { useAuthStore } from './authStore';

interface PetState {
  species: PetSpecies;
  name: string;
  pose: PetPose;
  setSpecies: (species: PetSpecies) => void;
  setName: (name: string) => void;
  setPose: (pose: PetPose) => void;
}

// Prevents broadcast-triggered setState from echoing back to main process
let syncing = false;

function sync(payload: Partial<Pick<PetState, 'species' | 'name' | 'pose'>>) {
  if (syncing) return;
  window.electronAPI?.syncState('pet', payload);
}

function persistRemote(payload: { species?: PetSpecies; name?: string }) {
  const user = useAuthStore.getState().user;
  if (!user) return;
  void savePetSettings(user.uid, payload);
}

export const usePetStore = create<PetState>((set) => ({
  species: 'fennec',
  name: '',
  pose: 'idle',

  setSpecies: (species) => {
    set({ species });
    sync({ species });
    persistRemote({ species });
  },

  setName: (name) => {
    set({ name });
    sync({ name });
    persistRemote({ name });
  },

  setPose: (pose) => {
    set({ pose });
    sync({ pose });
  },
}));

// Register broadcast listener once at module load (runs per-window)
if (typeof window !== 'undefined') {
  window.electronAPI?.onStateBroadcast((channel, payload) => {
    if (channel !== 'pet') return;
    syncing = true;
    usePetStore.setState(payload as Partial<PetState>);
    syncing = false;
  });
}
