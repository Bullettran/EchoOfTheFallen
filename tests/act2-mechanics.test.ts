/**
 * Тесты механик Акта 2: AoE, резисты, пробитие/снятие блока, cleanse,
 * печать лечения, сжигание руки, бонус смерти союзникам.
 */
import { describe, it, expect } from 'vitest';
import { makeEngine, playByDefId, dummyEnemy } from './fixtures';
import { CARDS } from '@/data/cards';
import type { EnemyDefinition } from '@/types';

describe('Акт 2: механики', () => {
  it('AoE бьёт всех живых врагов', () => {
    const trio: EnemyDefinition[] = [0, 1, 2].map((i) => ({
      ...dummyEnemy,
      id: `sh${i}`,
      deck: ['enemy_slash', 'enemy_guard', 'enemy_slash'],
    }));
    const e = makeEngine(['strike', 'guard', 'guard', 'guard', 'guard'], {}, trio);
    e.start();
    expect(e.aliveSlots).toHaveLength(3);
    playByDefId(e, 'strike'); // одиночный удар — только первый
    expect(e.enemySlots[0]!.unit.hp).toBe(100 - 6);
    expect(e.enemySlots[1]!.unit.hp).toBe(100);

    // AoE-карта: временно кладём в руку (в данных её добавит Акт 2)
    e.hand.push({ uid: 'aoe1', defId: 'ash_wave_test', upgradeLevel: 0 });
    (CARDS as Record<string, unknown>)['ash_wave_test'] = {
      id: 'ash_wave_test', name: 'Волна пепла', type: 'attack', cost: 2,
      rarity: 'common', tags: ['physical'], description: '2 урона всем.',
      action: { damage: 2, aoe: true },
    };
    expect(e.playCard('aoe1')).toBe(true);
    expect(e.enemySlots[0]!.unit.hp).toBe(100 - 6 - 2);
    expect(e.enemySlots[1]!.unit.hp).toBe(100 - 2);
    expect(e.enemySlots[2]!.unit.hp).toBe(100 - 2);
    delete (CARDS as Record<string, unknown>)['ash_wave_test'];
  });

  it('резисты: огненный голем почти не горит', () => {
    const golem: EnemyDefinition = {
      ...dummyEnemy,
      id: 'fire_res',
      resistances: { fire: 0.25 },
    };
    const e = makeEngine(['fireball', 'guard', 'guard', 'guard', 'guard'], {}, golem);
    e.start();
    playByDefId(e, 'fireball'); // 4 урона fire × 0.25 = 1
    expect(e.enemy.hp).toBe(100 - 1);
    // физический урон — без резиста
    e.hand.push({ uid: 'x', defId: 'strike', upgradeLevel: 0 });
    e.playCard('x');
    expect(e.enemy.hp).toBe(100 - 1 - 6);
  });

  it('stripBlock снимает блок до удара, pierce игнорирует его', () => {
    const e = makeEngine(['strike', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    e.enemy.block = 10;
    playByDefId(e, 'strike'); // 6 урона: 6 в блок
    expect(e.enemy.block).toBe(4);

    e.enemy.block = 10;
    e.hand.push({ uid: 'p1', defId: 'pierce_test', upgradeLevel: 0 });
    (CARDS as Record<string, unknown>)['pierce_test'] = {
      id: 'pierce_test', name: 'Копьё', type: 'attack', cost: 1,
      rarity: 'common', tags: ['physical'], description: '4 урона, игнор 5 блока',
      action: { damage: 4, pierceBlock: 5 },
    };
    e.energy = 3;
    e.playCard('p1'); // блок 10, pierce 5 → эффективный блок 5: 4 урона в блок
    expect(e.enemy.block).toBe(6);
    delete (CARDS as Record<string, unknown>)['pierce_test'];
  });

  it('cleanse: «Свеча памяти» снимает 1 отрицательное состояние с себя', () => {
    const e = makeEngine(['strike', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    // враг накладывает уязвимость напрямую (шаг с enemy_hex)
    e.executeEnemyStep({
      kind: 'playCard',
      enemyIndex: 0,
      card: { uid: 'hx', defId: 'enemy_hex', upgradeLevel: 0 },
    });
    expect(e.player.states.some((s) => s.type === 'vulnerable')).toBe(true);

    e.hand.push({ uid: 'c1', defId: 'candle_test', upgradeLevel: 0 });
    (CARDS as Record<string, unknown>)['candle_test'] = {
      id: 'candle_test', name: 'Свеча памяти', type: 'skill', cost: 1,
      rarity: 'uncommon', tags: ['holy'], description: 'Снять 1 негатив.',
      action: { cleanse: { target: 'self', positive: false, count: 1 } },
    };
    e.energy = 3;
    e.playCard('c1');
    expect(e.player.states.some((s) => s.type === 'vulnerable')).toBe(false);
    delete (CARDS as Record<string, unknown>)['candle_test'];
  });

  it('печать лечения блокирует heal на ход', () => {
    const e = makeEngine(['flask', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    e.player.hp = 40;
    // враг кладёт печать напрямую через карту-заглушку
    e.hand.push({ uid: 'b1', defId: 'curse_test', upgradeLevel: 0 });
    (CARDS as Record<string, unknown>)['curse_test'] = {
      id: 'curse_test', name: 'Проклятие', type: 'state', cost: 1,
      rarity: 'rare', tags: ['dark'], description: 'Печать лечения 1.',
      action: { applyState: { type: 'heal_ban', stacks: 1, duration: 1, target: 'self' } },
    };
    e.energy = 5;
    e.playCard('b1');
    expect(e.player.states.some((s) => s.type === 'heal_ban')).toBe(true);
    e.player.hp = 30;
    e.energy = 5;
    e.hand.push({ uid: 'f2', defId: 'flask', upgradeLevel: 0 });
    e.playCard('f2'); // flask под печатью не лечит
    expect(e.player.hp).toBe(30);
    delete (CARDS as Record<string, unknown>)['curse_test'];
  });

  it('сжигание карты в руке врагом (discardHand)', () => {
    (CARDS as Record<string, unknown>)['burn_hand_test'] = {
      id: 'burn_hand_test', name: 'Испепелить', type: 'skill', cost: 1,
      rarity: 'rare', tags: ['fire'], description: 'Сжечь 1 карту в руке.',
      action: { discardHand: 1 },
    };
    const e = makeEngine(['strike', 'strike', 'guard', 'guard', 'guard']);
    e.start();
    const before = e.hand.length;
    e.executeEnemyStep({
      kind: 'playCard',
      enemyIndex: 0,
      card: { uid: 'bh', defId: 'burn_hand_test', upgradeLevel: 0 },
    });
    expect(e.hand.length).toBe(before - 1);
    expect(e.discardPile.length).toBe(1);
    delete (CARDS as Record<string, unknown>)['burn_hand_test'];
  });

  it('смерть врага усиливает выживших (+1 урон) — «Осада теней»', () => {
    const trio: EnemyDefinition[] = [0, 1, 2].map((i) => ({
      ...dummyEnemy,
      id: `sd${i}`,
      allyDeathBonus: 1,
    }));
    const e = makeEngine(['strike', 'strike', 'guard', 'guard', 'guard'], {}, trio);
    e.start();
    e.enemySlots[0]!.unit.hp = 5;
    playByDefId(e, 'strike'); // убил первого
    expect(e.enemySlots[1]!.dmgBonus).toBe(1);
    expect(e.enemySlots[2]!.dmgBonus).toBe(1);
    // выжившие бьют сильнее
    const hp = e.player.hp;
    const steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    expect(e.player.hp).toBeLessThan(hp);
  });
});
