import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron';
import http from 'node:http';
import crypto from 'node:crypto';
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
// Google OAuth — Loopback redirect (RFC 8252). Runs a one-shot HTTP server
// on 127.0.0.1:OAUTH_PORT, opens the consent page in the system browser via
// shell.openExternal, exchanges the returned code for tokens (PKCE), and
// returns the id_token / access_token to the renderer so it can call
// signInWithCredential into Firebase.
// ---------------------------------------------------------------------------

const OAUTH_PORT = 51234;

interface GoogleAuthRequest {
  clientId: string;
  clientSecret: string;
}

interface GoogleTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
}

let inFlightOAuthServer: http.Server | null = null;

function closeInFlightOAuth() {
  if (inFlightOAuthServer) {
    try { inFlightOAuthServer.close(); } catch { /* already closed */ }
    inFlightOAuthServer = null;
  }
}

function generatePkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

function renderHtmlPage(title: string, body: string, autoClose = true): string {
  const closingScript = autoClose
    ? '<script>setTimeout(()=>window.close(),1500)</script>'
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
         padding: 48px 24px; max-width: 520px; margin: 0 auto;
         color: #2d2d2d; text-align: center; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { color: #666; line-height: 1.5; margin: 4px 0; }
</style></head><body>${body}${closingScript}</body></html>`;
}

async function exchangeCodeForTokens(args: {
  code: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      code: args.code,
      code_verifier: args.verifier,
      grant_type: 'authorization_code',
      redirect_uri: args.redirectUri,
    }).toString(),
  });
  const data = (await res.json()) as {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.id_token) {
    throw new Error(
      data.error_description ?? data.error ?? `토큰 교환 실패 (${res.status})`,
    );
  }
  return {
    idToken: data.id_token,
    accessToken: data.access_token ?? '',
    refreshToken: data.refresh_token,
  };
}

function startGoogleAuth(req: GoogleAuthRequest): Promise<GoogleTokens> {
  closeInFlightOAuth();

  return new Promise((resolve, reject) => {
    const { verifier, challenge } = generatePkce();
    const state = crypto.randomBytes(16).toString('base64url');
    const redirectUri = `http://127.0.0.1:${OAUTH_PORT}/callback`;

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', req.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('prompt', 'select_account');

    const timer = setTimeout(() => {
      closeInFlightOAuth();
      reject(new Error('Google 인증 시간이 초과되었습니다.'));
    }, 5 * 60 * 1000);

    const server = http.createServer(async (incoming, response) => {
      const reqUrl = new URL(
        incoming.url ?? '/',
        `http://127.0.0.1:${OAUTH_PORT}`,
      );
      if (reqUrl.pathname !== '/callback') {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      const returnedState = reqUrl.searchParams.get('state');
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          renderHtmlPage(
            '인증 실패',
            `<h1>인증이 취소되었습니다.</h1><p>${error}</p>`,
          ),
        );
        clearTimeout(timer);
        closeInFlightOAuth();
        reject(new Error(`Google 인증 거부: ${error}`));
        return;
      }

      if (!code || returnedState !== state) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          renderHtmlPage('인증 실패', '<h1>잘못된 요청입니다.</h1>'),
        );
        clearTimeout(timer);
        closeInFlightOAuth();
        reject(new Error('Google 인증 응답이 유효하지 않습니다.'));
        return;
      }

      try {
        const tokens = await exchangeCodeForTokens({
          code,
          verifier,
          clientId: req.clientId,
          clientSecret: req.clientSecret,
          redirectUri,
        });
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          renderHtmlPage(
            '로그인 완료',
            '<h1>로그인 완료</h1><p>이 창을 닫고 Pet Timer로 돌아가세요.</p>',
          ),
        );
        clearTimeout(timer);
        closeInFlightOAuth();
        // Refocus main window so the user lands back inside the app.
        mainWindow?.show();
        mainWindow?.focus();
        resolve(tokens);
      } catch (err) {
        response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          renderHtmlPage(
            '토큰 교환 실패',
            `<h1>토큰 교환 실패</h1><p>${(err as Error).message}</p>`,
            false,
          ),
        );
        clearTimeout(timer);
        closeInFlightOAuth();
        reject(err);
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      closeInFlightOAuth();
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `포트 ${OAUTH_PORT}이 이미 사용 중입니다. 다른 인증 창을 닫고 다시 시도하세요.`,
          ),
        );
      } else {
        reject(err);
      }
    });

    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      inFlightOAuthServer = server;
      void shell.openExternal(authUrl.toString());
    });
  });
}

ipcMain.handle('auth:googleStart', async (_e, req: GoogleAuthRequest) => {
  if (!req?.clientId || !req?.clientSecret) {
    throw new Error('Client ID / Secret이 전달되지 않았습니다.');
  }
  return startGoogleAuth(req);
});

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

// ---------------------------------------------------------------------------
// Windows auto-launch — store the user's preference in electron-store and
// mirror it to the OS via app.setLoginItemSettings. The pet window comes up
// hidden→shown via ready-to-show; the main window stays hidden (show: false)
// so an auto-started session lands silently in the tray.
// ---------------------------------------------------------------------------

const AUTO_LAUNCH_KEY = 'app.autoLaunch';

function applyAutoLaunch(enabled: boolean) {
  app.setLoginItemSettings({ openAtLogin: enabled });
}

ipcMain.handle('app:getAutoLaunch', () => {
  return Boolean(store.get(AUTO_LAUNCH_KEY, false));
});

ipcMain.handle('app:setAutoLaunch', (_e, enabled: boolean) => {
  store.set(AUTO_LAUNCH_KEY, Boolean(enabled));
  applyAutoLaunch(Boolean(enabled));
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
  // Reconcile the OS login-item state with our persisted preference. If the
  // registry was cleared (reinstall, group policy, manual edit), this brings
  // it back; if the user disabled it, it stays off.
  applyAutoLaunch(Boolean(store.get(AUTO_LAUNCH_KEY, false)));

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
