/**
 * Типизированная шина событий (Observer pattern).
 * Это ЕДИНСТВЕННЫЙ канал связи Phaser <-> Vue. Phaser-сцена только слушает
 * VFX-события (урон, лечение, состояния) и не знает о Vue; Vue-компоненты
 * триггерят действия через battle-store, а не трогают Phaser напрямую.
 */
import mitt, { type Emitter } from 'mitt';
import type { EnemyIntent, StateInstance } from '@/types';

/**
 * Контракты событий. ВАЖНО: type-алиас, а не interface — mitt требует
 * Record<EventType, unknown>, а interface не даёт неявной индексной сигнатуры.
 */
export type GameEvents = {
  // ---- VFX-события (слушает Phaser) ----
  'vfx:damage': { targetId: string; amount: number; hpAfter: number };
  'vfx:block': { targetId: string; amount: number };
  'vfx:heal': { targetId: string; amount: number; hpAfter: number };
  'vfx:state': { targetId: string; state: StateInstance; isNew: boolean };
  'vfx:cardPlayed': { cardDefId: string; targetId: string };
  'vfx:shake': { targetId: string };
  'vfx:enemySpawned': { targetId: string; defId: string };

  // ---- Игровые события (слушает Vue/сторы) ----
  'battle:started': { enemyName: string };
  'battle:ended': { result: 'victory' | 'defeat' | 'spared' };
  'vfx:mercy': { targetId: string };
  'turn:playerStart': { turn: number };
  'turn:enemyStart': { turn: number };
  'battle:targetSelected': { targetId: string };
  'enemy:intent': EnemyIntent;
  'log:message': { text: string; kind: 'info' | 'damage' | 'heal' | 'state' };
};

export const eventBus: Emitter<GameEvents> = mitt<GameEvents>();
