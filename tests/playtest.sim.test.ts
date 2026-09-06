/**
 * Плейтест-симуляция похода по Угольным пустошам (диагностика баланса).
 * Бот-игрок: разыгрывает карты → конец хода. Проверки — честный Math.random.
 * Выводит винрейты против обычных врагов, элиты и Короля-Пепла.
 */
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '@/game/BattleEngine';
import { cardCost } from '@/game/CardFactory';
import { ENEMIES, NORMAL_ENEMY_POOL, ELITE_ENEMY_POOL, BOSS_POOL } from '@/data/enemies';
import { CLASSES } from '@/data/classes';
import { BALANCE } from '@/core/config';
import { DEFAULT_COMBAT_STATS } from '@/data/skills';
import type { CombatStats, EnemyDefinition } from '@/types';

const BASE_DECK = [...CLASSES.courier.startingDeck];

/** Симуляция боя: простой бот (играет affordable карты → конец хода). */
function simBattle(
  deck: string[],
  enemyDefs: EnemyDefinition[],
  stats: CombatStats = DEFAULT_COMBAT_STATS,
): { win: 'victory' | 'defeat' | 'spared' | 'timeout'; turns: number } {
  const e = new BattleEngine(
    BALANCE.player.maxHp,
    deck.map((id, i) => ({ uid: `s${i}_${id}`, defId: id, upgradeLevel: 0 })),
    enemyDefs,
    stats,
    0,
  );
  e.start();
  let turns = 0;
  for (let guard = 0; guard < 120; guard++) {
    // ход игрока: пока есть энергия — играем карты
    for (let i = 0; i < 8; i++) {
      if ((e.phase as string) !== 'player') break;
      const playable = e.hand.filter((c) => cardCost(c) <= e.energy);
      if (playable.length === 0) break;
      e.playCard(playable[0]!.uid);
    }
    if ((e.phase as string) !== 'player') break;
    e.endPlayerTurn();
    if ((e.phase as string) !== 'enemy') break;
    const steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    e.finishEnemyTurn();
    turns += 1;
    const ph = e.phase as string;
    if (ph === 'victory' || ph === 'defeat' || ph === 'spared') break;
  }
  const result = e.phase === 'victory' || e.phase === 'defeat' || e.phase === 'spared'
    ? e.phase
    : 'timeout';
  return { win: result, turns };
}

  describe('Плейтест-симуляция Угольных пустошей (диагностика)', () => {
  it('обычные враги: бот на стартовой колоде должен уметь побеждать', () => {
    const N = 40;
    let wins = 0;
    for (let i = 0; i < N; i++) {
      const id = NORMAL_ENEMY_POOL[Math.floor(Math.random() * NORMAL_ENEMY_POOL.length)]!;
      const r = simBattle(BASE_DECK, [ENEMIES[id]!]);
      if (r.win === 'victory' || r.win === 'spared') wins += 1;
    }
    console.log('=== Обычные враги:', wins, 'побед из', N, '===');
    // стартовая колода обязана справляться с рядовыми врагами хотя бы иногда
    expect(wins).toBeGreaterThan(0);
  });

  it('Король-Пепел в вакууме: винрейт стартовой колодой vs +прокачка', () => {
    const boss = ENEMIES[BOSS_POOL[0]!]!;
    const N = 40;
    const run = (stats: CombatStats): number => {
      let wins = 0;
      for (let i = 0; i < N; i++) {
        const r = simBattle(BASE_DECK, [boss], stats);
        if (r.win !== 'defeat' && r.win !== 'timeout') wins += 1;
      }
      return wins;
    };
    const naked = run(DEFAULT_COMBAT_STATS);
    const buffed: CombatStats = {
      ...DEFAULT_COMBAT_STATS,
      bonusDamage: 4,      // Сервоприводы ~5 узлов
      maxHpBonus: 16,      // Корпус ~4 узлов
      surviveLethalOnce: true,
    };
    const upgraded = run(buffed);
    console.log('=== КОРОЛЬ-ПЕПЕЛ (' + boss.maxHp + ' HP):', N, 'battles ===');
    console.log('Start deck:', naked, 'wins | Buffed:', upgraded, 'wins');

    // Ожидание: глупый бот на стартовой колоде выигрывает у босса не всегда;
    // живой игрок с решениями сильнее бота; прокачка помогает
    expect(naked).toBeLessThan(N);
    expect(upgraded).toBeGreaterThan(naked);
  });

  it('элита бьёт больнее обычных: sanity-check', () => {
    const elite = ENEMIES[ELITE_ENEMY_POOL[0]!]!;
    expect(elite.maxHp).toBeGreaterThanOrEqual(46);
    expect(ENEMIES[BOSS_POOL[0]!]!.boss).toBeDefined();
  });
});
