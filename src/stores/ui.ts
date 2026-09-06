/** UI-стор: навигация между экранами (+ смена фоновой музыки). */
import { defineStore } from 'pinia';
import { playBg, bgForScreen } from '@/core/audio';

export type Screen = 'menu' | 'class_select' | 'hub' | 'battle' | 'trial';

export const useUiStore = defineStore('ui', {
  state: (): { screen: Screen } => ({ screen: 'menu' }),
  actions: {
    setScreen(s: Screen): void {
      this.screen = s;
      const bg = bgForScreen(s);
      if (bg) playBg(bg);
    },
  },
});
