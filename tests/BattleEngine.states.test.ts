/**
 * Тесты системы состояний: тики DoT/HoT, стаки, merge-правила,
 * взаимодействие с атаками (кровотечение), длительности.
 */
import { describe, it, expect } from 'vitest';
import { makeEngine, playByDefId } from './fixtures';

describe('BattleEngine: состояния', () => {
  it('Горение: урон = стаки в конце хода носителя, стаки не тикают', () => {
    const e = makeEngine(['fireball', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    playByDefId(e, 'fireball'); // 4 урона + burn 3/3
    expect(e.enemy.hp).toBe(96);
    e.endPlayerTurn();          // тик горения врага НЕ здесь — это ход ИГРОКА закончился
    // Тик состояний ВОЛДЕТЕЛЯ: burn висит на враге → тикнёт в конец хода ВРАГА.
    // endPlayerTurn вызвал beginEnemyTurn; состояния врага тикают в finishEnemyTurn.
    const burn = e.enemy.states.find((s) => s.type === 'burn');
    expect(burn?.stacks).toBe(3);
    e.finishEnemyTurn(); // здесь тик burn: 3 урона врагу
    expect(e.enemy.hp).toBe(96 - 3);
  });

  it('Отравление: урон = стаки, затем стаки-1 (накапливается)', () => {
    const e = makeEngine(['poison_blade', 'poison_blade', 'guard', 'guard', 'guard']);
    e.start();
    playByDefId(e, 'poison_blade'); // 3 урона + poison 3
    playByDefId(e, 'poison_blade'); // 3 урона + poison 3 → merge: 6 стэков
    expect(e.enemy.states.find((s) => s.type === 'poison')?.stacks).toBe(6);
    expect(e.enemy.hp).toBe(100 - 3 - 3); // только урон карт, тика ещё не было
    e.endPlayerTurn();
    e.finishEnemyTurn(); // тик: 6 урона, стаки 5
    expect(e.enemy.hp).toBe(100 - 3 - 3 - 6);
    expect(e.enemy.states.find((s) => s.type === 'poison')?.stacks).toBe(5);
  });

  it('Кровотечение: враг теряет HP при каждой СВОЕЙ атаке', () => {
    const e = makeEngine(['rend', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    playByDefId(e, 'rend'); // 3 урона + bleed 3 на врага
    expect(e.enemy.hp).toBe(97);
    // Ход врага напрямую: slash 7 по игроку, и bleed бьёт врага на 3
    const steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    expect(e.enemy.hp).toBe(97 - 3);
    expect(e.player.hp).toBe(70 - 7);
  });

  it('Благословение: лечение в конце хода, стаки убывают', () => {
    const e = makeEngine(['prayer', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    e.player.hp = 40;
    playByDefId(e, 'prayer'); // blessing 4
    e.endPlayerTurn();        // тик: +4 HP, стаки 3
    expect(e.player.hp).toBe(44);
    expect(e.player.states.find((s) => s.type === 'blessing')?.stacks).toBe(3);
  });

  it('бонус стэков Интеллекта усиливает накладываемые состояния', () => {
    const e = makeEngine(['fireball', 'guard', 'guard', 'guard', 'guard'], {
      stateStacksBonus: 3, // Знаток ядов + Архивариус
    });
    e.start();
    playByDefId(e, 'fireball'); // burn 3 + 3 = 6
    expect(e.enemy.states.find((s) => s.type === 'burn')?.stacks).toBe(6);
  });

  it('благословение на старте боя (Молитва павшего)', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard'], { blessingOnStart: 3 });
    e.start();
    expect(e.player.states.find((s) => s.type === 'blessing')?.stacks).toBe(3);
  });

  it('регенерация Духа лечит в конце каждого хода игрока', () => {
    const e = makeEngine(['guard', 'guard', 'guard', 'guard', 'guard'], { healPerTurn: 5 });
    e.start();
    e.player.hp = 50;
    e.endPlayerTurn();
    expect(e.player.hp).toBe(55);
  });

  it('длительность состояний убывает, состояние снимается по истечении', () => {
    const e = makeEngine(['fireball', 'guard', 'guard', 'guard', 'guard']);
    e.start();
    playByDefId(e, 'fireball'); // burn 3/3
    // Три полных круга: ход игрока → ход врага (тик + duration--)
    for (let i = 0; i < 3; i++) {
      e.endPlayerTurn();
      e.finishEnemyTurn();
    }
    expect(e.enemy.states.find((s) => s.type === 'burn')).toBeUndefined();
  });
});
