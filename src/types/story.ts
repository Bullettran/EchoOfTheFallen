/**
 * Типы сюжетного слоя (акты, узлы, проверки в духе Disco Elysium).
 * Данные — в data/story/act1.ts; исполнение — game/StoryEngine.ts.
 */

/** Story-статы проверок (не путать с боевыми ветвями Алтаря). */
export type StoryStat =
  | 'strength'   // Сила
  | 'intellect'  // Интеллект
  | 'memory'     // Память
  | 'resolve'    // Упорство
  | 'sincerity'  // Искренность
  | 'wrath';     // Гнев

export const STORY_STAT_NAMES: Record<StoryStat, string> = {
  strength: 'Сила',
  intellect: 'Интеллект',
  memory: 'Память',
  resolve: 'Упорство',
  sincerity: 'Искренность',
  wrath: 'Гнев',
};

/** Временное состояние акта, влияющее на проверки (и позже — на бои). */
export interface ActEffect {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Бонус к проверкам: конкретный стат или все */
  checkBonus?: { stat?: StoryStat | 'all'; value: number };
  /** Применяется только в узлах этой локации (напр. 'well') */
  scope?: string;
  /** Одноразовый: расходуется после следующей проверки (Решимость) */
  once?: boolean;
}

/** Награды/последствия выбора. */
export interface ChoiceOutcome {
  /** Текст исхода (показывается после броска/выбора) */
  text?: string;
  souls?: number;
  /** Эссенции (с боссов/сцен) */
  essences?: number;
  /** Пепельные осколки — валюта Акта 2 (конверт на Рынке, крафт) */
  ashShards?: number;
  /** id карт в коллекцию (data/cards.ts) */
  cards?: string[];
  /** id лор-фрагментов (data/lore.ts) для Статуи воспоминаний */
  lore?: string[];
  /** Прибавка story-статов (выбор класса и события) */
  stats?: Partial<Record<StoryStat, number>>;
  flags?: string[];
  effects?: ActEffect[];
  /** Запустить бой; после победы — переход на victoryNode,
   *  после ПОЩАДЫ (исход 'spared') — на sparedNode, если задан */
  battle?: { enemies: string[]; victoryNode: string; sparedNode?: string };
  next: string;
}

export interface StoryCheck {
  stat: StoryStat;
  /** сложность: 2d6 + стат + бонусы ≥ dc */
  dc: number;
}

export interface StoryChoice {
  text: string;
  /** Показать выбор только при наличии ВСЕХ флагов */
  requiresFlags?: string[];
  /** Скрыть при наличии ЛЮБОГО из флагов */
  hideIfFlags?: string[];
  /** Требуемые ресурсы (скрывает выбор если не хватает) */
  requires?: { souls?: number; ashShards?: number };
  check?: StoryCheck;
  /** Исход при успехе проверки (или без проверки) */
  success: ChoiceOutcome;
  /** Исход при провале проверки */
  fail?: ChoiceOutcome;
}

export interface StoryNode {
  id: string;
  /** Фон сцены (assets/images/scenes) */
  scene: string;
  /** Имя говорящего (для панели) */
  speaker?: string;
  /** Абзацы текста */
  text: string[];
  /** Автопереход (узел без выбора) */
  autoNext?: string;
  choices?: StoryChoice[];
}

/** Результат броска для UI-анимации. */
export interface RollResult {
  dice: [number, number];
  stat: StoryStat;
  statValue: number;
  bonus: number;      // бонусы эффектов акта
  dc: number;
  total: number;
  success: boolean;
}
