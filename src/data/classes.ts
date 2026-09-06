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
      describe: (lvl) => {
        if (lvl <= 0) return 'Первая атака каждого хода бьёт сильнее (+1 к урону за уровень)';
        let s = `Первая атака каждого хода: +${lvl} к урону`;
        if (lvl >= 10) s += ', а в первый ход боя +1 энергия';
        return s + '.';
      },
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
      describe: (lvl) => {
        if (lvl <= 0) return 'Удары по тебе отражают урон атакующему (+1 ед. за уровень, сквозь блок)';
        let s = `Каждый удар по тебе отражает ${lvl} ед. урона атакующему (сквозь блок)`;
        if (lvl >= 10) s = `Каждый удар по тебе отражает ${Math.floor(lvl * 1.5)} ед. урона (×1.5)`;
        if (lvl >= 5) s += ' и разбивает его броню';
        return s + '.';
      },
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
      describe: (lvl) => {
        if (lvl <= 0) return 'Смерть врага исцеляет тебя (+1 HP за уровень)';
        const amount = lvl >= 10 ? Math.floor(lvl * 1.5) : lvl;
        let s = `Смерть врага восстанавливает ${amount} HP`;
        if (lvl >= 5) s += ' и даёт +2 блока';
        return s + '.';
      },
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

/** Базовые карты, общие для всех классов (не считаются классовыми). */
const BASIC_CARDS = new Set(['strike', 'guard', 'heavy_blow', 'flask']);

/** Классовые карты класса (для наград за элиту/находок) — глубокие билды. */
export function classCardPool(classId: ClassId): string[] {
  return CLASSES[classId].startingDeck.filter((id) => !BASIC_CARDS.has(id));
}
