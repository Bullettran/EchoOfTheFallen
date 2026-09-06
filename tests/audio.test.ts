/**
 * Тесты аудио-реестра: SFX и фоновая музыка на месте.
 */
import { describe, it, expect } from 'vitest';
import { availableSfx, availableBg, bgForScreen } from '@/core/audio';

describe('audio: реестр SFX (Kenney CC0)', () => {
  it('все ключевые игровые звуки доступны', () => {
    const required = ['click', 'card', 'dice', 'hit', 'block', 'death', 'heal', 'victory', 'defeat'];
    const have = new Set(availableSfx());
    for (const name of required) {
      expect(have.has(name), `нет звука: ${name}`).toBe(true);
    }
  });
});

describe('audio: фоновая музыка', () => {
  it('оба трека в реестре', () => {
    const bg = new Set(availableBg());
    expect(bg.has('begin-no-license'), 'нет трека меню/боя').toBe(true);
    expect(bg.has('hub-no-license'), 'нет трека хаба/истории').toBe(true);
  });

  it('экраны ссылаются на корректные треки', () => {
    expect(bgForScreen('menu')).toBe('begin-no-license');
    expect(bgForScreen('battle')).toBe('begin-no-license');
    expect(bgForScreen('hub')).toBe('hub-no-license');
    expect(bgForScreen('trial')).toBe('hub-no-license');
  });
});
