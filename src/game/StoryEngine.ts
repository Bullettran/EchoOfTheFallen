/**
 * StoryEngine — ядро сценария в духе Disco Elysium: узлы, выборы,
 * проверки 2d6 + стат против сложности, флаги, эффекты акта, награды.
 *
 * Чистый TS: не знает про Vue/Phaser и НЕ трогает meta-store — награды
 * возвращаются наружу (слор проводит их в профиль). RNG инъекцируется,
 * чтобы тесты были детерминированными.
 */
import type {
  ActEffect,
  ChoiceOutcome,
  RollResult,
  StoryCheck,
  StoryChoice,
  StoryNode,
  StoryStat,
} from '@/types/story';

/** Распределение суммы 2d6: сумма → число исходов из 36. */
const D6_COUNTS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};

export interface StoryAwards {
  souls: number;
  essences: number;
  ashShards: number;
  cards: string[];
  lore: string[];
  effects: ActEffect[];
}

/** Снимок состояния акта для чекпоинтов (сериализуем в профиль). */
export interface StorySnapshot {
  nodeId: string;
  flags: string[];
  stats: Record<string, number>;
  effects: ActEffect[];
}

export interface EngineDeps {
  nodes: Record<string, StoryNode>;
  startNode: string;
  /** локальный id сцены для scope-эффектов (узел может принадлежать локации) */
  sceneScopes?: Record<string, string>;
  random?: () => number;
}

export class StoryEngine {
  readonly nodes: Record<string, StoryNode>;
  private sceneScopes: Record<string, string>;
  private rng: () => number;

  currentNodeId: string;
  flags = new Set<string>();
  stats: Record<StoryStat, number> = {
    strength: 0, intellect: 0, memory: 0, resolve: 0, sincerity: 0, wrath: 0,
  };
  effects: ActEffect[] = [];
  /** Накопленные награды (стор проводит в meta и очищает) */
  pendingAwards: StoryAwards = { souls: 0, essences: 0, ashShards: 0, cards: [], lore: [], effects: [] };
  /** Завершён ли акт (узел-терминал) */
  actFinished = false;

  constructor(deps: EngineDeps) {
    this.nodes = deps.nodes;
    this.sceneScopes = deps.sceneScopes ?? {};
    this.rng = deps.random ?? Math.random;
    this.currentNodeId = deps.startNode;
  }

  get node(): StoryNode {
    return this.nodes[this.currentNodeId]!;
  }

  /** Видимые выборы текущего узла (с учётом флагов). */
  visibleChoices(): StoryChoice[] {
    return (this.node.choices ?? []).filter((c) => this.isChoiceVisible(c));
  }

  /** Шанс успеха проверки в процентах (для бейджа выбора). */
  chanceFor(check: StoryCheck): number {
    const total = this.stats[check.stat] + this.effectBonus(check.stat);
    return Math.round(successProbability(total, check.dc) * 100);
  }

  /** Бросок проверки (без применения последствий — это делает applyOutcome). */
  roll(check: StoryCheck): RollResult {
    const d1 = this.d6();
    const d2 = this.d6();
    const statValue = this.stats[check.stat];
    const bonus = this.effectBonus(check.stat);
    const total = d1 + d2 + statValue + bonus;
    // Одноразовые эффекты («Решимость») расходуются броском
    this.consumeOnceEffects();
    return {
      dice: [d1, d2],
      stat: check.stat,
      statValue,
      bonus,
      dc: check.dc,
      total,
      success: total >= check.dc,
    };
  }

  /**
   * Применить исход выбора (после показа броска UI).
   * Возвращает узел, на который нужно перейти (или null, если исход запускает бой).
   */
  applyOutcome(choice: StoryChoice, branch: 'success' | 'fail'): string | null {
    const outcome = branch === 'success' || !choice.fail ? choice.success : choice.fail;
    this.grant(outcome);
    if (outcome.battle) return null; // UI запустит бой; переход — по victoryNode после
    return outcome.next;
  }

  /** Награды результата сценарного боя (вызывает стор после battle). */
  applyBattleResult(
    choice: StoryChoice,
    branch: 'success' | 'fail',
    result: 'victory' | 'spared',
  ): string {
    const outcome = branch === 'success' || !choice.fail ? choice.success : choice.fail;
    if (!outcome.battle) return outcome.next;
    if (result === 'spared' && outcome.battle.sparedNode) return outcome.battle.sparedNode;
    return outcome.battle.victoryNode;
  }

  /** Переход на узел. Терминальный узел (нет choices и autoNext) завершает акт. */
  goTo(nodeId: string): void {
    this.currentNodeId = nodeId;
    const n = this.nodes[nodeId];
    if (!n) throw new Error(`Unknown story node: ${nodeId}`);
    if (!n.choices?.length && !n.autoNext) this.actFinished = true;
  }

  /** Автопереход, если узел без выбора. */
  advanceAuto(): boolean {
    if (this.node.autoNext) {
      this.goTo(this.node.autoNext);
      return true;
    }
    return false;
  }

  /** Снимок состояния (для чекпоинта при смерти). */
  snapshot(): StorySnapshot {
    return {
      nodeId: this.currentNodeId,
      flags: [...this.flags],
      stats: { ...this.stats },
      effects: this.effects.map((e) => ({ ...e })),
    };
  }

  /** Восстановить состояние из снимка. false — снимок неактуален. */
  restore(snap: StorySnapshot): boolean {
    if (!this.nodes[snap.nodeId]) return false;
    this.currentNodeId = snap.nodeId;
    this.flags = new Set(snap.flags);
    this.stats = { ...this.stats, ...snap.stats } as Record<StoryStat, number>;
    this.effects = snap.effects.map((e) => ({ ...e }));
    this.actFinished = false;
    return true;
  }

  /** Забрать накопленные награды (стор очищает после проведения в meta). */
  takeAwards(): StoryAwards {
    const a = this.pendingAwards;
    this.pendingAwards = { souls: 0, essences: 0, ashShards: 0, cards: [], lore: [], effects: [] };
    return a;
  }

  // ==================== Внутреннее ====================

  private isChoiceVisible(c: StoryChoice): boolean {
    if (c.requiresFlags && !c.requiresFlags.every((f) => this.flags.has(f))) return false;
    if (c.hideIfFlags && c.hideIfFlags.some((f) => this.flags.has(f))) return false;
    return true;
  }

  private grant(outcome: ChoiceOutcome): void {
    if (outcome.souls) this.pendingAwards.souls += outcome.souls;
    if (outcome.essences) this.pendingAwards.essences += outcome.essences;
    if (outcome.ashShards) this.pendingAwards.ashShards += outcome.ashShards;    if (outcome.cards) this.pendingAwards.cards.push(...outcome.cards);
    for (const id of outcome.lore ?? []) {
      if (!this.pendingAwards.lore.includes(id)) this.pendingAwards.lore.push(id);
    }
    for (const [stat, value] of Object.entries(outcome.stats ?? {})) {
      this.stats[stat as StoryStat] += value ?? 0;
    }
    for (const flag of outcome.flags ?? []) this.flags.add(flag);
    for (const eff of outcome.effects ?? []) this.addEffect(eff);
  }

  private addEffect(eff: ActEffect): void {
    const existing = this.effects.find((e) => e.id === eff.id);
    if (existing) return; // не стакаем дубли
    this.effects.push(eff);
  }

  /** Бонус эффектов акта к проверке (с учётом scope локации текущего узла). */
  private effectBonus(stat: StoryStat): number {
    const scope = this.sceneScopes[this.currentNodeId];
    let bonus = 0;
    for (const e of this.effects) {
      if (e.checkBonus && (!e.scope || e.scope === scope)) {
        if (!e.checkBonus.stat || e.checkBonus.stat === 'all' || e.checkBonus.stat === stat) {
          bonus += e.checkBonus.value;
        }
      }
    }
    return bonus;
  }

  private consumeOnceEffects(): void {
    this.effects = this.effects.filter((e) => !e.once);
  }

  private d6(): number {
    return 1 + Math.floor(this.rng() * 6);
  }
}

/** P(2d6 + mod >= dc) — точная комбинаторика. */
export function successProbability(mod: number, dc: number): number {
  const diff = dc - mod;
  if (diff > 12) return 0; // даже 12 не спасает
  if (diff <= 2) return 1; // минимум 2d6 = 2
  let favorable = 0;
  for (let s = diff; s <= 12; s++) favorable += D6_COUNTS[s] ?? 0;
  return favorable / 36;
}
