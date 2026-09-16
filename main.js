import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_VERSION = '1.0.0';
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const IDLE_BEFORE_RESTART_MS = 3 * 60 * 1000;

let mainWindow = null;
let updateLock = false;
let pendingUpdateVersion = null;
let idleTimer = null;
let lastFocusedAt = 0;

/* =====================================================
   LOGGING
   ===================================================== */

function log(level, ...args) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] [updater] [${level}]`;
  if (level === 'ERROR') {
    console.error(msg, ...args);
  } else if (level === 'WARN') {
    console.warn(msg, ...args);
  } else {
    console.log(msg, ...args);
  }
}

/* =====================================================
   AUTO UPDATE
   ===================================================== */

let autoUpdater;
try {
  const updater = await import('electron-updater');
  autoUpdater = updater.autoUpdater;
} catch (err) {
  log('ERROR', 'electron-updater not available:', err.message);
}

function setupAutoUpdater() {
  if (!autoUpdater) {
    log('WARN', 'electron-updater not loaded, updates disabled');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = true;

  log('INFO', `Current version: ${APP_VERSION}`);

  autoUpdater.on('checking-for-update', () => {
    log('INFO', 'Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    log('INFO', `Update available: ${info.version}`);
  });

  autoUpdater.on('update-not-available', () => {
    log('INFO', 'App is up to date.');
  });

  autoUpdater.on('download-progress', (progress) => {
    if (Math.round(progress.percent) % 25 === 0) {
      log('INFO', `Downloading: ${Math.round(progress.percent)}%`);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (updateLock) {
      log('WARN', 'Update already pending, ignoring duplicate');
      return;
    }
    updateLock = true;
    pendingUpdateVersion = info.version;
    log('INFO', `Update downloaded: ${info.version}. Waiting for idle to install...`);
    scheduleIdleRestart();
  });

  autoUpdater.on('error', (err) => {
    log('ERROR', `Update error: ${err.message}`);
    updateLock = false;
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log('ERROR', 'Initial check failed:', err.message);
    });
  }, 10000);

  setInterval(() => {
    if (!updateLock) {
      autoUpdater.checkForUpdates().catch((err) => {
        log('ERROR', 'Periodic check failed:', err.message);
      });
    }
  }, CHECK_INTERVAL_MS);
}

/* =====================================================
   SAFE RESTART — only when user is away
   ===================================================== */

function scheduleIdleRestart() {
  if (idleTimer) clearTimeout(idleTimer);
  checkIdleAndRestart();
}

function checkIdleAndRestart() {
  if (!pendingUpdateVersion) return;

  const now = Date.now();
  const focused = mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused();
  const idleMs = now - lastFocusedAt;

  if (focused || idleMs < IDLE_BEFORE_RESTART_MS) {
    idleTimer = setTimeout(checkIdleAndRestart, 30000);
    return;
  }

  log('INFO', `User idle for ${Math.round(idleMs / 1000)}s. Restarting to install ${pendingUpdateVersion}...`);
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch (err) {
    log('ERROR', 'Failed to quit and install:', err.message);
  }
}

/* =====================================================
   WINDOW
   ===================================================== */

function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'ASU-Engineering-System.ico');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'ASU Engineering System',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  mainWindow.on('focus', () => {
    lastFocusedAt = Date.now();
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
      log('INFO', 'User returned. Restart deferred.');
      if (pendingUpdateVersion) {
        idleTimer = setTimeout(checkIdleAndRestart, 30000);
      }
    }
  });

  mainWindow.on('blur', () => {
    if (!lastFocusedAt) lastFocusedAt = Date.now();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  lastFocusedAt = Date.now();
}

/* =====================================================
   APP LIFECYCLE
   ===================================================== */

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
