/**
 * Реестр состояний (эффектов). Каждое состояние — объект-определение с хуками.
 * BattleEngine вызывает хуки в нужные моменты; сами определения не знают
 * ни про Phaser, ни про Vue — чистая логика, легко покрывается тестами.
 *
 * Добавить новое состояние = дописать один объект в STATES и тип в StateType.
 */
import type { Combatant, StateInstance, StateType } from '@/types';

/** Контекст, который движок передаёт хукам — узкий интерфейс вместо всего движка. */
export interface StateContext {
  dealDamage(target: Combatant, amount: number, source: 'state'): void;
  heal(target: Combatant, amount: number): void;
}

export interface StateDefinition {
  type: StateType;
  name: string;
  /** Иконка-заглушка для UI (до этапа генерации ассетов) */
  icon: string;
  color: string;
  /** Полярность: true — бафф носителя (для cleanse «снять положительные») */
  positive?: boolean;
  /** Человекочитаемое описание с учётом текущих стэков */
  describe: (s: StateInstance) => string;
  /** Вызывается в конце хода НОСИТЕЛЯ (тик DoT/HoT) */
  onTurnEnd?: (holder: Combatant, s: StateInstance, ctx: StateContext) => void;
  /** Вызывается, когда носитель АТАКУЕТ (для кровотечения) */
  onHolderAttack?: (holder: Combatant, s: StateInstance, ctx: StateContext) => void;
  /** Вызывается при снятии (для будущих эффектов «при рассеивании») */
  onRemove?: (holder: Combatant, s: StateInstance) => void;
  /** Повторное наложение: как мержить стэки/длительность */
  merge: (existing: StateInstance, incoming: StateInstance) => void;
}

/** Горение: чистый урон = stacks в конце хода носителя, стэки не тикают. */
const burn: StateDefinition = {
  type: 'burn',
  name: 'Горение',
  icon: '🔥',
  color: '#ff6a3d',
  describe: (s) => `Горение: −${s.stacks} HP в конце хода (${s.duration} ход.)`,
  onTurnEnd: (holder, s, ctx) => ctx.dealDamage(holder, s.stacks, 'state'),
  merge: (ex, inc) => {
    ex.stacks = Math.max(ex.stacks, inc.stacks);
    ex.duration = Math.max(ex.duration ?? 0, inc.duration ?? 0);
  },
};

/** Отравление: урон = stacks, затем stacks−1. Длительность не ограничена. */
const poison: StateDefinition = {
  type: 'poison',
  name: 'Отравление',
  icon: '☠',
  color: '#7dd87d',
  describe: (s) => `Отравление: −${s.stacks} HP в конце хода, сила яда падает`,
  onTurnEnd: (holder, s, ctx) => {
    ctx.dealDamage(holder, s.stacks, 'state');
    s.stacks -= 1;
  },
  merge: (ex, inc) => {
    ex.stacks += inc.stacks; // яд накапливается
  },
};

/** Кровотечение: носитель теряет HP при каждой СВОЕЙ атаке. */
const bleed: StateDefinition = {
  type: 'bleed',
  name: 'Кровотечение',
  icon: '🩸',
  color: '#d43b3b',
  describe: (s) => `Кровотечение: −${s.stacks} HP при каждой вашей атаке (${s.duration} ход.)`,
  onHolderAttack: (holder, s, ctx) => ctx.dealDamage(holder, s.stacks, 'state'),
  merge: (ex, inc) => {
    ex.stacks = Math.max(ex.stacks, inc.stacks);
    ex.duration = Math.max(ex.duration ?? 0, inc.duration ?? 0);
  },
};

/** Благословение: HoT, лечение = stacks, затем stacks−1. */
const blessing: StateDefinition = {
  type: 'blessing',
  name: 'Благословение',
  icon: '✨',
  color: '#e8d48b',
  describe: (s) => `Благословение: +${s.stacks} HP в конце хода`,
  onTurnEnd: (holder, s, ctx) => {
    ctx.heal(holder, s.stacks);
    s.stacks -= 1;
  },
  merge: (ex, inc) => {
    ex.stacks += inc.stacks;
  },
};

/** Ярость: пассивный модификатор (урон +50%, блок −50%) — движок читает наличие. */
const fury: StateDefinition = {
  type: 'fury',
  name: 'Ярость',
  icon: '😡',
  color: '#ff3b3b',
  positive: true,
  describe: () => 'Ярость: урон +50%, получаемый блок −50%',
  merge: (ex, inc) => {
    ex.duration = Math.max(ex.duration ?? 0, inc.duration ?? 0);
  },
};

/** Уязвимость: получаемый урон +50%. */
const vulnerable: StateDefinition = {
  type: 'vulnerable',
  name: 'Уязвимость',
  icon: '💔',
  color: '#c05bff',
  describe: (s) => `Уязвимость: получаемый урон +50% (${s.duration} ход.)`,
  merge: (ex, inc) => {
    ex.duration = Math.max(ex.duration ?? 0, inc.duration ?? 0);
  },
};

/** Благословение — положительное состояние (жрец-призрак снимает «Короной»). */

/** Печать лечения («Проклятие Короля»): карты лечения не работают 1 ход. */
const healBan: StateDefinition = {
  type: 'heal_ban',
  name: 'Печать лечения',
  icon: '🚫',
  color: '#8a4a5a',
  describe: (s) => `Карты лечения не работают (${s.duration} ход.)`,
  merge: (ex, inc) => {
    ex.duration = Math.max(ex.duration ?? 0, inc.duration ?? 0);
  },
};

export const STATES: Record<StateType, StateDefinition> = {
  burn,
  poison,
  bleed,
  blessing: { ...blessing, positive: true },
  fury,
  vulnerable,
  heal_ban: healBan,
};
