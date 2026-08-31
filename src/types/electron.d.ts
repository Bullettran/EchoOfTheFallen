/** Типы для API, который preload открывает в window (см. electron/preload.ts). */
export interface GameStorageApi {
  save(slot: string, data: unknown): Promise<boolean>;
  load(slot: string): Promise<unknown>;
}

declare global {
  interface Window {
    gameStorage?: GameStorageApi;
  }
}

export {};
