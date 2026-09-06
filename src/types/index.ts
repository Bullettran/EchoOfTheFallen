/**
 * Центральные типы игры. Всё data-driven: и карты, и враги, и состояния —
 * это конфиги, из которых фабрики создают инстансы. Новая сущность = новая запись в data/.
 */

// ============================== Карты ==============================

export type CardType = 'attack' | 'defense' | 'skill' | 'state' | 'equipment';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Tag = 'fire' | 'poison' | 'bleed' | 'holy' | 'dark' | 'physical' | 'fury';

/** Куда применяется эффект карты. Для прототипа враг один, но поле уже готово к нескольким. */
export type ActionTarget = 'self' | 'enemy';

/** Эффекты карты. Каждое поле опционально — карта может делать несколько вещей сразу. */
export interface CardAction {
  /** Базовый урон (до модификаторов состояний) */
  damage?: number;
  /** Урон по ВСЕМ живым врагам («Волна пепла») */
  aoe?: boolean;
  /** Снять N блока у цели ДО урона («Магический удар») */
  stripBlock?: number;
  /** Урон игнорирует первые N блока цели */
  pierceBlock?: number;
  /** Снять состояния: target/полярность/количество («Свеча памяти», «Корона») */
  cleanse?: { target: ActionTarget; positive?: boolean; count: number };
  /** Враг сжигает N карт в руке игрока (в сброс, без эффекта) */
  discardHand?: number;
  /** Выдаваемый блок */
  block?: number;
  /** Прямое лечение */
  heal?: number;
  /** Наложение состояния */
  applyState?: { type: StateType; stacks: number; duration: number | null; target: ActionTarget };
  /** Доп. добор карт */
  draw?: number;
  /** Доп. энергия */
  energy?: number;
}

/** Неизменяемое определение карты (шаблон). Хранится в data/cards.ts. */
export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  rarity: Rarity;
  tags: Tag[];
  description: string;
  /** URL арта; в прототипе пусто — рисуем процедурную заглушку */
  image?: string;
  /** Промпт для AI-генерации арта (этап 5). Fallback: название + теги. */
  artPrompt?: string;
  action: CardAction;
  /** Прирост характеристик за уровень улучшения в кузнице (+уровень * прирост) */
  upgradePerLevel?: Partial<Pick<CardAction, 'damage' | 'block' | 'heal'>>;
  /** Проклятая карта: не играется, портит руку (наказания — в движке) */
  curse?: boolean;
}

/** Конкретная карта в колоде игрока (с уникальным uid для отслеживания в руке/сбросе). */
export interface CardInstance {
  uid: string;
  defId: string;
  upgradeLevel: number;
}

// ============================== Состояния ==============================

export type StateType =
  | 'burn'       // горение: урон = stacks в конце хода носителя
  | 'poison'     // отравление: урон = stacks, затем stacks-1
  | 'bleed'      // кровотечение: носитель теряет HP при КАЖДОЙ своей атаке
  | 'blessing'   // благословение: лечение = stacks, затем stacks-1
  | 'fury'       // ярость: урон +50%, блок -50% (положительное)
  | 'vulnerable' // уязвимость: получаемый урон +50%
  | 'heal_ban';  // печать лечения: карты лечения не работают 1 ход («Проклятие Короля»)

/** Наложенный экземпляр состояния на бойца. */
export interface StateInstance {
  type: StateType;
  stacks: number;
  /** null = пока не спадёт само (например, poison) */
  duration: number | null;
}

// ============================== Бойцы ==============================

export type Side = 'player' | 'enemy';

/** Идентификаторы ветвей дерева навыков (Алтарь). */
export type BranchId = 'strength' | 'dexterity' | 'intellect' | 'endurance' | 'spirit';

/** Уникальный дар класса — пассивка, качается в Алтаре до 10 уровня. */
export type GiftId = 'thorns' | 'first_strike' | 'soul_harvest';

/** Дар, передаваемый в движок боя (level 0 = дар не пробуждён). */
export interface GiftConfig {
  id: GiftId;
  level: number;
}

/** Модификаторы похода (благословения/проклятия — действуют до конца рана). */
export interface RunModifiers {
  /** +блок в начале каждого боя */
  startBlock: number;
  /** +карта при доборе в начале хода */
  cardsPerTurnBonus: number;
  /** множитель лечения (аддитивно к Разуму): −0.3 = исцеление на 30% слабее */
  healMultBonus: number;
  /** +% душ за бои похода */
  soulsBonusPct: number;
  /** +урон всем врагам похода */
  enemyDmgBonus: number;
}

/**
 * Агрегированные боевые модификаторы, собранные из дерева навыков.
 * Движок применяет их в конкретных точках (урон, блок, добор и т.д.).
 * Множители заданы как ПРИБАВКИ к базе 1.0 — так узлы аддитивно складываются.
 */
export interface CombatStats {
  /** Плоский +урон к каждой атаке игрока */
  bonusDamage: number;
  /** Плоский +блок к каждой карте блока */
  bonusBlock: number;
  /** +max HP */
  maxHpBonus: number;
  /** +энергии в ход */
  energyPerTurnBonus: number;
  /** +карт при доборе */
  cardsPerTurnBonus: number;
  /** Блок на старте боя (Закалка) */
  startBlock: number;
  /** Прибавка к множителю урона (база 1.0) */
  damageMultBonus: number;
  /** Прибавка к множителю лечения (база 1.0) */
  healMultBonus: number;
  /** +стэков при наложении состояний игроком */
  stateStacksBonus: number;
  /** Регенерация HP в конце каждого хода игрока */
  healPerTurn: number;
  /** Стэки Благословения на старте боя (Молитва павшего) */
  blessingOnStart: number;
  /** Раз в бой пережить смертельный удар с 1 HP (Несокрушимость) */
  surviveLethalOnce: boolean;
  /** +% к собираемым душам */
  soulsBonusPct: number;
}

/** Боец (игрок или враг). Босс расширит этот интерфейс на фазах позже. */
export interface Combatant {
  id: string;
  name: string;
  side: Side;
  hp: number;
  maxHp: number;
  block: number;
  states: StateInstance[];
}

// ============================== Враги и ИИ ==============================

import type { SceneId } from '@/core/assets';

export type AIStyle = 'aggressive' | 'defensive' | 'tactical' | 'balanced';

/** Действие при входе босса в фазу (лечит себя / бафается / броня). */
export interface BossPhaseEnter {
  heal?: number;
  block?: number;
  applyState?: { type: StateType; stacks: number; duration: number | null };
}

/** Спецификация призываемого существа (фазы/ритуалы боссов). */
export interface SummonSpec {
  defId: string;
  name?: string;
  hp: number;
  count?: number;
  /** Колода призываемого (id карт врага); по умолчанию — [enemy_slash] */
  deck?: string[];
}

/** Фаза босса: включается, когда HP падает ниже порога (в процентах). */
export interface EnemyBossPhase {
  name: string;
  /** HP% ниже этого значения — фаза активируется (100 = стартовая) */
  hpThresholdPct: number;
  onEnter?: BossPhaseEnter;
  /** Призыв подкрепления при входе в фазу («Призыв теней») */
  summon?: SummonSpec;
}

/** Периодический автоэффект босса на его ходу (например «Поглощение душ» Короля-Пепла). */
export interface BossRitual {
  everyTurns: number;
  label: string;
  action?: CardAction;
  /** Призыв по расписанию */
  summon?: SummonSpec;
}

export interface EnemyBossConfig {
  /** Отсортированы по hpThresholdPct по убыванию; phases[0] — стартовая */
  phases: EnemyBossPhase[];
  ritual?: BossRitual;
}

/** Слот врага можно пощадить: ниже порога HP он бросает бой (ИИ не атакует). */
export interface MercyConfig {
  /** HP% ниже этого — враг «склоняется» */
  hpPct: number;
}

/** Резисты врага по тегам урона: 0.25 = четверть урона, 2 = двойной. */
export type Resistances = Partial<Record<Tag, number>>;

export interface EnemyDefinition {
  id: string;
  name: string;
  maxHp: number;
  level: number;
  aiStyle: AIStyle;
  /** id карт из data/cards.ts (enemy-карты тоже карты) */
  deck: string[];
  /** Дроп: души (валюта Последнего очага; внутренний ключ souls) */
  soulsDrop: number;
  /** Шанс дропа углей (ресурс Горнила) */
  essenceChance: number;
  /** Фон арены боя (см. core/assets.ts SceneId). boss_throne — у боссов */
  scene?: SceneId;
  /** Конфиг босса (фазы, ритуалы). null у обычных врагов */
  boss?: EnemyBossConfig;
  /** Механика пощады: ниже порога враг перестаёт сражаться, его можно пощадить */
  mercy?: MercyConfig;
  /** +урона остальным живым врагам при смерти этого («Осада теней») */
  allyDeathBonus?: number;
  /** Резисты по тегу урона карты (огн. голем почти не горит) */
  resistances?: Resistances;
  /** Ключевая фраза для генерации портрета через AI API (этап 5) */
  artPrompt?: string;
}

/** Одна строка плана врага: карта и её эффект (для полного превью хода). */
export interface IntentPart {
  kind: 'attack' | 'defend' | 'buff' | 'debuff';
  /** Число (урон/блок/лечение), если применимо */
  value?: number;
  /** Человекочитаемый эффект: «9 урона», «Горение 2 на тебя» */
  detail: string;
  cardName: string;
}

/** Намерение врага, показываемое игроку до его хода. */
export interface EnemyIntent {
  kind: 'attack' | 'defend' | 'buff' | 'unknown';
  /** Суммарный урон/блок для превью */
  value?: number;
  cardName: string;
  /** Полный план хода (все карты по порядку); unknown — пуст */
  parts?: IntentPart[];
}
