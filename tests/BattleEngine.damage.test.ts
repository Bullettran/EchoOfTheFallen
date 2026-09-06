/**
 * Тесты модификаторов урона/блока/лечения BattleEngine.
 * Порядок применения: (base + bonusDamage) * damageMult * fury * vulnerable.
 */
import { describe, it, expect } from 'vitest';
import { makeEngine, playByDefId, dummyEnemy } from './fixtures';
import { createCard } from '@/game/CardFactory';
import { buildPlanIntent } from '@/game/EnemyAI';
import type { EnemyDefinition } from '@/types';

describe('BattleEngine: урон и модификаторы', () => {
  it('базовая атака наносит урон без модификаторов', () => {
    const e = makeEngine(['strike', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    expect(playByDefId(e, 'strike')).toBe(true);
    expect(e.enemy.hp).toBe(100 - 6);
  });

  it('карта не играется без энергии', () => {
    // Колода только из дорогих карт: рука 5×heavy_blow (2 энергии), энергии 3 → сыграть 1, вторая не лезет? нет: 3-2=1 < 2
    const e = makeEngine(['heavy_blow', 'heavy_blow', 'heavy_blow', 'heavy_blow', 'heavy_blow']);
    e.start();
    expect(playByDefId(e, 'heavy_blow')).toBe(true);
    e.energy = 1; // принудительно мало энергии
    expect(playByDefId(e, 'heavy_blow')).toBe(false);
  });

  it('Ярость: +50% урона, -50% блока', () => {
    const e = makeEngine(['wrath', 'strike', 'guard', 'guard', 'guard']);
    e.start();
    playByDefId(e, 'wrath');   // fury 2 хода
    playByDefId(e, 'strike');  // 6 * 1.5 = 9
    expect(e.enemy.hp).toBe(100 - 9);
    playByDefId(e, 'guard');   // 5 * 0.5 = 2 (floor)
    expect(e.player.block).toBe(2);
  });

  it('Уязвимость: +50% получаемого урона, стакается с Яростью', () => {
    const e = makeEngine(['vengeful_spirit', 'wrath', 'strike', 'guard', 'guard']);
    e.start();
    playByDefId(e, 'vengeful_spirit'); // vulnerable 2 на врага + добор 1
    playByDefId(e, 'strike');          // 6 * 1.5 = 9
    expect(e.enemy.hp).toBe(100 - 9);

    playByDefId(e, 'wrath');
    playByDefId(e, 'guard'); // блок есть, чтобы energies потратить не нужно
    // следующая strike в руке после добора не гарантирована — проверяем формулу отдельно:
    // 6 * 1.5 (vuln) * 1.5 (fury) = 13.5 → 13
    const e2 = makeEngine(['vengeful_spirit', 'wrath', 'strike', 'guard', 'guard']);
    e2.start();
    playByDefId(e2, 'vengeful_spirit');
    playByDefId(e2, 'wrath');
    playByDefId(e2, 'strike');
    expect(e2.enemy.hp).toBe(100 - 13);
  });

  it('бонус Силы и множитель Гнева титана применяются к атакам игрока', () => {
    const e = makeEngine(['strike', 'guard', 'guard', 'guard', 'guard'], {
      bonusDamage: 2,
      damageMultBonus: 0.25,
    });
    e.start();
    playByDefId(e, 'strike'); // (6 + 2) * 1.25 = 10
    expect(e.enemy.hp).toBe(100 - 10);
  });

  it('блок поглощает урон, остаток идёт в HP', () => {
    const e = makeEngine(['strike', 'strike', 'guard', 'guard', 'guard']);
    e.start();
    // враг получает блок через собственную карту — эмулируем напрямую структурой:
    e.enemy.block = 4;
    playByDefId(e, 'strike'); // 6 урона: 4 в блок, 2 в HP
    expect(e.enemy.block).toBe(0);
    expect(e.enemy.hp).toBe(100 - 2);
  });

  it('бонус Ловкости увеличивает блок игрока', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard'], { bonusBlock: 2 });
    e.start();
    playByDefId(e, 'guard'); // 5 + 2 = 7
    expect(e.player.block).toBe(7);
  });

  it('множитель лечения Интеллекта усиливает Эстус', () => {
    const e = makeEngine(['flask', 'guard', 'guard', 'guard', 'guard'], { healMultBonus: 0.4 });
    e.start();
    e.player.hp = 50;
    playByDefId(e, 'flask'); // floor(7 * 1.4) = 9
    expect(e.player.hp).toBe(59);
  });

  it('урон врага получает бонус глубины', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard'], {}, undefined, 3);
    e.start();
    // Ход врага напрямую (в сторе шаги исполняются по таймеру ради анимаций)
    const steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    // enemy_slash: 7 + 3 (бонус глубины) = 10; блок игрока обнулён на его ходе
    expect(e.player.hp).toBe(70 - 10);
  });
});

describe('Намерение врага = фактический урон хода', () => {
  it('buildPlanIntent: Ярость из первой карты усиливает атаки плана (×1.5)', () => {
    // План: Право Короля (Ярость на себя) → Длань Короля (14 урона)
    const intent = buildPlanIntent([createCard('boss_decree'), createCard('boss_bone_smash')], 0);
    const attacks = intent.parts!.filter((p) => p.kind === 'attack');
    expect(attacks).toHaveLength(1);
    expect(attacks[0]!.value).toBe(Math.floor(14 * 1.5)); // 21
  });

  it('buildPlanIntent: бонус глубины + Ярость + Пробитая броня игрока', () => {
    const intent = buildPlanIntent([createCard('boss_bone_smash')], 3, {
      attackerHasFury: true,
      targetHasVulnerable: true,
    });
    // (14 + 3) × 1.5 × 1.5 = 38.25 → floor 38
    expect(intent.parts![0]!.value).toBe(38);
  });

  it('buildPlanIntent: Ярость режет блок плана пополам', () => {
    const intent = buildPlanIntent([createCard('enemy_guard')], 0, { attackerHasFury: true });
    expect(intent.parts![0]!.value).toBe(3); // floor(6 × 0.5)
  });

  it('превью намерения совпадает с фактическим уроном исполненного хода', () => {
    const foe: EnemyDefinition = {
      ...dummyEnemy,
      aiStyle: 'aggressive',
      deck: ['enemy_crush', 'enemy_slash', 'enemy_smite'],
    };
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard'], {}, foe, 3);
    e.start();
    // Превью, которое видит игрок на бейдже
    const preview = e.enemyIntents[0]!;
    expect(preview.kind).toBe('attack');

    // Фактический ход (в сторе шаги исполняются по таймеру ради анимаций)
    const steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);

    // Ожидаемый план aggressive с энергией 2: crush (12+3=15) → энергия 0.
    // Блок игрока обнулён на его ходе — урон уходит целиком в HP
    const actualLoss = 70 - e.player.hp;
    expect(actualLoss).toBe(15);
    expect(preview.value).toBe(actualLoss);
  });
});
