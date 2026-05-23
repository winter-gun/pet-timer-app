import { create } from 'zustand';

const STORE_KEY_SOUND_ENABLED = 'prefs.soundEnabled';

interface PrefsState {
  soundEnabled: boolean;
  autoLaunch: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  setAutoLaunch: (enabled: boolean) => void;
}

let syncing = false;

function sync(payload: Partial<PrefsState>) {
  if (syncing) return;
  window.electronAPI?.syncState('prefs', payload);
}

export const usePrefsStore = create<PrefsState>((set) => ({
  soundEnabled: true,
  autoLaunch: false,
  setSoundEnabled: (enabled) => {
    set({ soundEnabled: enabled });
    sync({ soundEnabled: enabled });
    void window.electronAPI?.storeSet(STORE_KEY_SOUND_ENABLED, enabled);
  },
  setAutoLaunch: (enabled) => {
    set({ autoLaunch: enabled });
    sync({ autoLaunch: enabled });
    // Persistence + OS registry are both handled by the main process so the
    // login item stays consistent with our stored preference.
    void window.electronAPI?.setAutoLaunch(enabled);
  },
}));

async function initFromStore() {
  if (typeof window === 'undefined' || !window.electronAPI) return;
  const [sound, autoLaunch] = await Promise.all([
    window.electronAPI.storeGet<boolean>(STORE_KEY_SOUND_ENABLED),
    window.electronAPI.getAutoLaunch(),
  ]);
  const patch: Partial<PrefsState> = {};
  if (typeof sound === 'boolean') patch.soundEnabled = sound;
  if (typeof autoLaunch === 'boolean') patch.autoLaunch = autoLaunch;
  if (Object.keys(patch).length > 0) {
    usePrefsStore.setState(patch);
  }
}

if (typeof window !== 'undefined') {
  void initFromStore();

  window.electronAPI?.onStateBroadcast((channel, payload) => {
    if (channel !== 'prefs') return;
    syncing = true;
    usePrefsStore.setState(payload as Partial<PrefsState>);
    syncing = false;
  });
}
