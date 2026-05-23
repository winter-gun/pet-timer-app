import { contextBridge, ipcRenderer } from 'electron';

const api = {
  showMain: () => ipcRenderer.invoke('main:show'),
  hideMain: () => ipcRenderer.invoke('main:hide'),
  storeGet: <T = unknown>(key: string) =>
    ipcRenderer.invoke('store:get', key) as Promise<T | undefined>,
  storeSet: (key: string, value: unknown) =>
    ipcRenderer.invoke('store:set', key, value) as Promise<void>,

  quit: () => ipcRenderer.invoke('app:quit'),
  showContextMenu: () => ipcRenderer.invoke('tray:showContextMenu'),

  // Tray "시작/일시정지" → main → main-window renderer
  onTimerToggle: (cb: () => void) => {
    ipcRenderer.on('timer:toggle', cb);
    return () => { ipcRenderer.removeListener('timer:toggle', cb); };
  },

  // Renderer → main: a store changed (fire-and-forget, no response needed)
  syncState: (channel: string, payload: unknown) =>
    ipcRenderer.send('store:sync', channel, payload),

  // Main → renderer: broadcast from another window (or tray action)
  onStateBroadcast: (cb: (channel: string, payload: unknown) => void) => {
    const handler: Parameters<typeof ipcRenderer.on>[1] = (_ev, ch, pl) =>
      cb(ch as string, pl);
    ipcRenderer.on('store:broadcast', handler);
    return () => ipcRenderer.removeListener('store:broadcast', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
