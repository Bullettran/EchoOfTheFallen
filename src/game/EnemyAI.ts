/**
 * ИИ врага. Стратегия выбирается по aiStyle определения врага.
 * ИИ — чистая функция: одинаковый вход → одинаковый выбор (кроме balanced,
 * который завязан на Math.random). Это упрощает юнит-тесты.
 *
 * План врага формируется ДО его хода и виден игроку как «намерение».
 */
import { resolveCardAction, getCardDefinition } from '@/game/CardFactory';
import type { AIStyle, CardInstance, Combatant, EnemyIntent } from '@/types';

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

/** Превью плана врага для HUD (до его хода). */
export function buildIntent(firstCard: CardInstance | null): EnemyIntent {
  if (!firstCard) return { kind: 'unknown', cardName: 'Сосредотачивается...' };
  const act = resolveCardAction(firstCard);
  if ((act.damage ?? 0) > 0) {
    return { kind: 'attack', value: act.damage, cardName: getCardDefinition(firstCard.defId).name };
  }
  if ((act.block ?? 0) > 0) {
    return { kind: 'defend', value: act.block, cardName: getCardDefinition(firstCard.defId).name };
  }
  return { kind: 'buff', cardName: getCardDefinition(firstCard.defId).name };
}
