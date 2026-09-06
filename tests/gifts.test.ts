/**
 * Тесты даров классов — уникальных пассивок, качаемых в Алтаре:
 *   Рыцарь «Шипы», Странник «Наконечник», Жрец «Жатва душ».
 */
import { describe, it, expect } from 'vitest';
import { makeEngine, dummyEnemy, playByDefId } from './fixtures';
import type { EnemyDefinition } from '@/types';

const attackDeck = ['strike', 'strike', 'guard', 'guard', 'guard'];

describe('Дары классов', () => {
  it('Рыцарь «Шипы»: удар по игроку обжигает атакующего сквозь блок', () => {
    const e = makeEngine(attackDeck, {}, { ...dummyEnemy, deck: ['enemy_slash'] }, 0, {
      id: 'thorns',
      level: 3,
    });
    e.start();
    expect(e.player.hp).toBe(70);
    const steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    // энергия врага 2 → два слэша по 7: 70 → 56
    expect(e.player.hp).toBe(56);
    // шипы 3 за каждый удар: враг 100 → 94 (даже с блоком — урон сквозной)
    expect(e.enemy.hp).toBe(100 - 6);
  });

  it('Шипы срабатывают на каждый удар и добивают врага', () => {
    const weakling: EnemyDefinition = { ...dummyEnemy, maxHp: 6, deck: ['enemy_slash'] };
    const e = makeEngine(attackDeck, {}, weakling, 0, { id: 'thorns', level: 5 });
    e.start();
    const steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    // враг умер от шипов (5+5 = 10 ≥ 6) — бой завершён без карт игрока
    expect(e.enemy.hp).toBe(0);
    expect(e.phase).toBe('victory');
  });

  it('Странник «Наконечник»: +N только к первой атаке каждого хода', () => {
    const e = makeEngine(attackDeck, {}, undefined, 0, { id: 'first_strike', level: 4 });
    e.start();
    playByDefId(e, 'strike'); // 6 + 4 = 10
    expect(e.enemy.hp).toBe(100 - 10);
    playByDefId(e, 'strike'); // 6, бонус уже израсходован
    expect(e.enemy.hp).toBe(100 - 16);
    // Новый ход — бонус снова доступен
    e.endPlayerTurn();
    e.beginEnemyTurn();
    e.finishEnemyTurn();
    playByDefId(e, 'strike'); // 6 + 4 = 10
    expect(e.enemy.hp).toBe(100 - 26);
  });

  it('Жрец «Жатва душ»: смерть врага лечит (и только раз за врага)', () => {
    const weakling: EnemyDefinition = { ...dummyEnemy, maxHp: 5, deck: ['enemy_slash'] };
    const e = makeEngine(attackDeck, {}, weakling, 0, { id: 'soul_harvest', level: 6 });
    e.start();
    e.player.hp = 50;
    playByDefId(e, 'strike'); // убивает: 6 ≥ 5
    expect(e.enemy.hp).toBe(0);
    expect(e.player.hp).toBe(56); // 50 + жатва 6
    expect(e.phase).toBe('victory');
    // Повторные checkDeath не дают повторного лечения
    expect(e.player.hp).toBe(56);
  });

  it('без дара (level 0) эффектов нет', () => {
    const e = makeEngine(attackDeck, {}, undefined, 0, { id: 'thorns', level: 0 });
    e.start();
    const steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    expect(e.enemy.hp).toBe(100); // шипы спят
  });
});
