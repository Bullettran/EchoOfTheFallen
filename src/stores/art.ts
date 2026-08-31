/**
 * art-store — реестр артов. Артография полностью файловая:
 * изображения лежат в src/assets/images (см. core/assets.ts), бандлятся Vite'ом.
 * Ключи: 'card:<defId>' | 'enemy:<defId>'.
 */
import { defineStore } from 'pinia';
import { cardArtUrl, enemyPortraitUrl } from '@/core/assets';

export type ArtKind = 'card' | 'enemy';
export type ArtKey = `${ArtKind}:${string}`;

export const artKey = (kind: ArtKind, id: string): ArtKey => `${kind}:${id}`;

export const useArtStore = defineStore('art', {
  getters: {
    /** URL арта или null (компоненты сами решают, чем заменять). */
    artUrl(): (kind: ArtKind, id: string) => string | null {
      return (kind, id) => (kind === 'card' ? cardArtUrl(id) : enemyPortraitUrl(id));
    },
  },
});
