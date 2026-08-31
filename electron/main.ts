/**
 * Electron main-процесс.
 * Безопасность: nodeIntegration выключен, contextIsolation включён,
 * весь доступ к Node (fs, пути) — только здесь и через IPC-контракт preload.ts.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;

/** Путь к папке сохранений: %APPDATA%/echoes-of-the-fallen/saves */
function savesDir(): string {
  return join(app.getPath('userData'), 'saves');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#0b0a0f',
    title: 'Echoes of the Fallen',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,      // рендерер не видит Node
      contextIsolation: true,       // preload в изолированном контексте
      sandbox: true,
      webSecurity: true,
    },
  });

  if (isDev) {
    void mainWindow.loadURL(DEV_SERVER_URL!);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---- IPC: контракт должен зеркально совпадать с window.gameStorage / window.artApi в preload.ts ----
ipcMain.handle('storage:save', async (_e, slot: string, data: unknown) => {
  if (!/^[\w-]{1,64}$/.test(slot)) throw new Error(`Invalid save slot: ${slot}`);
  const dir = savesDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${slot}.json`), JSON.stringify(data, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('storage:load', async (_e, slot: string) => {
  if (!/^[\w-]{1,64}$/.test(slot)) throw new Error(`Invalid save slot: ${slot}`);
  try {
    const raw = await readFile(join(savesDir(), `${slot}.json`), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null; // слота нет — не ошибка для игры
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
