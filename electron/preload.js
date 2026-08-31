"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Preload-скрипт. Единственный мост между веб-контекстом и Node.
 * Открывает минимальный, явно перечисленный API — никакого electron/ipcRenderer наружу.
 */
const electron_1 = require("electron");
const gameStorage = {
    save(slot, data) {
        return electron_1.ipcRenderer.invoke('storage:save', slot, data);
    },
    load(slot) {
        return electron_1.ipcRenderer.invoke('storage:load', slot);
    },
};
electron_1.contextBridge.exposeInMainWorld('gameStorage', gameStorage);
