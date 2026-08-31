/**
 * Фабрика карт. Изолирует создание инстансов и учёт улучшений кузницы.
 * Upgrade-математика в одном месте: итоговое действие = база + level * прирост.
 */
import { CARDS } from '@/data/cards';
import type { CardAction, CardDefinition, CardInstance } from '@/types';

let uidCounter = 0;

export function getCardDefinition(defId: string): CardDefinition {
  const def = CARDS[defId];
  if (!def) throw new Error(`Unknown card definition: ${defId}`);
  return def;
}

/** Создать экземпляр карты (uid уникален в рамках сессии). */
export function createCard(defId: string, upgradeLevel = 0): CardInstance {
  getCardDefinition(defId); // валидация существования
  if (upgradeLevel > 5) throw new Error(`Max upgrade level is 5 (${defId})`);
  uidCounter += 1;
  return { uid: `c${uidCounter}`, defId, upgradeLevel };
}

/** Итоговое действие карты с учётом уровня улучшения. */
export function resolveCardAction(card: Pick<CardInstance, 'defId' | 'upgradeLevel'>): CardAction {
  const def = getCardDefinition(card.defId);
  const act = { ...def.action };
  const gain = def.upgradePerLevel;
  if (gain && card.upgradeLevel > 0) {
    if (gain.damage) act.damage = (act.damage ?? 0) + gain.damage * card.upgradeLevel;
    if (gain.block) act.block = (act.block ?? 0) + gain.block * card.upgradeLevel;
    if (gain.heal) act.heal = (act.heal ?? 0) + gain.heal * card.upgradeLevel;
  }
  return act;
}

/** Стоимость с учётом проклятий (этап 2: Curse добавит +1). Пока — база. */
export function cardCost(card: CardInstance): number {
  return getCardDefinition(card.defId).cost;
}

/** Отображаемое имя с отметкой улучшения (+1, +2...). */
export function cardDisplayName(card: CardInstance): string {
  const def = getCardDefinition(card.defId);
  return card.upgradeLevel > 0 ? `${def.name}+${card.upgradeLevel}` : def.name;
}

/**
 * Динамическое описание карты с подсветкой прироста от улучшений:
 * фактические значения + зелёная «(+N)» рядом с прокачанными.
 * Возвращает HTML (inline-стиль — переживает v-html и scoped CSS).
 */
export function describeCardHtml(card: Pick<CardInstance, 'defId' | 'upgradeLevel'>): string {
  const base = getCardDefinition(card.defId).action;
  const cur = resolveCardAction(card);
  const G = (delta: number): string =>
    delta > 0 ? ` <span style="color:#7dd87d">(+${delta})</span>` : '';
  const val = (b: number | undefined, c: number | undefined): string => {
    const cv = c ?? 0;
    return `${cv}${G(cv - (b ?? 0))}`;
  };
  const parts: string[] = [];
  if (cur.damage) parts.push(`${val(base.damage, cur.damage)} урона`);
  if (cur.block) parts.push(`${val(base.block, cur.block)} блока`);
  if (cur.heal) parts.push(`восстановить ${val(base.heal, cur.heal)} HP`);
  if (cur.applyState) {
    const st = cur.applyState;
    const names: Record<string, string> = {
      burn: 'Горение', poison: 'Отравление', bleed: 'Кровотечение',
      blessing: 'Благословение', fury: 'Ярость', vulnerable: 'Уязвимость',
    };
    const nm = names[st.type] ?? st.type;
    parts.push(`${nm} ${st.stacks}${st.duration ? ` на ${st.duration} х.` : ''} ${st.target === 'self' ? 'на себя' : ''}`.trim());
  }
  if (cur.draw) parts.push(`добрать ${cur.draw} ${cur.draw === 1 ? 'карту' : 'карты'}`);
  if (cur.energy) parts.push(`даёт ${cur.energy} энергию`);
  return parts.length ? parts.join('. ') + '.' : getCardDefinition(card.defId).description;
}
export function syncUidCounter(existing: CardInstance[]): void {
  let max = 0;
  for (const c of existing) {
    const m = /^c(\d+)$/.exec(c.uid);
    if (m) max = Math.max(max, Number(m[1]));
  }
  uidCounter = Math.max(uidCounter, max);
}

/** Человекочитаемое описание прироста за уровень улучшения (для кузницы). */
export function upgradePreview(defId: string): string {
  const gain = getCardDefinition(defId).upgradePerLevel;
  if (!gain) return 'Улучшение недоступно';
  const parts: string[] = [];
  if (gain.damage) parts.push(`+${gain.damage} урона`);
  if (gain.block) parts.push(`+${gain.block} блока`);
  if (gain.heal) parts.push(`+${gain.heal} лечения`);
  return parts.join(', ') || 'Улучшение недоступно';
}
