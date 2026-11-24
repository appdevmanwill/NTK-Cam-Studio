const path = require('node:path');
const fs = require('node:fs');
const {
  app,
  BrowserWindow,
  Menu,
  desktopCapturer,
  ipcMain,
  nativeTheme,
  session,
  shell,
} = require('electron');

const APP_ID = 'com.ntk.camstudio';
const ALLOWED_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'audioCapture',
  'videoCapture',
  'mediaKeySystem',
  'clipboard-read',
  'clipboard-sanitized-write',
]);

let mainWindow = null;

function resolveIconPath() {
  const candidates = [
    path.join(__dirname, '..', 'build-assets', 'icon.ico'),
    path.join(process.resourcesPath || '', 'build-assets', 'icon.ico'),
    path.join(__dirname, '..', 'public', 'favicon.ico'),
  ];
  return candidates.find((p) => p && fs.existsSync(p));
}

function getBackgroundColor(resolved) {
  const isDark =
    resolved === 'dark' || (resolved !== 'light' && nativeTheme.shouldUseDarkColors);
  return isDark ? '#0B0C0F' : '#F3F5F9';
}

function configureMediaPermissions() {
  const defaultSession = session.defaultSession;
  if (!defaultSession) return;

  defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });

  defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
        });
        if (sources.length > 0) {
          callback({ video: sources[0], audio: 'loopback' });
        } else {
          callback({});
        }
      } catch {
        callback({});
      }
    },
    { useSystemPicker: true }
  );
}

function createMainWindow() {
  const iconPath = resolveIconPath();
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: 'NTK Cam Studio',
    autoHideMenuBar: true,
    backgroundColor: getBackgroundColor(),
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
  void win.loadFile(indexHtml);

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  ipcMain.on('ntk:set-theme', (_event, payload) => {
    const preference = payload?.preference;
    if (preference === 'system' || preference === 'light' || preference === 'dark') {
      nativeTheme.themeSource = preference;
    }
    const bg = getBackgroundColor(payload?.resolved);
    for (const win of BrowserWindow.getAllWindows()) {
      win.setBackgroundColor(bg);
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    configureMediaPermissions();
    mainWindow = createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
