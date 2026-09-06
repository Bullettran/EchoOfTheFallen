/**
 * Реестр игровых классов (Пепельных). Класс = стартовая колода + стартовые
 * уровни Алтаря + портрет. Прокачка дальше — общая (Алтарь в Последнем очаге).
 *
 * Внутренние id классов — ключи сейвов (profile.classId), не переименовывать.
 */
import type { BranchId, GiftId } from '@/types';

export type ClassId = 'courier' | 'welder' | 'companion';

/** Дар класса: уникальная пассивка, качается в Алтаре до 10 уровня. */
export interface ClassGift {
  id: GiftId;
  name: string;
  icon: string;
  /** Короткое описание эффекта на данном уровне (0 — дар спит) */
  describe: (level: number) => string;
}

export interface ClassDefinition {
  id: ClassId;
  name: string;
  /** Архетип коротко — для карточки выбора */
  role: string;
  quote: string;
  desc: string;
  icon: string;
  /** Портрет: файл assets/images/ui/<portrait>.jpeg */
  portrait: string;
  /** Стартовые уровни ветвей Алтаря */
  startSkills: Partial<Record<BranchId, number>>;
  /** Стартовая коллекция/колода: defId → количество копий (в порядке перечисления) */
  startingDeck: string[];
  /** Уникальный дар этого класса */
  gift: ClassGift;
}

export const CLASSES: Record<ClassId, ClassDefinition> = {
  courier: {
    id: 'courier',
    name: 'Странник',
    role: 'Темпо · разгон колоды',
    quote: '«Путь важнее цели. Пока я иду — я есть»',
    desc: 'Легконогий боец в дорожном плаще. Дешёвые удары, добор и энергия — разгоняется и крутит колоду по кругу, пока враг не рухнет.',
    icon: '🗡',
    portrait: 'player',
    startSkills: { dexterity: 1 },
    gift: {
      id: 'first_strike',
      name: 'Наконечник',
      icon: '➶',
      describe: (lvl) =>
        lvl > 0
          ? `Первая атака каждого хода: +${lvl} к урону`
          : 'Первая атака каждого хода бьёт сильнее (+1 к урону за уровень)',
    },
    startingDeck: [
      'strike', 'strike', 'strike',
      'guard', 'guard',
      'heavy_blow', 'fireball', 'poison_blade',
      'flask', 'rend',
    ],
  },
  welder: {
    id: 'welder',
    name: 'Рыцарь',
    role: 'Танк · блок и контратака',
    quote: '«Я держал эту стену, когда горели боги»',
    desc: 'Пепельный в треснувшем доспехе и обгорелом плаще. Держит удар за башенным щитом и отвечает ударом, от которого трескается броня.',
    icon: '🛡',
    portrait: 'class_welder',
    startSkills: { strength: 1, endurance: 1 },
    gift: {
      id: 'thorns',
      name: 'Шипы',
      icon: '🜸',
      describe: (lvl) =>
        lvl > 0
          ? `Каждый удар по тебе отражает ${lvl} ед. урона атакующему (сквозь блок)`
          : 'Удары по тебе отражают урон атакующему (+1 ед. за уровень, сквозь блок)',
    },
    startingDeck: [
      'strike', 'strike',
      'guard', 'guard', 'guard',
      'heavy_blow', 'plate_armor', 'torch_hit',
      'rivet_gun', 'flask',
    ],
  },
  companion: {
    id: 'companion',
    name: 'Жрец',
    role: 'Поддержка · милость и гниль',
    quote: '«Даже пепел помнит тепло»',
    desc: 'Тихий служитель сгоревшего храма. Молитвы Милости сращивают раны, а насланная Гниль медленно пожирает врагов.',
    icon: '🕯',
    portrait: 'class_companion',
    startSkills: { spirit: 1, intellect: 1 },
    gift: {
      id: 'soul_harvest',
      name: 'Жатва душ',
      icon: '💀',
      describe: (lvl) =>
        lvl > 0
          ? `Смерть врага восстанавливает тебе ${lvl} HP`
          : 'Смерть врага исцеляет тебя (+1 HP за уровень)',
    },
    startingDeck: [
      'strike', 'strike',
      'guard', 'guard',
      'flask', 'flask',
      'care_package', 'rust_bomb', 'oil_leak',
      'prayer',
    ],
  },
};

export const CLASS_LIST: ClassDefinition[] = [CLASSES.courier, CLASSES.welder, CLASSES.companion];
