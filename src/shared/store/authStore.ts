import { create } from 'zustand';
import {
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';
import { saveUserProfile } from '../firestore';

interface AuthState {
  user: User | null;
  loading: boolean;
  isAnonymous: boolean;
  authError: string | null;
  init: () => () => void;
  signInAnonymous: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

function describeAuthError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? '';
  const msg = e?.message ?? String(err);
  // Common Firebase Auth codes we hit in Electron — surfacing the code helps
  // the user (or me) figure out whether it's a config issue or a popup issue.
  return code ? `[${code}] ${msg}` : msg;
}

/**
 * Drive the Electron-main loopback OAuth flow and turn the returned id_token
 * into a Firebase AuthCredential. Renderer is responsible for handing the
 * Google Desktop OAuth client_id/secret to main (which then performs the
 * code → token exchange).
 */
async function acquireGoogleCredential() {
  const clientId = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID as
    | string
    | undefined;
  const clientSecret = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET as
    | string
    | undefined;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google Desktop OAuth 설정이 누락되었습니다. .env에 VITE_GOOGLE_DESKTOP_CLIENT_ID / VITE_GOOGLE_DESKTOP_CLIENT_SECRET를 추가하세요.',
    );
  }
  if (!window.electronAPI?.googleAuthStart) {
    throw new Error('Electron 환경이 아닙니다.');
  }
  const { idToken, accessToken } = await window.electronAPI.googleAuthStart({
    clientId,
    clientSecret,
  });
  // Firebase accepts (idToken, accessToken). Passing both keeps the user's
  // photoURL populated reliably — id_token alone sometimes omits picture.
  return GoogleAuthProvider.credential(idToken, accessToken);
}

async function persistProfile(user: User) {
  // Google sign-in populates displayName + photoURL on the Firebase User
  // object. Mirror them into Firestore so other room members can read them
  // without their own auth lookup.
  if (!user.displayName && !user.photoURL) return;
  try {
    await saveUserProfile(user.uid, {
      displayName: user.displayName ?? undefined,
      photoURL: user.photoURL ?? undefined,
    });
  } catch (err) {
    // Non-fatal — profile mirror failure shouldn't block sign-in.
    console.warn('[auth] saveUserProfile failed', err);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  isAnonymous: false,
  authError: null,
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
    set({ authError: null });
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.error('[auth] signInAnonymous failed', err);
      set({ authError: describeAuthError(err) });
    }
  },
  signInGoogle: async () => {
    set({ authError: null });
    try {
      const credential = await acquireGoogleCredential();
      const result = await signInWithCredential(auth, credential);
      await persistProfile(result.user);
    } catch (err) {
      console.error('[auth] signInGoogle failed', err);
      set({ authError: describeAuthError(err) });
    }
  },
  linkGoogle: async () => {
    set({ authError: null });
    const user = get().user;
    if (!user) {
      set({ authError: '로그인 상태가 아닙니다.' });
      return;
    }
    try {
      const credential = await acquireGoogleCredential();
      const result = await linkWithCredential(user, credential);
      await persistProfile(result.user);
    } catch (err) {
      console.error('[auth] linkGoogle failed', err);
      set({ authError: describeAuthError(err) });
    }
  },
  signOut: async () => {
    set({ authError: null });
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.error('[auth] signOut failed', err);
      set({ authError: describeAuthError(err) });
    }
  },
  clearAuthError: () => set({ authError: null }),
}));
