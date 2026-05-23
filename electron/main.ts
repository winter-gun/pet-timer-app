import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import Store from 'electron-store';

// All command-line switches MUST be appended before app is ready.

// Windows: Chromium's occlusion detection wrongly marks transparent areas as
// occluded and stops compositing them, producing a grey checkerboard.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// IMPORTANT: We deliberately do NOT disable the GPU. Earlier attempts with
// app.disableHardwareAcceleration() and --disable-gpu broke transparency
// completely (opaque red rectangle). Windows transparent windows depend on
// DWM's GPU compositing path.
//
// Linux-only switches like --enable-transparent-visuals and color-profile
// pins were removed on purpose — they interfered with Windows DWM rather
// than helping.

const store = new Store();

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const DIST = path.join(__dirname, '../dist');

let mainWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let timerStatus: 'idle' | 'running' | 'paused' = 'idle';

// ---------------------------------------------------------------------------
// Pet window size presets
// ---------------------------------------------------------------------------

type SizePreset = 'small' | 'medium' | 'large';

const SIZE_PRESETS: Record<SizePreset, { width: number; height: number }> = {
  small: { width: 150, height: 270 },
  medium: { width: 200, height: 360 },
  large: { width: 280, height: 504 },
};

const SIZE_LABELS: Record<SizePreset, string> = {
  small: '작게',
  medium: '보통',
  large: '크게',
};

const PET_WINDOW_SIZE_KEY = 'petWindow.size';
const PET_WINDOW_POSITION_KEY = 'petWindow.position';

function loadPetSize(): SizePreset {
  const raw = store.get(PET_WINDOW_SIZE_KEY) as SizePreset | undefined;
  return raw && raw in SIZE_PRESETS ? raw : 'medium';
}

// Keep a rect fully inside a real display's workArea. Handles the case where
// the saved position came from a monitor that's no longer attached or whose
// resolution shrank.
function clampPetBounds(bounds: { x: number; y: number; width: number; height: number }) {
  const display = screen.getDisplayMatching(bounds) ?? screen.getPrimaryDisplay();
  const wa = display.workArea;
  const x = Math.max(wa.x, Math.min(wa.x + wa.width - bounds.width, bounds.x));
  const y = Math.max(wa.y, Math.min(wa.y + wa.height - bounds.height, bounds.y));
  return { x, y };
}

function defaultPetPosition(width: number, height: number) {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - width - 20,
    y: workArea.y + workArea.height - height - 40,
  };
}

// ---------------------------------------------------------------------------
// Context menu (shared between tray right-click and pet window right-click)
// ---------------------------------------------------------------------------

function buildContextMenu(): Menu {
  const timerLabel =
    timerStatus === 'running' ? '일시정지' :
    timerStatus === 'paused'  ? '재개' :
                                '시작';

  const currentSize = loadPetSize();
  const sizeSubmenu: Electron.MenuItemConstructorOptions[] = (
    ['small', 'medium', 'large'] as SizePreset[]
  ).map((preset) => ({
    label: SIZE_LABELS[preset],
    type: 'checkbox',
    checked: currentSize === preset,
    click: () => setPetSize(preset),
  }));

  return Menu.buildFromTemplate([
    {
      label: timerLabel,
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('timer:toggle');
        }
      },
    },
    { type: 'separator' },
    {
      label: '메인 창 열기',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: '크기',
      submenu: sizeSubmenu,
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// Pet window size + position handling
// ---------------------------------------------------------------------------

function setPetSize(preset: SizePreset) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const dims = SIZE_PRESETS[preset];
  store.set(PET_WINDOW_SIZE_KEY, preset);

  // Top-left anchored resize per spec; re-clamp in case the new size pushes
  // the right/bottom edge off-screen.
  const [x, y] = petWindow.getPosition();
  const clamped = clampPetBounds({ x, y, width: dims.width, height: dims.height });

  petWindow.setBounds({ ...clamped, width: dims.width, height: dims.height });

  store.set(PET_WINDOW_POSITION_KEY, { x: clamped.x, y: clamped.y });

  // Refresh tray menu so the new checkmark is reflected.
  tray?.setContextMenu(buildContextMenu());
}

// ---------------------------------------------------------------------------
// Window factories
// ---------------------------------------------------------------------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    title: 'Pet Timer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep renderer running at full speed in background — timer must tick
      // accurately even when user focuses another app.
      backgroundThrottling: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(`${VITE_DEV_SERVER_URL}index.html`);
  } else {
    mainWindow.loadFile(path.join(DIST, 'index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!quitting && mainWindow) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createPetWindow() {
  const preset = loadPetSize();
  const dims = SIZE_PRESETS[preset];

  const savedPos = store.get(PET_WINDOW_POSITION_KEY) as
    | { x: number; y: number }
    | undefined;
  const startPos = savedPos ?? defaultPetPosition(dims.width, dims.height);
  const clamped = clampPetBounds({
    x: startPos.x,
    y: startPos.y,
    width: dims.width,
    height: dims.height,
  });

  petWindow = new BrowserWindow({
    width: dims.width,
    height: dims.height,
    x: clamped.x,
    y: clamped.y,
    transparent: true,
    frame: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // Required on Win11: Electron's default backgroundColor is #FFF
    // (opaque white). Without an explicit alpha-0 here, transparent: true
    // can be silently ignored. backgroundMaterial: 'none' prevents Win11
    // from picking the 'mica' system material (the 'auto' default).
    backgroundColor: '#00000000',
    backgroundMaterial: 'none',
    hasShadow: false,
    // resizable must stay true — toggling it with setResizable() corrupts
    // DWM alpha compositing; frameless windows have no visible handles
    // anyway, so users can't grab-resize.
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Dev-only: open DevTools detached so we can inspect what's actually
  // being rendered into the transparent window. Removing this later is a
  // one-line change.
  if (VITE_DEV_SERVER_URL) {
    petWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Re-assert alpha-0 on BrowserWindow at both lifecycle points. On Win11
  // the compositor can fall back to an opaque surface even when the
  // initial backgroundColor was '#00000000'; calling setBackgroundColor
  // again after the page loads forces the surface back to transparent.
  petWindow.webContents.on('did-finish-load', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.setBackgroundColor('#00000000');
  });

  petWindow.once('ready-to-show', () => {
    petWindow?.setBackgroundColor('#00000000');
    petWindow?.show();
  });

  if (VITE_DEV_SERVER_URL) {
    petWindow.loadURL(`${VITE_DEV_SERVER_URL}pet.html`);
  } else {
    petWindow.loadFile(path.join(DIST, 'pet.html'));
  }

  petWindow.on('moved', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    store.set(PET_WINDOW_POSITION_KEY, { x, y });
  });

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function createTray() {
  try {
    // Dev:  __dirname = dist-electron/  →  ../assets = project root
    // Prod: app is in asar, getAppPath() resolves inside asar correctly
    const iconPath = VITE_DEV_SERVER_URL
      ? path.join(__dirname, '..', 'assets', 'pets', 'fennec', 'idle.png')
      : path.join(app.getAppPath(), 'assets', 'pets', 'fennec', 'idle.png');

    console.log('[Tray] Icon path:', iconPath);
    const exists = fs.existsSync(iconPath);
    console.log('[Tray] Path exists:', exists);

    let icon: ReturnType<typeof nativeImage.createEmpty>;

    if (exists) {
      icon = nativeImage.createFromPath(iconPath);
      console.log('[Tray] isEmpty (raw):', icon.isEmpty());
      icon = icon.resize({ width: 32, height: 32 });
      console.log('[Tray] isEmpty (resized):', icon.isEmpty(), '| size:', icon.getSize());
    } else {
      console.warn('[Tray] Asset not found — falling back to app.getAppPath()');
      const fallbackPath = path.join(app.getAppPath(), 'assets', 'pets', 'fennec', 'idle.png');
      console.log('[Tray] Fallback path:', fallbackPath, '| exists:', fs.existsSync(fallbackPath));
      icon = nativeImage.createFromPath(fallbackPath).resize({ width: 32, height: 32 });
    }

    tray = new Tray(icon);
    tray.setToolTip('Pet Timer');
    tray.setContextMenu(buildContextMenu());
    tray.on('double-click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
    console.log('[Tray] Tray created successfully');
  } catch (err) {
    console.error('[Tray] Failed to create tray:', err);
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('main:show', () => {
  mainWindow?.show();
  mainWindow?.focus();
});

ipcMain.handle('main:hide', () => {
  mainWindow?.hide();
});

ipcMain.handle('store:get', (_e, key: string) => store.get(key));
ipcMain.handle('store:set', (_e, key: string, value: unknown) => {
  store.set(key, value);
});

ipcMain.handle('app:quit', () => {
  quitting = true;
  app.quit();
});

// Pet window right-click: pop up the context menu at the cursor over the
// pet window. menu.popup({ window }) is the proper API for a per-window
// context menu (anchored at the cursor by default).
ipcMain.handle('tray:showContextMenu', () => {
  const menu = buildContextMenu();
  if (petWindow && !petWindow.isDestroyed()) {
    menu.popup({ window: petWindow });
  } else {
    menu.popup();
  }
});

// Renderer → main: state changed. Update tray + broadcast to all windows.
ipcMain.on('store:sync', (_, channel: string, payload: unknown) => {
  if (channel === 'timer') {
    const { status } = payload as { status?: 'idle' | 'running' | 'paused' };
    if (status !== undefined) {
      timerStatus = status;
      tray?.setContextMenu(buildContextMenu());
    }
  }
  for (const win of [mainWindow, petWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('store:broadcast', channel, payload);
    }
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  createMainWindow();
  createPetWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  tray?.destroy();
  tray = null;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
    createPetWindow();
  }
});
