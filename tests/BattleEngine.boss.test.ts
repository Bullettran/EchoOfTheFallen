/**
 * Тесты боссовых механик и боевых перипетий: фазы, ритуал,
 * Несокрушимость, смертельный исход, цикл колоды.
 */
import { describe, it, expect } from 'vitest';
import { makeEngine, playByDefId, dummyEnemy } from './fixtures';
import { ENEMIES } from '@/data/enemies';
import type { EnemyDefinition } from '@/types';

const bossDef: EnemyDefinition = {
  id: 'test_boss',
  name: 'Тест-король',
  maxHp: 100,
  level: 5,
  aiStyle: 'aggressive',
  deck: ['enemy_slash'],
  soulsDrop: 250,
  essenceChance: 1,
  boss: {
    phases: [
      { name: 'Фаза 1', hpThresholdPct: 100 },
      {
        name: 'Фаза 2',
        hpThresholdPct: 50,
        onEnter: { applyState: { type: 'fury', stacks: 1, duration: 99 } },
      },
    ],
    ritual: { everyTurns: 3, label: 'Ритуал', action: { heal: 10 } },
  },
};

describe('BattleEngine: босс и смерть', () => {
  it('фаза босса включается при пробитии порога HP', () => {
    const e = makeEngine(['strike', 'guard', 'guard', 'guard', 'guard'], {}, bossDef);
    e.start();
    expect(e.bossPhaseName).toBe('Фаза 1');
    e.enemy.hp = 51; // ниже 50% не ждать шлифования картами
    playByDefId(e, 'strike'); // 6 урона → 45 HP → фаза 2 + Ярость
    expect(e.bossPhaseName).toBe('Фаза 2');
    expect(e.enemy.states.some((s) => s.type === 'fury')).toBe(true);
  });

  it('ритуал босса срабатывает каждый 3-й ход и лечит его', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard'], {}, bossDef);
    e.start();
    e.enemy.hp = 40;
    // Ход 1: ритуала нет; ход 2: нет; ход 3: +10 HP
    e.beginEnemyTurn(); e.finishEnemyTurn();
    e.beginEnemyTurn(); e.finishEnemyTurn();
    expect(e.enemy.hp).toBe(40);
    e.beginEnemyTurn(); // turn=3 → ритуал
    expect(e.enemy.hp).toBe(50);
    e.finishEnemyTurn();
  });

  it('Несокрушимость спасает раз в бой, второй удар смертелен', () => {
    const e = makeEngine(
      ['guard', 'guard', 'guard', 'guard', 'guard'],
      { surviveLethalOnce: true },
      { ...dummyEnemy, deck: ['enemy_crush'] }, // 12 урона
    );
    e.start();
    e.player.hp = 5;
    let steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    expect(e.player.hp).toBe(1); // спасение сработало

    e.finishEnemyTurn(); // новый ход игрока
    steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    expect(e.player.hp).toBe(0);
    expect(e.phase).toBe('defeat'); // второе спасение недоступно
  });

  it('фаза босса с призывом спавнит существ (Привратник-Тень)', () => {
    const shadowBoss: EnemyDefinition = {
      ...dummyEnemy,
      id: 'shadow_boss',
      name: 'Тень-тест',
      maxHp: 100,
      deck: ['enemy_slash', 'enemy_guard', 'enemy_guard'],
      boss: {
        phases: [
          { name: 'Фаза 1', hpThresholdPct: 100 },
          {
            name: 'Тени',
            hpThresholdPct: 40,
            summon: { defId: 'shadow_minion', name: 'Тень', hp: 15, count: 2, deck: ['shadow_hit'] },
          },
        ],
      },
    };
    const e = makeEngine(['strike', 'strike', 'guard', 'guard', 'guard'], {}, shadowBoss);
    e.start();
    expect(e.enemySlots).toHaveLength(1);
    e.enemy.hp = 39; // ниже порога 40%
    playByDefId(e, 'strike'); // урон → фаза 2 → призыв 2 теней
    expect(e.enemySlots).toHaveLength(3);
    for (const s of e.enemySlots.slice(1)) {
      expect(s.unit.hp).toBe(15);
      expect(s.unit.maxHp).toBe(15);
    }
    // Победа требует смерти и теней
    e.enemySlots[0]!.unit.hp = 5;
    playByDefId(e, 'strike');
    expect(e.phase).toBe('player'); // тени живы — бой продолжается
    for (const s of e.enemySlots.slice(1)) s.unit.hp = 0;
    e.enemySlots[0]!.unit.hp = 0;
    e.endPlayerTurn(); // любое действие провоцирует checkDeath
    expect(e.phase).toBe('victory');
  });

  it('Король костей не зацикливается: каждый ход играет карты (регрессия deadlock)', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard'], {}, ENEMIES['bone_king']!);
    e.start();
    const playedPerTurn: number[] = [];
    for (let t = 0; t < 10; t++) {
      if (e.phase !== 'player') break;
      e.energy = 0;
      e.endPlayerTurn();
      const steps = e.beginEnemyTurn();
      const plays = steps.filter((s) => s.kind === 'playCard').length;
      playedPerTurn.push(plays);
      for (const s of steps) e.executeEnemyStep(s);
      if ((e.phase as string) === 'enemy') e.finishEnemyTurn();
    }
    // aggressive ИИ обязан каждый ход играть хотя бы одну карту
    // (раньше рука из ossuary/decree без атак вечно пропускала ходы)
    for (const p of playedPerTurn) expect(p).toBeGreaterThan(0);
    expect(playedPerTurn.length).toBeGreaterThanOrEqual(5); // до смерти guard-игрока
  });

  it('endPlayerTurn НЕ строит план врага (единственный вызов — beginEnemyTurn)', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    e.energy = 0;
    e.endPlayerTurn();
    expect(e.phase).toBe('enemy');
    expect(e.turn).toBe(0); // инкремент только в beginEnemyTurn — без дублей
    const steps = e.beginEnemyTurn();
    expect(e.turn).toBe(1);
    expect(steps.length).toBeGreaterThan(0);
  });

  it('механика пощады: ниже порога враг не атакует, spareEnemy завершает «spared»', () => {
    const mercyEnemy: EnemyDefinition = {
      ...dummyEnemy,
      id: 'mercy_test',
      name: 'Тень-пощада',
      maxHp: 50,
      mercy: { hpPct: 20 },
    };
    const e = makeEngine(['strike', 'strike', 'guard', 'guard', 'guard'], {}, mercyEnemy);
    e.start();
    // выше порога — обычный бой, пощада недоступна
    expect(e.mercyAvailable()).toBe(false);
    expect(e.spareEnemy()).toBe(false);

    // ниже 20% (9/50 = 18%): склонилась
    e.enemy.hp = 9;
    expect(e.mercyAvailable()).toBe(true);
    // ИИ больше не атакует: план врага пуст (только pass)
    const steps = e.beginEnemyTurn();
    expect(steps.every((s) => s.kind === 'pass')).toBe(true);
    e.finishEnemyTurn();

    // пощада завершает бой особым исходом
    expect(e.spareEnemy()).toBe(true);
    expect(e.phase).toBe('spared');
    expect(e.enemySlots[0]!.spared).toBe(true);
  });

  it('милосердие: добивание склонившегося — обычная победа', () => {
    const mercyEnemy: EnemyDefinition = {
      ...dummyEnemy,
      id: 'mercy_test2',
      maxHp: 50,
      mercy: { hpPct: 20 },
    };
    const e = makeEngine(['strike', 'strike', 'guard', 'guard', 'guard'], {}, mercyEnemy);
    e.start();
    e.enemy.hp = 6; // ниже порога, но добиваем
    playByDefId(e, 'strike');
    expect(e.phase).toBe('victory');
    expect(e.enemySlots[0]!.spared).toBeUndefined();
  });

  it('смерть врага завершает бой победой', () => {
    const e = makeEngine(['strike', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    e.enemy.hp = 6;
    playByDefId(e, 'strike');
    expect(e.phase).toBe('victory');
    expect(e.enemy.hp).toBe(0);
  });

  it('цикл колоды: сброс руки, рефилл из сброса при пустой колоде', () => {
    const e = makeEngine(['strike', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    expect(e.hand.length).toBe(5);
    expect(e.drawPile.length).toBe(0);
    e.endPlayerTurn(); // рука → сброс (5), finish не звали — добор на новом ходе
    expect(e.hand.length).toBe(0);
    expect(e.discardPile.length).toBe(5);
    e.finishEnemyTurn(); // beginPlayerTurn: рефилл из сброса
    expect(e.hand.length).toBe(5);
    expect(e.drawPile.length).toBe(0);
    expect(e.discardPile.length).toBe(0);
  });

  it('блок игрока сбрасывается в начале его хода', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    playByDefId(e, 'guard');
    expect(e.player.block).toBe(5);
    e.endPlayerTurn();
    e.finishEnemyTurn(); // новый ход игрока: block = 0
    expect(e.player.block).toBe(0);
  });

  it('энергия и добор учитывают бонусы навыков', () => {
    const e = makeEngine(
      ['strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'guard'],
      { energyPerTurnBonus: 1, cardsPerTurnBonus: 1 },
    );
    e.start();
    expect(e.energy).toBe(4);
    expect(e.hand.length).toBe(6);
  });
});
