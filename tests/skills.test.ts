/**
 * Тесты агрегатора дерева навыков: сложение эффектов узлов,
 * спецнавыки (5) и ульты (10).
 */
import { describe, it, expect } from 'vitest';
import { computeCombatStats, nextNode } from '@/data/skills';
import { DEFAULT_COMBAT_STATS } from '@/data/skills';

describe('computeCombatStats', () => {
  it('пустое дерево даёт дефолтные статы', () => {
    const s = computeCombatStats({ strength: 0, dexterity: 0, intellect: 0, endurance: 0, spirit: 0 });
    expect(s).toEqual(DEFAULT_COMBAT_STATS);
  });

  it('Сила 5: 4×+1 и спецнавык +2 = +6 урона', () => {
    const s = computeCombatStats({ strength: 5, dexterity: 0, intellect: 0, endurance: 0, spirit: 0 });
    expect(s.bonusDamage).toBe(6);
    expect(s.damageMultBonus).toBe(0); // ульта не взята
  });

  it('Сила 10: ульта Гнев титана +25% урона', () => {
    const s = computeCombatStats({ strength: 10, dexterity: 0, intellect: 0, endurance: 0, spirit: 0 });
    expect(s.bonusDamage).toBe(10); // 9 узлов +1/+2 и... проверим фактическую сумму
    expect(s.damageMultBonus).toBe(0.25);
  });

  it('Выносливость 10: 36 HP + Закалка + Несокрушимость', () => {
    const s = computeCombatStats({ strength: 0, dexterity: 0, intellect: 0, endurance: 10, spirit: 0 });
    expect(s.maxHpBonus).toBe(4 * 4 + 5 * 4);
    expect(s.startBlock).toBe(6);
    expect(s.surviveLethalOnce).toBe(true);
  });

  it('Дух 10: +40% душ, Благословение на старте, регенерация 9', () => {
    const s = computeCombatStats({ strength: 0, dexterity: 0, intellect: 0, endurance: 0, spirit: 10 });
    expect(s.soulsBonusPct).toBe(40);
    expect(s.blessingOnStart).toBe(3);
    expect(s.healPerTurn).toBe(9);
  });

  it('Ловкость 10: энергия +1 (Танец клинков), карта +1, блок +8', () => {
    const s = computeCombatStats({ strength: 0, dexterity: 10, intellect: 0, endurance: 0, spirit: 0 });
    expect(s.energyPerTurnBonus).toBe(1);
    expect(s.cardsPerTurnBonus).toBe(1);
    expect(s.bonusBlock).toBe(8);
  });

  it('nextNode: null на максимальном уровне', () => {
    expect(nextNode('strength', 10)).toBeNull();
    expect(nextNode('strength', 0)?.level).toBe(1);
    expect(nextNode('strength', 4)?.kind).toBe('special'); // узел 5
  });
});
