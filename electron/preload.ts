/**
 * Preload-скрипт. Единственный мост между веб-контекстом и Node.
 * Открывает минимальный, явно перечисленный API — никакого electron/ipcRenderer наружу.
 */
import { contextBridge, ipcRenderer } from 'electron';

const gameStorage = {
  save(slot: string, data: unknown): Promise<boolean> {
    return ipcRenderer.invoke('storage:save', slot, data);
  },
  load(slot: string): Promise<unknown> {
    return ipcRenderer.invoke('storage:load', slot);
  },
};

contextBridge.exposeInMainWorld('gameStorage', gameStorage);
