import { create } from 'zustand';
import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  isAnonymous: boolean;
  init: () => () => void;
  signInAnonymous: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  isAnonymous: false,
  init: () => {
    return onAuthStateChanged(auth, (user) => {
      set({
        user,
        isAnonymous: user?.isAnonymous ?? false,
        loading: false,
      });
    });
  },
  signInAnonymous: async () => {
    await signInAnonymously(auth);
  },
  signInGoogle: async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  },
  linkGoogle: async () => {
    const user = get().user;
    if (!user) throw new Error('Not signed in');
    const provider = new GoogleAuthProvider();
    await linkWithPopup(user, provider);
  },
  signOut: async () => {
    await fbSignOut(auth);
  },
}));
