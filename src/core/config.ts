/**
 * Единая точка баланса прототипа. Все «магические числа» боя — здесь,
 * чтобы крутить баланс, не трогая логику.
 */
export const BALANCE = {
  player: {
    /** Стартовое HP павшего воина */
    maxHp: 70,
    /** Энергии за ход */
    energyPerTurn: 3,
    /** Карт в руке в начале хода */
    cardsPerTurn: 5,
    /** Стартовая колода прототипа: defId -> количество копий */
    startingDeck: [
      'strike', 'strike', 'strike',
      'guard', 'guard',
      'heavy_blow', 'fireball', 'poison_blade',
      'flask', 'rend',
    ] as string[],
  },
  combat: {
    /** Множитель урона при Ярости атакующего */
    furyDamageMult: 1.5,
    /** Множитель блока при Ярости */
    furyBlockMult: 0.5,
    /** Множитель получаемого урона при Уязвимости */
    vulnerableDamageMult: 1.5,
  },
  /** Экономика и правила хаба */
  hub: {
    /** Минимальный размер боевой колоды (цель по ТЗ — 15, поднят когда карт станет больше) */
    minDeck: 10,
    maxDeck: 30,
    /** Кузница: стоимость уровня улучшения = base * (текущий уровень + 1) */
    upgradeBaseCost: 100,
    /** Мастерская: стоимость создания карты */
    craftSoulCost: 150,
    craftEssenceCost: 1,
  },
  /** Прогрессия глубины похода */
  progression: {
    /** +12% HP врага за глубину свыше первой */
    hpGrowthPerDepth: 0.12,
    /** +25% душ за глубину */
    soulsGrowthPerDepth: 0.25,
    /** +4% шанса эссенции за глубину (потолок 60%) */
    essenceGrowthPerDepth: 0.04,
    /** Плоский +1 урон врагу за каждые 2 глубины */
    dmgBonusPerDepth: 0.5,
    /** Глубина, кратная этому числу, — боссовый выбор */
    bossEveryDepth: 5,
  },
} as const;
