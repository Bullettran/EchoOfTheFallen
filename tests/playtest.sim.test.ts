/**
 * Плейтест-симуляция Акта 1 (диагностика баланса, не строгие ассерты).
 * Бот-игрок: разыгрывает атаки → блок → конец хода. Проверки — честный
 * Math.random. Выводит статистику смертей/финишей и метрики боя с боссом.
 */
import { describe, it, expect } from 'vitest';
import { StoryEngine } from '@/game/StoryEngine';
import { BattleEngine } from '@/game/BattleEngine';
import { ACT1_NODES, ACT1_START } from '@/data/story/act1';
import { ENEMIES } from '@/data/enemies';
import { BALANCE } from '@/core/config';
import { DEFAULT_COMBAT_STATS } from '@/data/skills';
import type { CombatStats, EnemyDefinition } from '@/types';

const BASE_DECK = [...BALANCE.player.startingDeck];

/** Симуляция боя: простой бот (атаки → блок → конец хода). */
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
    // ход игрока: пока есть энергия — играем карты (атаки в приоритете)
    for (let i = 0; i < 8; i++) {
      if ((e.phase as string) !== 'player') break;
      const playable = e.hand.filter((c) => {
        const cost = c.defId === 'strike' ? 1 : 1;
        return cost <= e.energy;
      });
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

/** Один прогон акта ботом: случайные выборы, честные броски. */
function simAct(): { finished: boolean; diedAt: string | null; deck: string[]; bossTurns: number | null; bossWin: boolean } {
  const engine = new StoryEngine({ nodes: ACT1_NODES, startNode: ACT1_START });
  const deck = [...BASE_DECK];
  let diedAt: string | null = null;
  let bossTurns: number | null = null;
  let bossWin = false;

  for (let guard = 0; guard < 60; guard++) {
    // автопереходы
    while (engine.advanceAuto()) { /* пусто */ }
    if (engine.actFinished) break;
    const choices = engine.visibleChoices();
    if (choices.length === 0) break;
    const choice = choices[Math.floor(Math.random() * choices.length)]!;

    let branch: 'success' | 'fail' = 'success';
    if (choice.check) branch = engine.roll(choice.check).success ? 'success' : 'fail';

    const outcome = branch === 'success' || !choice.fail ? choice.success : choice.fail;
    // награды в колоду (карты)
    const next = engine.applyOutcome(choice, branch);
    const awards = engine.takeAwards();
    deck.push(...awards.cards);
    engine.takeAwards(); // очистка (души боту не нужны)

    if (outcome.battle) {
      const defs = outcome.battle.enemies.map((id) => ENEMIES[id]!).filter(Boolean);
      const isBoss = defs.some((d) => d.boss);
      const res = simBattle(deck, defs);
      if (res.win === 'defeat') { diedAt = engine.currentNodeId + '→бой:' + defs[0]!.id; return { finished: false, diedAt, deck, bossTurns, bossWin }; }
      if (isBoss) { bossTurns = res.turns; bossWin = res.win === 'victory' || res.win === 'spared'; }
      engine.goTo(engine.applyBattleResult(choice, branch, res.win === 'spared' ? 'spared' : 'victory'));
      continue;
    }
    if (next) engine.goTo(next);
  }
  return { finished: engine.actFinished, diedAt, deck, bossTurns, bossWin };
}

describe('Плейтест-симуляция Акта 1 (диагностика)', () => {
  it('30 прогонов ботом: статистика проходимости', () => {
    const N = 30;
    let finished = 0;
    let bossReached = 0;
    let bossWins = 0;
    const deathNodes = new Map<string, number>();
    const bossTurnsAll: number[] = [];

    for (let i = 0; i < N; i++) {
      const r = simAct();
      if (r.bossTurns !== null) { bossReached += 1; bossTurnsAll.push(r.bossTurns); if (r.bossWin) bossWins += 1; }
      if (r.finished) finished += 1;
      if (r.diedAt) deathNodes.set(r.diedAt, (deathNodes.get(r.diedAt) ?? 0) + 1);
    }

    const avgBossTurns = bossTurnsAll.length
      ? (bossTurnsAll.reduce((a, b) => a + b, 0) / bossTurnsAll.length).toFixed(1)
      : '-';
    console.log('=== АКТ 1: симуляция', N, 'прогонов ===');
    console.log('Финишей:', finished, '/', N);
    console.log('Дошли до босса:', bossReached, '| Побед над боссом:', bossWins);
    console.log('Средняя длина боя с боссом (ходов):', avgBossTurns);
    console.log('Смерти по узлам:', Object.fromEntries(deathNodes));

    // Мягкие гарантии: бот должен уметь проходить акт хотя бы иногда
    expect(finished).toBeGreaterThan(0);
  });

  it('босс в вакууме: винрейт стартовой колодой vs +прокачка', () => {
    const boss = ENEMIES['gate_shadow']!;
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
      bonusDamage: 4,      // Сила ~5 узлов
      maxHpBonus: 16,      // Выносливость ~4 узлов
      surviveLethalOnce: true,
    };
    const upgraded = run(buffed);
    console.log('=== BOSS (120 HP):', N, 'battles ===');
    console.log('Start deck:', naked, 'wins | Buffed:', upgraded, 'wins');

    // Ожидание: глупый бот на стартовой колоде выигрывает у босса не всегда
    // (25–75%) — живой игрок с решениями сильнее бота; прокачка помогает
    expect(naked).toBeLessThan(N);
    expect(upgraded).toBeGreaterThan(naked);
  });
});
