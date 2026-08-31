/**
 * Дерево навыков Алтаря душ: 5 ветвей × 10 уровней.
 * Узел 5 — «специальный навык», узел 10 — «ультимативный».
 *
 * Эффекты узлов — декларативные Partial<CombatStats>; агрегация чистой
 * функцией computeCombatStats(). Новая ветка = новый объект в BRANCHES.
 */
import type { BranchId, CombatStats } from '@/types';

export interface SkillNode {
  /** Уровень узла в ветви (1..10) */
  level: number;
  name: string;
  desc: string;
  /** Стоимость в душах */
  cost: number;
  kind: 'normal' | 'special' | 'ultimate';
  effects: Partial<CombatStats>;
}

export interface SkillBranch {
  id: BranchId;
  name: string;
  icon: string;
  color: string;
  /** nodes[level-1] — узел уровня level */
  nodes: SkillNode[];
}

/** Стоимость узла уровня L: 50 при L=1 … 230 при L=10 (вся ветвь ≈ 1400 душ). */
const nodeCost = (level: number): number => 30 + 20 * level;

const node = (
  level: number,
  name: string,
  desc: string,
  effects: Partial<CombatStats>,
  kind: SkillNode['kind'] = 'normal',
): SkillNode => ({ level, name, desc, cost: nodeCost(level), kind, effects });

export const BRANCHES: SkillBranch[] = [
  {
    id: 'strength',
    name: 'Сила',
    icon: '⚔',
    color: '#c46a5a',
    nodes: [
      node(1, 'Мышцы памяти', '+1 урон ко всем атакам', { bonusDamage: 1 }),
      node(2, 'Тяжёлая длань', '+1 урон ко всем атакам', { bonusDamage: 1 }),
      node(3, 'Пробой брони', '+1 урон ко всем атакам', { bonusDamage: 1 }),
      node(4, 'Жестокость', '+1 урон ко всем атакам', { bonusDamage: 1 }),
      node(5, 'Сокрушающий удар', 'Спецнавык: +2 урона ко всем атакам', { bonusDamage: 2 }, 'special'),
      node(6, 'Ярость глубин', '+1 урон', { bonusDamage: 1 }),
      node(7, 'Древняя мощь', '+1 урон', { bonusDamage: 1 }),
      node(8, 'Кровь титанов', '+1 урон', { bonusDamage: 1 }),
      node(9, 'Разлом', '+1 урон', { bonusDamage: 1 }),
      node(10, 'Гнев титана', 'УЛЬТА: урон +25%', { damageMultBonus: 0.25 }, 'ultimate'),
    ],
  },
  {
    id: 'dexterity',
    name: 'Ловкость',
    icon: '🗡',
    color: '#5abfa0',
    nodes: [
      node(1, 'Цепкий взгляд', '+1 блок к картам защиты', { bonusBlock: 1 }),
      node(2, 'Лёгкая поступь', '+1 блок', { bonusBlock: 1 }),
      node(3, 'Верное плечо', '+1 блок', { bonusBlock: 1 }),
      node(4, 'Каменная стойка', '+1 блок', { bonusBlock: 1 }),
      node(5, 'Быстрые руки', 'Спецнавык: +1 карта при доборе', { cardsPerTurnBonus: 1 }, 'special'),
      node(6, 'Сковородник', '+1 блок', { bonusBlock: 1 }),
      node(7, 'Тень клинка', '+1 блок', { bonusBlock: 1 }),
      node(8, 'Вихрь', '+1 блок', { bonusBlock: 1 }),
      node(9, 'Идеальный баланс', '+1 блок', { bonusBlock: 1 }),
      node(10, 'Танец клинков', 'УЛЬТА: +1 энергия каждый ход', { energyPerTurnBonus: 1 }, 'ultimate'),
    ],
  },
  {
    id: 'intellect',
    name: 'Интеллект',
    icon: '📖',
    color: '#7d9fd8',
    nodes: [
      node(1, 'Память павшего', '+10% к лечению', { healMultBonus: 0.1 }),
      node(2, 'Знание трав', '+10% к лечению', { healMultBonus: 0.1 }),
      node(3, 'Чтение костей', '+10% к лечению', { healMultBonus: 0.1 }),
      node(4, 'Секрет эстуса', '+10% к лечению', { healMultBonus: 0.1 }),
      node(5, 'Знаток ядов', 'Спецнавык: +1 стэк к налагаемым состояниям', { stateStacksBonus: 1 }, 'special'),
      node(6, 'Алхимия тьмы', '+10% к лечению', { healMultBonus: 0.1 }),
      node(7, 'Печати', '+10% к лечению', { healMultBonus: 0.1 }),
      node(8, 'Ритуалы', '+10% к лечению', { healMultBonus: 0.1 }),
      node(9, 'Гримуар', '+10% к лечению', { healMultBonus: 0.1 }),
      node(10, 'Архивариус душ', 'УЛЬТА: ещё +2 стэка к состояниям', { stateStacksBonus: 2 }, 'ultimate'),
    ],
  },
  {
    id: 'endurance',
    name: 'Выносливость',
    icon: '🛡',
    color: '#d8b96a',
    nodes: [
      node(1, 'Толстая кожа', '+4 макс. HP', { maxHpBonus: 4 }),
      node(2, 'Ветеран', '+4 макс. HP', { maxHpBonus: 4 }),
      node(3, 'Шрамы', '+4 макс. HP', { maxHpBonus: 4 }),
      node(4, 'Вторая кожа', '+4 макс. HP', { maxHpBonus: 4 }),
      node(5, 'Закалка', 'Спецнавык: 6 блока в начале каждого боя', { startBlock: 6 }, 'special'),
      node(6, 'Каменное сердце', '+5 макс. HP', { maxHpBonus: 5 }),
      node(7, 'Носильщик', '+5 макс. HP', { maxHpBonus: 5 }),
      node(8, 'Мученик', '+5 макс. HP', { maxHpBonus: 5 }),
      node(9, 'Испытавший смерть', '+5 макс. HP', { maxHpBonus: 5 }),
      node(10, 'Несокрушимость', 'УЛЬТА: раз в бой выживаете при смертельном ударе (1 HP)', { surviveLethalOnce: true }, 'ultimate'),
    ],
  },
  {
    id: 'spirit',
    name: 'Дух',
    icon: '🕯',
    color: '#b98ad8',
    nodes: [
      node(1, 'Тихий голос', '+10% получаемых душ', { soulsBonusPct: 10 }),
      node(2, 'Отблеск', '+10% душ', { soulsBonusPct: 10 }),
      node(3, 'Память света', '+10% душ', { soulsBonusPct: 10 }),
      node(4, 'Обет', '+10% душ', { soulsBonusPct: 10 }),
      node(5, 'Молитва павшего', 'Спецнавык: Благословение 3 на старте боя', { blessingOnStart: 3 }, 'special'),
      node(6, 'Тлеющий фитиль', '+1 HP в конце каждого хода', { healPerTurn: 1 }),
      node(7, 'Внутренний огонь', '+1 HP/ход', { healPerTurn: 1 }),
      node(8, 'Дыхание храма', '+1 HP/ход', { healPerTurn: 1 }),
      node(9, 'Свет изнутри', '+1 HP/ход', { healPerTurn: 1 }),
      node(10, 'Второе дыхание', 'УЛЬТА: ещё +5 HP в конце каждого хода', { healPerTurn: 5 }, 'ultimate'),
    ],
  },
];

export const DEFAULT_COMBAT_STATS: CombatStats = {
  bonusDamage: 0,
  bonusBlock: 0,
  maxHpBonus: 0,
  energyPerTurnBonus: 0,
  cardsPerTurnBonus: 0,
  startBlock: 0,
  damageMultBonus: 0,
  healMultBonus: 0,
  stateStacksBonus: 0,
  healPerTurn: 0,
  blessingOnStart: 0,
  surviveLethalOnce: false,
  soulsBonusPct: 0,
};

/** Числовые ключи статов (для аддитивного сложения эффектов узлов). */
type NumericKey = {
  [K in keyof CombatStats]: CombatStats[K] extends number ? K : never;
}[keyof CombatStats];

/** Собрать агрегированные статы из прокачанных уровней ветвей. */
export function computeCombatStats(skills: Record<BranchId, number>): CombatStats {
  const result: CombatStats = { ...DEFAULT_COMBAT_STATS };
  for (const branch of BRANCHES) {
    const level = skills[branch.id] ?? 0;
    for (let i = 0; i < level; i++) {
      const n = branch.nodes[i];
      if (!n) continue;
      for (const [key, value] of Object.entries(n.effects) as [keyof CombatStats, unknown][]) {
        if (typeof value === 'number') {
          result[key as NumericKey] += value;
        } else if (typeof value === 'boolean') {
          result[key] = value as never;
        }
      }
    }
  }
  return result;
}

/** Следующий узел ветви, доступный к изучению (null — ветвь окончена). */
export function nextNode(branchId: BranchId, currentLevel: number): SkillNode | null {
  const branch = BRANCHES.find((b) => b.id === branchId);
  if (!branch) return null;
  return branch.nodes[currentLevel] ?? null;
}
