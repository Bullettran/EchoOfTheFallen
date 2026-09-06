/**
 * Тесты мульти-врага: несколько слотов, цели, призыв, победа только
 * когда мертвы ВСЕ враги, независимые ИИ-планы каждого слота.
 */
import { describe, it, expect } from 'vitest';
import { makeEngine, dummyEnemy } from './fixtures';
import type { BattleEngine } from '@/game/BattleEngine';
import type { EnemyDefinition } from '@/types';

const dummyEnemy2: EnemyDefinition = {
  ...dummyEnemy,
  id: 'dummy2',
  name: 'Второй манекен',
  deck: ['enemy_smite', 'enemy_guard', 'enemy_slash'],
};

/** uid карты в руке по defId (рука перемешана — ищем, а не берём по индексу). */
const uidOf = (e: BattleEngine, defId: string): string => {
  const card = e.hand.find((c) => c.defId === defId);
  if (!card) throw new Error(`not in hand: ${defId}`);
  return card.uid;
};

describe('BattleEngine: мульти-враг', () => {
  it('два врага: у каждого свой HP и id', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard'], {}, [
      dummyEnemy,
      dummyEnemy2,
    ]);
    e.start();
    expect(e.enemySlots).toHaveLength(2);
    expect(e.enemySlots[0]!.unit.id).toBe('enemy_0');
    expect(e.enemySlots[1]!.unit.id).toBe('enemy_1');
    expect(e.enemySlots[1]!.unit.name).toBe('Второй манекен');
  });

  it('playCard целятся в конкретного врага по targetId', () => {
    const e = makeEngine(['strike', 'guard', 'guard', 'guard', 'guard'], {}, [
      dummyEnemy,
      dummyEnemy2,
    ]);
    e.start();
    expect(e.playCard(uidOf(e, 'strike'), 'enemy_1')).toBe(true);
    expect(e.enemySlots[1]!.unit.hp).toBe(100 - 6);
    expect(e.enemySlots[0]!.unit.hp).toBe(100);
  });

  it('победа только когда мертвы ВСЕ враги', () => {
    const e = makeEngine(['strike', 'strike', 'guard', 'guard', 'guard'], {}, [
      dummyEnemy,
      dummyEnemy2,
    ]);
    e.start();
    e.enemySlots[0]!.unit.hp = 5;
    expect(e.playCard(uidOf(e, 'strike'), 'enemy_0')).toBe(true); // убил первого
    expect(e.phase).toBe('player'); // второй жив — бой продолжается
    expect(e.aliveSlots).toHaveLength(1);

    e.enemySlots[1]!.unit.hp = 6;
    expect(e.playCard(uidOf(e, 'strike'), 'enemy_1')).toBe(true);
    expect(e.phase).toBe('victory');
  });

  it('оба врага атакуют на своих ходах', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard'], {}, [
      dummyEnemy,
      dummyEnemy2,
    ]);
    e.start();
    const hpBefore = e.player.hp;
    const steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    // Слот 1 (slash,guard,guard): slash 7. Слот 2 (smite,guard,slash): smite 9 + slash 7.
    // Aggressive играет по 2 карты (энергия 2): 7 + 16 = 23
    expect(e.player.hp).toBe(hpBefore - 23);
  });

  it('spawnEnemy добавляет слот прямо в бою', () => {
    const e = makeEngine(['strike', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    const before = e.enemySlots.length;
    e.spawnEnemy(dummyEnemy2, 15);
    expect(e.enemySlots).toHaveLength(before + 1);
    const spawned = e.enemySlots[before]!;
    expect(spawned.unit.hp).toBe(15);
    expect(spawned.unit.maxHp).toBe(15);
    // призванный действует со следующего хода врагов
    const steps = e.beginEnemyTurn();
    const spawnSteps = steps.filter(
      (s) => s.kind === 'playCard' && s.enemyIndex === before,
    );
    expect(spawnSteps.length).toBeGreaterThan(0);
  });

  it('атака без явной цели уходит в первого ЖИВОГО', () => {
    const e = makeEngine(['strike', 'strike', 'guard', 'guard', 'guard'], {}, [
      dummyEnemy,
      dummyEnemy2,
    ]);
    e.start();
    e.enemySlots[0]!.unit.hp = 1;
    expect(e.playCard(uidOf(e, 'strike'), 'enemy_0')).toBe(true);
    expect(e.enemySlots[0]!.unit.hp).toBe(0);
    expect(e.playCard(uidOf(e, 'strike'))).toBe(true);
    expect(e.enemySlots[1]!.unit.hp).toBe(100 - 6);
  });

  it('намерения считаются для каждого слота отдельно и показывают ПОЛНЫЙ план', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard'], {}, [
      dummyEnemy,
      { ...dummyEnemy2, aiStyle: 'defensive' },
    ]);
    e.start();
    const intents = e.enemyIntents;
    expect(intents).toHaveLength(2);
    // Агрессивный: начинает с атаки (хотя после может добрать блок)
    expect(intents[0]!.kind).toBe('attack');
    expect(intents[0]!.parts![0]!.kind).toBe('attack');
    // Защитный: сначала блок, потом атака — намерение показывает и то и другое
    expect(intents[1]!.parts!.some((p) => p.kind === 'defend')).toBe(true);
    expect(intents[1]!.parts!.some((p) => p.kind === 'attack')).toBe(true);
    // Наличие атаки в плане делает вид намерения «attack» (урон игроку важнее)
    expect(intents[1]!.kind).toBe('attack');
  });
});
