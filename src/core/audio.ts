/**
 * Аудио-модуль: SFX на событиях EventBus + UI-клики + фоновая музыка (BGM)
 * с кроссфейдом по экранам. Без зависимостей: HTMLAudioElement.
 * Файлы: sfx/ — Kenney CC0; bg/ — фоновые композиции (loop, тихо).
 */
import { eventBus } from '@/core/EventBus';
import type { Screen } from '@/stores/ui';

const modules = import.meta.glob('../assets/audio/sfx/*.{ogg,wav,mp3}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const sfxByName: Record<string, string> = {};
for (const [p, url] of Object.entries(modules)) {
  sfxByName[p.split('/').pop()!.replace(/\.(ogg|wav|mp3)$/i, '')] = url;
}

const bgModules = import.meta.glob('../assets/audio/bg/*.{mp3,ogg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const bgByName: Record<string, string> = {};
for (const [p, url] of Object.entries(bgModules)) {
  bgByName[p.split('/').pop()!.replace(/\.(mp3|ogg|wav)$/i, '')] = url;
}

/** Имена BGM-треков (файлы в assets/audio/bg). */
const BG_MENU = 'begin-no-license'; // меню и бой
const BG_HUB = 'hub-no-license'; // хаб, история, выбор противника

/** Какой трек играет на экране. */
export function bgForScreen(screen: Screen): string | null {
  switch (screen) {
    case 'menu':
    case 'battle':
      return bgByName[BG_MENU] ? BG_MENU : null;
    default:
      return bgByName[BG_HUB] ? BG_HUB : null;
  }
}

/** Фоновая музыка: ОСЗВУЧЕННО ТИХО — атмосфера, а не концерт. */
const BGM_VOLUME = 0.2;

let muted = false;
let volume = 0.55;
let bgEl: HTMLAudioElement | null = null;
let bgName = '';
let bgFadeTimer: ReturnType<typeof setInterval> | null = null;
/** Ограничитель одновременных звуков (защита от спама урона). */
let playing = 0;
const MAX_CONCURRENT = 8;

/** Безопасный запуск: в jsdom play() не возвращает Promise. */
function safePlay(el: HTMLAudioElement, onReject?: () => void): void {
  const p = el.play() as unknown as Promise<void> | undefined;
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      if (onReject) onReject();
    });
  } else if (onReject) {
    // автоплей-политика или тестовое окружение — звук не стартанул
    onReject();
  }
}

/** Проиграть SFX по имени (если есть и не замьючено). */
export function play(name: string, gain = 1): void {
  if (muted) return;
  const url = sfxByName[name];
  if (!url) return;
  if (playing >= MAX_CONCURRENT) return;
  const el = new Audio(url);
  el.volume = Math.min(1, volume * gain);
  playing += 1;
  el.onended = () => {
    playing -= 1;
  };
  el.onerror = () => {
    playing -= 1;
  };
  safePlay(el, () => {
    playing -= 1; // автоплей-политика: до первого клика браузер может блокировать
  });
}

/** Запустить фоновую музыку с плавным появлением (повторный вызов с тем же
 *  именем — no-op; смена — кроссфейд: старая затихает, новая нарастает). */
export function playBg(name: string): void {
  const url = bgByName[name];
  if (!url || name === bgName) return;
  bgName = name;

  // Затухание старого трека
  const old = bgEl;
  if (old) {
    const fade = setInterval(() => {
      old.volume = Math.max(0, old.volume - 0.04);
      if (old.volume <= 0) {
        old.pause();
        old.remove();
        clearInterval(fade);
      }
    }, 50);
  }

  const el = new Audio(url);
  el.loop = true;
  el.volume = 0;
  el.preload = 'auto';
  document.body.appendChild(el); // в DOM: невидим, но наблюдаем для диагностики
  bgEl = el;
  if (bgFadeTimer) clearInterval(bgFadeTimer);
  bgFadeTimer = setInterval(() => {
    if (!bgEl) return;
    const target = muted ? 0 : BGM_VOLUME;
    bgEl.volume = Math.min(target, bgEl.volume + 0.015);
    if (bgEl.volume >= target) {
      if (bgFadeTimer) clearInterval(bgFadeTimer);
      bgFadeTimer = null;
    }
  }, 60);
  void safePlay(el); // автоплей до первого взаимодействия — resumeBg поднимет
}

/** Восстановить BGM после разблокировки автоплея (первый клик). */
export function resumeBg(): void {
  if (bgEl && bgEl.paused && !muted) {
    void bgEl.play().catch(() => undefined);
  }
}

export function setMuted(m: boolean): void {
  muted = m;
  if (bgEl) bgEl.volume = m ? 0 : BGM_VOLUME;
}

export function isMuted(): boolean {
  return muted;
}

/** Подключить игровые события к звукам. Вызывается один раз из main.ts. */
export function initAudio(initialMuted: boolean): void {
  muted = initialMuted;

  // Боевые события
  eventBus.on('vfx:damage', ({ targetId, hpAfter }) => {
    play('hit', targetId === 'player' ? 1 : 0.85);
    if (hpAfter === 0 && targetId !== 'player') play('death', 0.9);
  });
  eventBus.on('vfx:block', () => play('block', 0.8));
  eventBus.on('vfx:heal', () => play('heal', 0.9));
  eventBus.on('vfx:mercy', () => play('heal', 0.7));
  eventBus.on('battle:ended', ({ result }) => {
    if (result === 'defeat') play('defeat');
    else play('victory');
  });

  // UI-клики: кнопки, выборы истории, карты, плитки
  const INTERACTIVE = 'button, .choice, .card, .tile, .enemy-card';
  document.addEventListener('pointerdown', (e) => {
    resumeBg(); // автоплей разблокирован первым взаимодействием
    const target = e.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE)) {
      play('click', 0.6);
    }
  });
}

/** Список доступных имён звуков (для тестов/диагностики). */
export function availableSfx(): string[] {
  return Object.keys(sfxByName);
}

/** Список доступных BGM-треков (для тестов). */
export function availableBg(): string[] {
  return Object.keys(bgByName);
}
