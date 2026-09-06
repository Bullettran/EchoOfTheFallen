/**
 * ИИ врага. Стратегия выбирается по aiStyle определения врага.
 * ИИ — чистая функция: одинаковый вход → одинаковый выбор (кроме balanced,
 * который завязан на Math.random). Это упрощает юнит-тесты.
 *
 * План врага формируется ДО его хода и виден игроку как «намерение».
 */
import { resolveCardAction, getCardDefinition } from '@/game/CardFactory';
import { STATES } from '@/data/states';
import { BALANCE } from '@/core/config';
import type { AIStyle, CardInstance, Combatant, EnemyIntent, IntentPart } from '@/types';

export interface AIInput {
  self: Combatant;
  player: Combatant;
  /** Рука врага (уже добрана) */
  hand: CardInstance[];
  /** Энергия врага */
  energy: number;
}

/** Решение ИИ: какую карту сыграть следующей (null = пас). */
export type AIDecision = CardInstance | null;

export function decide(aiStyle: AIStyle, input: AIInput): AIDecision {
  const affordable = input.hand.filter((c) => getCardDefinition(c.defId).cost <= input.energy);
  if (affordable.length === 0) return null;

  const attacks = affordable.filter((c) => (resolveCardAction(c).damage ?? 0) > 0);
  const defenses = affordable.filter((c) => (resolveCardAction(c).block ?? 0) > 0);
  const attacksByDamage = [...attacks].sort(
    (a, b) => (resolveCardAction(b).damage ?? 0) - (resolveCardAction(a).damage ?? 0),
  );
  const defensesByBlock = [...defenses].sort(
    (a, b) => (resolveCardAction(b).block ?? 0) - (resolveCardAction(a).block ?? 0),
  );

  switch (aiStyle) {
    case 'aggressive':
      // Всегда атакует сильнейшей; если атак в руке нет — играет лучшее из
      // доступного (защита/баф), иначе ход зациклится на не-атакующих картах
      return attacksByDamage[0] ?? defensesByBlock[0] ?? affordable[0] ?? null;
    case 'defensive':
      // Под лечением/защитой; атакует, только если угрозы нет
      return defensesByBlock[0] ?? attacksByDamage[0] ?? null;
    case 'tactical': {
      // Игрок при смерти → добивать; игрок здоров → защищаться/баффаться
      const playerLowHp = input.player.hp <= input.player.maxHp * 0.3;
      if (playerLowHp) return attacksByDamage[0] ?? null;
      return defensesByBlock[0] ?? attacksByDamage[0] ?? null;
    }
    case 'balanced':
    default:
      return affordable[Math.floor(Math.random() * affordable.length)] ?? null;
  }
}

/**
 * Собрать намерение из ПОЛНОГО плана хода (все карты, которые враг сыграет).
 * Отражает и атаку, и защиту, и состояния — игрок видит всё, что будет делать враг.
 *
 * Числа урона считаются по той же формуле, что и реальный ход (dealAttackDamage):
 * (base + бонус глубины) × Ярость × Пробитая броня, с floor на каждый удар.
 * Модификаторы симулируются ПО ПОРЯДКУ плана: если первой картой враг накладывает
 * Ярость — следующие атаки плана уже посчитаны с ×1.5.
 *
 * @param dmgBonus плоский бонус урона слота (скейлинг глубины)
 * @param mods состояния на момент начала хода (могут дожить до атак)
 */
export function buildPlanIntent(
  cards: CardInstance[],
  dmgBonus = 0,
  mods: { attackerHasFury?: boolean; targetHasVulnerable?: boolean } = {},
): EnemyIntent {
  if (cards.length === 0) return { kind: 'unknown', cardName: 'Сосредотачивается...' };

  let simFury = mods.attackerHasFury ?? false;
  let simVuln = mods.targetHasVulnerable ?? false;
  const parts: IntentPart[] = [];

  for (const card of cards) {
    const def = getCardDefinition(card.defId);
    const act = resolveCardAction(card);
    if ((act.damage ?? 0) > 0) {
      const total = Math.floor(
        ((act.damage ?? 0) + dmgBonus) *
          (simFury ? BALANCE.combat.furyDamageMult : 1) *
          (simVuln ? BALANCE.combat.vulnerableDamageMult : 1),
      );
      parts.push({ kind: 'attack', value: total, detail: `${total} урона`, cardName: def.name });
    }
    if ((act.block ?? 0) > 0) {
      const block = Math.floor((act.block ?? 0) * (simFury ? BALANCE.combat.furyBlockMult : 1));
      parts.push({ kind: 'defend', value: block, detail: `${block} блока`, cardName: def.name });
    }
    if ((act.heal ?? 0) > 0) {
      parts.push({ kind: 'buff', value: act.heal, detail: `+${act.heal} HP`, cardName: def.name });
    }
    if (act.applyState) {
      const st = act.applyState;
      const stName = STATES[st.type].name;
      const detail = `${stName} ${st.stacks}${st.duration ? ` (${st.duration} х.)` : ''}`;
      if (st.target === 'self') {
        parts.push({ kind: 'buff', detail: `${detail} на себя`, cardName: def.name });
        // Ярость, наложенная первой картой хода, усилит остальные атаки плана
        if (st.type === 'fury') simFury = true;
      } else {
        parts.push({ kind: 'debuff', detail: `${detail} на тебя`, cardName: def.name });
        if (st.type === 'vulnerable') simVuln = true;
      }
    }
  }

  // Приоритет вида намерения: атака > защита > усиление
  const sum = (kind: IntentPart['kind']): number =>
    parts.filter((p) => p.kind === kind).reduce((s, p) => s + (p.value ?? 0), 0);
  let kind: EnemyIntent['kind'] = 'buff';
  let value: number | undefined;
  if (parts.some((p) => p.kind === 'attack')) {
    kind = 'attack';
    value = sum('attack');
  } else if (parts.some((p) => p.kind === 'defend')) {
    kind = 'defend';
    value = sum('defend');
  }

  return {
    kind,
    value,
    cardName: cards.map((c) => getCardDefinition(c.defId).name).join(' + '),
    parts,
  };
}
