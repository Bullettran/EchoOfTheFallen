/**
 * Общие фикстуры тестов: детерминированные враги, колоды, CombatStats.
 * Движок не знает о рендере, поэтому тестируется напрямую.
 */
import { BattleEngine } from '@/game/BattleEngine';
import { createCard } from '@/game/CardFactory';
import { DEFAULT_COMBAT_STATS } from '@/data/skills';
import type { CombatStats, EnemyDefinition } from '@/types';

export const dummyEnemy: EnemyDefinition = {
  id: 'dummy',
  name: 'Манекен',
  maxHp: 100,
  level: 1,
  aiStyle: 'aggressive',
  // 3 разные карты: добор врага не порождает дубликаты через револьвер сброса
  deck: ['enemy_slash', 'enemy_guard', 'enemy_guard'],
  soulsDrop: 100,
  essenceChance: 0,
};

/** Двигло с заданной колодой игрока и статами (по умолчанию — без прокачки). */
export function makeEngine(
  playerDeck: string[],
  stats: Partial<CombatStats> = {},
  enemies: EnemyDefinition | EnemyDefinition[] = dummyEnemy,
  enemyDmgBonus = 0,
): BattleEngine {
  return new BattleEngine(
    70,
    playerDeck.map((id) => createCard(id)),
    enemies,
    { ...DEFAULT_COMBAT_STATS, ...stats },
    enemyDmgBonus,
  );
}

/** Сыграть карту из руки по defId (в тестах важен тип карты, не uid). */
export function playByDefId(engine: BattleEngine, defId: string): boolean {
  const card = engine.hand.find((c) => c.defId === defId);
  if (!card) throw new Error(`Card not in hand: ${defId}`);
  return engine.playCard(card.uid);
}
