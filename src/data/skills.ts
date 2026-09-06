/**
 * Дерево навыков Алтаря (Последний очаг): 5 ветвей × 10 уровней.
 * Узел 5 — «спецнавык», узел 10 — «ультимативный».
 *
 * Эффекты узлов — декларативные Partial<CombatStats>; агрегация чистой
 * функцией computeCombatStats(). Новая ветка = новый объект в BRANCHES.
 * Внутренние id ветвей стабильны (сейвы).
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
    name: 'Мощь',
    icon: '⚔',
    color: '#c46a5a',
    nodes: [
      node(1, 'Тяжёлая рука', '+1 урон ко всем атакам', { bonusDamage: 1 }),
      node(2, 'Закалка клинка', '+1 урон ко всем атакам', { bonusDamage: 1 }),
      node(3, 'Пробой брони', '+1 урон ко всем атакам', { bonusDamage: 1 }),
      node(4, 'Могучий замах', '+1 урон ко всем атакам', { bonusDamage: 1 }),
      node(5, 'Сокрушение', 'Спецнавык: +2 урона ко всем атакам', { bonusDamage: 2 }, 'special'),
      node(6, 'Кулак палача', '+1 урон', { bonusDamage: 1 }),
      node(7, 'Наследие героев', '+1 урон', { bonusDamage: 1 }),
      node(8, 'Пепельная мощь', '+1 урон', { bonusDamage: 1 }),
      node(9, 'Раскол щитов', '+1 урон', { bonusDamage: 1 }),
      node(10, 'Ярость павших', 'УЛЬТА: урон +25%', { damageMultBonus: 0.25 }, 'ultimate'),
    ],
  },
  {
    id: 'dexterity',
    name: 'Ловкость',
    icon: '🪶',
    color: '#5abfa0',
    nodes: [
      node(1, 'Верная стойка', '+1 блок к картам защиты', { bonusBlock: 1 }),
      node(2, 'Твёрдый блок', '+1 блок', { bonusBlock: 1 }),
      node(3, 'Защитная стойка', '+1 блок', { bonusBlock: 1 }),
      node(4, 'Стена щитов', '+1 блок', { bonusBlock: 1 }),
      node(5, 'Пляска теней', 'Спецнавык: +1 карта при доборе', { cardsPerTurnBonus: 1 }, 'special'),
      node(6, 'Отражение', '+1 блок', { bonusBlock: 1 }),
      node(7, 'Тень в дыму', '+1 блок', { bonusBlock: 1 }),
      node(8, 'Вихрь клинков', '+1 блок', { bonusBlock: 1 }),
      node(9, 'Идеальный баланс', '+1 блок', { bonusBlock: 1 }),
      node(10, 'Пляска смерти', 'УЛЬТА: +1 энергия каждый ход', { energyPerTurnBonus: 1 }, 'ultimate'),
    ],
  },
  {
    id: 'intellect',
    name: 'Разум',
    icon: '📖',
    color: '#7d9fd8',
    nodes: [
      node(1, 'Знание трав', '+10% к исцелению', { healMultBonus: 0.1 }),
      node(2, 'Тайные письмена', '+10% к исцелению', { healMultBonus: 0.1 }),
      node(3, 'Искусство врачевания', '+10% к исцелению', { healMultBonus: 0.1 }),
      node(4, 'Мудрость старцев', '+10% к исцелению', { healMultBonus: 0.1 }),
      node(5, 'Метка чародея', 'Спецнавык: +1 стэк к налагаемым состояниям', { stateStacksBonus: 1 }, 'special'),
      node(6, 'Алхимия', '+10% к исцелению', { healMultBonus: 0.1 }),
      node(7, 'Печати обетов', '+10% к исцелению', { healMultBonus: 0.1 }),
      node(8, 'Глубокие тайны', '+10% к исцелению', { healMultBonus: 0.1 }),
      node(9, 'Архив забытых', '+10% к исцелению', { healMultBonus: 0.1 }),
      node(10, 'Память мира', 'УЛЬТА: ещё +2 стэка к состояниям', { stateStacksBonus: 2 }, 'ultimate'),
    ],
  },
  {
    id: 'endurance',
    name: 'Стойкость',
    icon: '🛡',
    color: '#d8b96a',
    nodes: [
      node(1, 'Дублёная кожа', '+4 макс. HP', { maxHpBonus: 4 }),
      node(2, 'Шрамы ветерана', '+4 макс. HP', { maxHpBonus: 4 }),
      node(3, 'Залатанная броня', '+4 макс. HP', { maxHpBonus: 4 }),
      node(4, 'Вторая кожа', '+4 макс. HP', { maxHpBonus: 4 }),
      node(5, 'Последний рубеж', 'Спецнавык: 6 блока в начале каждого боя', { startBlock: 6 }, 'special'),
      node(6, 'Стальное нутро', '+5 макс. HP', { maxHpBonus: 5 }),
      node(7, 'Ноша пилигрима', '+5 макс. HP', { maxHpBonus: 5 }),
      node(8, 'Закалённая сталь', '+5 макс. HP', { maxHpBonus: 5 }),
      node(9, 'Переживший пожар', '+5 макс. HP', { maxHpBonus: 5 }),
      node(10, 'Неукротимый', 'УЛЬТА: раз в бой выживаете при смертельном ударе (1 HP)', { surviveLethalOnce: true }, 'ultimate'),
    ],
  },
  {
    id: 'spirit',
    name: 'Вера',
    icon: '🕯',
    color: '#b98ad8',
    nodes: [
      node(1, 'Шёпот молитвы', '+10% собираемых душ', { soulsBonusPct: 10 }),
      node(2, 'Отблеск свечи', '+10% душ', { soulsBonusPct: 10 }),
      node(3, 'Свет очага', '+10% душ', { soulsBonusPct: 10 }),
      node(4, 'Обет странника', '+10% душ', { soulsBonusPct: 10 }),
      node(5, 'Тёплая милость', 'Спецнавык: Милость 3 на старте боя', { blessingOnStart: 3 }, 'special'),
      node(6, 'Тлеющий фитиль', '+1 HP в конце каждого хода', { healPerTurn: 1 }),
      node(7, 'Внутренний огонь', '+1 HP/ход', { healPerTurn: 1 }),
      node(8, 'Дыхание очага', '+1 HP/ход', { healPerTurn: 1 }),
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
