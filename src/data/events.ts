/**
 * События узла «Находка»: встреча на пепелище с ВЫБОРОМ из двух путей.
 * Чистые данные: эффекты — декларативные вызовы узкого EventContext
 * (аналог StateContext у состояний). Новое событие = запись в EVENT_SCENARIOS.
 */
import type { RunModifiers } from '@/types';

/** Контекст, который UI предоставляет эффектам события. */
export interface EventContext {
  addSouls(n: number): void;
  healHp(n: number): void;
  addMaxHp(n: number): void;
  /** Карта в походную колоду по defId */
  addCard(defId: string): void;
  /** Случайная редкая карта в походную колоду */
  addRandomRareCard(): void;
  addEssence(n: number): void;
  /** Сложить модификаторы похода (аддитивно) */
  addRunMod(mod: Partial<RunModifiers>): void;
}

export interface EventOption {
  id: string;
  /** Кнопка: «Обыскать» */
  label: string;
  /** Краткий эффект: «+60 душ» */
  effect: string;
  apply: (ctx: EventContext) => void;
}

export interface EventScenario {
  id: string;
  title: string;
  text: string;
  options: EventOption[];
}

export const EVENT_SCENARIOS: EventScenario[] = [
  {
    id: 'burnt_wagon',
    title: '❓ Обгоревший обоз',
    text: 'Воз сгоревший вместе с лошадью. Под брезентом угадываются сундуки — и чьи-то кости поверх них.',
    options: [
      { id: 'loot', label: 'Обыскать', effect: '+60 душ', apply: (c) => c.addSouls(60) },
      { id: 'bury', label: 'Похоронить мёртвых', effect: '+15 HP', apply: (c) => c.healHp(15) },
    ],
  },
  {
    id: 'fallen_paladin',
    title: '❓ Павший паладин',
    text: 'Он сидит у стены, обратившись в пепел изнутри. Клинок всё ещё тёплый, губы всё ещё шевелятся.',
    options: [
      { id: 'take', label: 'Взять клинок', effect: 'редкая карта', apply: (c) => c.addRandomRareCard() },
      { id: 'pray', label: 'Дочитать молитву', effect: '+4 блока в каждом бою', apply: (c) => c.addRunMod({ startBlock: 4 }) },
    ],
  },
  {
    id: 'cracked_bell',
    title: '❓ Треснувший колокол',
    text: 'Колокол соборной площади расколот надвое. Если ударить — услышит ли кто-то? Если услышит — кто?',
    options: [
      { id: 'ring', label: 'Ударить в колокол', effect: '+90 душ, −8 HP', apply: (c) => { c.addSouls(90); c.healHp(-8); } },
      { id: 'pass', label: 'Пройти мимо', effect: '+10 HP', apply: (c) => c.healHp(10) },
    ],
  },
  {
    id: 'wayside_icon',
    title: '❓ Придорожный образ',
    text: 'Потёкшая икона без лика. Кто-то оставил у неё огарок и горсть углей — на днях или сто лет назад.',
    options: [
      { id: 'light', label: 'Затеплить свечу', effect: '+1 уголёк, +10 HP', apply: (c) => { c.addEssence(1); c.healHp(10); } },
      { id: 'defile', label: 'Осквернить', effect: '+120 душ, лечение −20% на поход', apply: (c) => { c.addSouls(120); c.addRunMod({ healMultBonus: -0.2 }); } },
    ],
  },
  {
    id: 'echo_whisper',
    title: '❓ Эхо павшего',
    text: 'Пепел складывается в фигуру. Она говорит беззвучно, но ты понимаешь каждое слово — это одно из твоих голосов.',
    options: [
      { id: 'listen', label: 'Выслушать до конца', effect: '+1 уголёк, +10 HP', apply: (c) => { c.addEssence(1); c.healHp(10); } },
      { id: 'silence', label: 'Заткнуть голос', effect: '+50 душ', apply: (c) => c.addSouls(50) },
    ],
  },
  {
    id: 'buried_cache',
    title: '❓ Клад под пеплом',
    text: 'Из дюны торчит рукоять. Лопата рядом — тот, кто копал, не успел докопать. Или не захотел.',
    options: [
      { id: 'dig', label: 'Копать', effect: 'редкая карта', apply: (c) => c.addRandomRareCard() },
      { id: 'careful', label: 'Не рисковать', effect: '+30 душ', apply: (c) => c.addSouls(30) },
    ],
  },
  {
    id: 'cold_hearth',
    title: '❓ Чужой очаг',
    text: 'Дом с погасшим очагом. На столе — накрытый ужин, обращённый в пепел. За печью ещё тлеют угли.',
    options: [
      { id: 'warm', label: 'Согреться у углей', effect: '+20 HP', apply: (c) => c.healHp(20) },
      { id: 'search', label: 'Обчистить дом', effect: '+70 душ', apply: (c) => c.addSouls(70) },
    ],
  },
];

/** Случайный сценарий для узла «Находка». */
export function rollEventScenario(): EventScenario {
  return EVENT_SCENARIOS[Math.floor(Math.random() * EVENT_SCENARIOS.length)]!;
}
