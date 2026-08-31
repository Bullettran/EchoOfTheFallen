"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Electron main-процесс.
 * Безопасность: nodeIntegration выключен, contextIsolation включён,
 * весь доступ к Node (fs, пути) — только здесь и через IPC-контракт preload.ts.
 */
const electron_1 = require("electron");
const node_path_1 = require("node:path");
const promises_1 = require("node:fs/promises");
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(DEV_SERVER_URL);
let mainWindow = null;
/** Путь к папке сохранений: %APPDATA%/echoes-of-the-fallen/saves */
function savesDir() {
    return (0, node_path_1.join)(electron_1.app.getPath('userData'), 'saves');
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 720,
        backgroundColor: '#0b0a0f',
        title: 'Echoes of the Fallen',
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, 'preload.js'),
            nodeIntegration: false, // рендерер не видит Node
            contextIsolation: true, // preload в изолированном контексте
            sandbox: true,
            webSecurity: true,
        },
    });
    if (isDev) {
        void mainWindow.loadURL(DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        void mainWindow.loadFile((0, node_path_1.join)(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// ---- IPC: контракт должен зеркально совпадать с window.gameStorage в preload.ts ----
electron_1.ipcMain.handle('storage:save', async (_e, slot, data) => {
    if (!/^[\w-]{1,64}$/.test(slot))
        throw new Error(`Invalid save slot: ${slot}`);
    const dir = savesDir();
    await (0, promises_1.mkdir)(dir, { recursive: true });
    await (0, promises_1.writeFile)((0, node_path_1.join)(dir, `${slot}.json`), JSON.stringify(data, null, 2), 'utf-8');
    return true;
});
electron_1.ipcMain.handle('storage:load', async (_e, slot) => {
    if (!/^[\w-]{1,64}$/.test(slot))
        throw new Error(`Invalid save slot: ${slot}`);
    try {
        const raw = await (0, promises_1.readFile)((0, node_path_1.join)(savesDir(), `${slot}.json`), 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null; // слота нет — не ошибка для игры
    }
});
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
