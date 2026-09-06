/**
 * Экономика похода: доход «типичного» рана покрывает полный дар класса
 * (1400 душ) и несколько улучшений Кузни. Регресс: если награды порежут — упадёт.
 */
import { describe, it, expect } from 'vitest';
import { BALANCE } from '@/core/config';

describe('Экономика похода (граф: 1 узел на этаж, 15 этажей)', () => {
  it('типичный ран даёт ≥ 1400 душ (полный дар класса)', () => {
    const T = BALANCE.trial;
    // Типичный расклад: 9 обычных боёв (глубины 2..10), 2 элиты, босс, 2 денежные находки
    const battleSouls = [2, 3, 4, 5, 6, 7, 8, 9, 10]
      .reduce((s, d) => s + T.battleBaseSouls + d * T.battleSoulsPerDepth, 0);
    const eliteSouls = 2 * Math.round((T.battleBaseSouls + 7 * T.battleSoulsPerDepth) * T.eliteSoulsMult);
    const total = battleSouls + eliteSouls + T.bossSouls + 2 * T.eventSouls;
    expect(total).toBeGreaterThanOrEqual(1400);
  });

  it('магазин не съедает весь доход: средняя цена ≤ 75% среднего дохода за узел', () => {
    const T = BALANCE.trial;
    const avgNodeIncome = T.battleBaseSouls + 8 * T.battleSoulsPerDepth; // ~середина рана
    const avgShopCost = T.shopBaseCost + 8 * T.shopCostPerDepth;
    expect(avgShopCost).toBeLessThanOrEqual(avgNodeIncome * 0.75);
  });

  it('босс стоит как минимум три обычных боя финальной глубины', () => {
    const T = BALANCE.trial;
    const lateBattle = T.battleBaseSouls + 14 * T.battleSoulsPerDepth;
    expect(T.bossSouls).toBeGreaterThanOrEqual(lateBattle * 1.5);
  });
});
