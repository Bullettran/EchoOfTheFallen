/**
 * story-store — реактивная обёртка StoryEngine для UI.
 * Фазы интерфейса: узел (текст+выборы) → бросок (анимация 2d6) → исход →
 * следующий узел, либо запуск сценарного боя (battle-store) с возвратом.
 * Награды движок накапливает, стор проводит их в meta.
 */
import { defineStore } from 'pinia';
import { StoryEngine, type StoryAwards } from '@/game/StoryEngine';
import { ACT1_NODES, ACT1_START, ACT1_SCENES } from '@/data/story/act1';
import { ACT2_NODES, ACT2_START, ACT2_SCENES } from '@/data/story/act2';
import { useMetaStore } from '@/stores/meta';
import { useBattleStore } from '@/stores/battle';
import { useUiStore } from '@/stores/ui';
import { eventBus } from '@/core/EventBus';
import { getEnemyDefinition } from '@/game/EnemyFactory';
import type { CombatStats } from '@/types';
import { STORY_STAT_NAMES, type RollResult, type StoryChoice } from '@/types/story';

/** Узлы-чекпоинты: вход сюда сохраняет прогресс акта (смерть вернёт сюда). */
const CHECKPOINT_NODES = new Set(['hall', 'boss_intro']);

export const CHECKPOINT_LABELS: Record<string, string> = {
  hall: 'Зал Суда',
  boss_intro: 'Порог Тени',
};

export const useStoryStore = defineStore('story', {
  state: () => ({
    engine: null as StoryEngine | null,
    /** Снимок для UI */
    nodeId: '',
    speaker: '' as string,
    paragraphs: [] as string[],
    choices: [] as Array<{ text: string; check?: { stat: string; statName: string; dc: number; chance: number } }>,
    stats: {} as Record<string, number>,
    effects: [] as Array<{ id: string; name: string; icon: string; desc: string }>,
    /** Фаза броска: показываем анимацию, ждём подтверждения */
    rollResult: null as RollResult | null,
    /** Текст исхода (после броска/выбора) — показывается перед переходом */
    outcomeText: null as string | null,
    /** Выбор и ветка, ожидающие применения после показа броска/исхода */
    pendingChoice: null as StoryChoice | null,
    pendingBranch: 'success' as 'success' | 'fail',
    /** Внутренний выбор по индексу видимых (для продолжения после боя) */
    pendingIndex: -1,
    /** Исход запускает бой: ждём подтверждения игрока («Сразиться») */
    pendingBattleEnemies: null as string[] | null,
    actActive: false,
    /** Души, собранные за текущий акт (для финального экрана) */
    actSouls: 0,
    /** Какой акт сейчас активен (1 или 2) */
    actId: 1 as 1 | 2,
    /** Акт, который запустится после выбора класса */
    pendingActId: 1 as 1 | 2,
  }),

  actions: {
    /** Начать Акт 1. resume=true — продолжить с чекпоинта (если он есть). */
    startAct1(resume = false): void {
      this.launchAct(1, resume);
    },

    /** Начать Акт 2 (после победы над Актом 1). */
    startAct2(resume = false): void {
      this.launchAct(2, resume);
    },

    /** Общий запуск акта: движок + чекпоинты + UI. */
    launchAct(actId: 1 | 2, resume: boolean): void {
      const meta = useMetaStore();
      const nodes = actId === 1 ? ACT1_NODES : ACT2_NODES;
      const startNode = actId === 1 ? ACT1_START : ACT2_START;
      const sceneScopes = actId === 1 ? ACT1_SCENES : ACT2_SCENES;

      const engine = new StoryEngine({ nodes, startNode, sceneScopes });
      let restored = false;
      if (resume && meta.storyCheckpoint) {
        const cpNode = meta.storyCheckpoint.nodeId;
        if (nodes[cpNode]) {
          restored = engine.restore(meta.storyCheckpoint);
        }
      }
      if (!restored) {
        meta.storyCheckpoint = null;
        // Переносим статы из предыдущего акта (Акт 2 наследует Акт 1)
        if (actId > 1 && Object.keys(meta.storyStats).length > 0) {
          for (const [k, v] of Object.entries(meta.storyStats)) {
            engine.stats[k as keyof typeof engine.stats] = v;
          }
        }
        // Бонус Алтаря: боевые ветви дают story-статы (уровень 3+ → +1, 7+ → +2)
        const altarBonus = this.altarStoryBonus(meta.skills);
        for (const [k, v] of Object.entries(altarBonus)) {
          engine.stats[k as keyof typeof engine.stats] += v;
        }
      }
      this.engine = engine;
      this.actId = actId;
      this.actActive = true;
      this.actSouls = 0;
      this.rollResult = null;
      this.outcomeText = null;
      this.pendingChoice = null;
      this.pendingBattleEnemies = null;
      useUiStore().setScreen('story');
      this.loadNode();
    },

    /** Сбросить чекпоинт (кнопка «начать заново»). */
    discardCheckpoint(): void {
      useMetaStore().storyCheckpoint = null;
    },

    /** Открыть экран выбора класса (только для Акта 1 — новый ран). */
    openClassSelect(actId: 1 | 2 = 1): void {
      this.pendingActId = actId;
      // Акт 2 — сразу старт, класс уже выбран в Акте 1
      if (actId === 2) {
        this.startAct2(false);
        return;
      }
      useUiStore().setScreen('class_select');
    },

    cancelClassSelect(): void {
      useUiStore().setScreen('hub');
    },

    /**
     * Начать акт с выбранным классом: статы + карта сразу в колоду.
     * Акт определяется pendingActId (1 или 2).
     */
    startWithClass(classId: 'warden' | 'priest' | 'wanderer' | 'heretic' | 'blank'): void {
      const meta = useMetaStore();
      const actId = this.pendingActId;
      const nodes = actId === 1 ? ACT1_NODES : ACT2_NODES;
      const startNode = actId === 1 ? ACT1_START : ACT2_START;
      const engine = new StoryEngine({ nodes, startNode });

      const CLASS_DATA: Record<string, { stats: Partial<Record<string, number>>; card: string }> = {
        warden: { stats: { strength: 2 }, card: 'warden_blade' },
        priest: { stats: { intellect: 2 }, card: 'ash_word' },
        wanderer: { stats: { memory: 2 }, card: 'ash_trace' },
        heretic: { stats: { wrath: 2 }, card: 'heresy' },
        blank: {
          stats: { strength: 1, intellect: 1, memory: 1, resolve: 1, sincerity: 1, wrath: 1 },
          card: 'void_card',
        },
      };
      const data = CLASS_DATA[classId];
      if (data) {
        for (const [k, v] of Object.entries(data.stats)) {
          engine.stats[k as keyof typeof engine.stats] += v ?? 0;
        }
        meta.grantCard(data.card);
        const card = meta.collection[meta.collection.length - 1];
        if (card && card.defId === data.card && !meta.deckUids.includes(card.uid)) {
          meta.deckUids.push(card.uid);
        }
      }
      // Бонус Алтаря действует и на новые раны Акта 1 (межпрогоновая прогрессия)
      const altarBonus = this.altarStoryBonus(meta.skills);
      for (const [k, v] of Object.entries(altarBonus)) {
        engine.stats[k as keyof typeof engine.stats] += v;
      }

      this.engine = engine;
      this.actId = actId;
      this.actActive = true;
      this.actSouls = 0;
      this.rollResult = null;
      this.outcomeText = null;
      this.pendingChoice = null;
      this.pendingBattleEnemies = null;
      useUiStore().setScreen('story');
      // Акт 1: старт с Коридора (классовый экран заменяет Колумбарий)
      // Акт 2: старт с city_gate
      engine.goTo(actId === 1 ? 'corridor' : ACT2_START);
      this.loadNode();
    },

    /** Загрузить текущий узел движка в снапшот (проворот autoNext-цепочек). */
    loadNode(): void {
      const e = this.engine;
      if (!e) return;
      // Синхронизируем ресурсы для requires-фильтра (Рынок)
      const meta = useMetaStore();
      e.playerSouls = meta.souls;
      e.playerAshShards = meta.ashShards;
      // автопереходы без выбора прокручиваем сразу
      let guard = 0;
      while (e.advanceAuto() && guard++ < 10) {
        if (e.actFinished) break;
      }
      // Чекпоинт: вход в ключевой узел сохраняет прогресс
      if (CHECKPOINT_NODES.has(e.currentNodeId)) {
        useMetaStore().storyCheckpoint = e.snapshot();
      }
      this.nodeId = e.currentNodeId;
      this.speaker = e.node.speaker ?? '';
      this.paragraphs = [...e.node.text];
      this.choices = e.visibleChoices().map((c) => ({
        text: c.text,
        check: c.check
          ? {
              stat: c.check.stat,
              statName: STORY_STAT_NAMES[c.check.stat],
              dc: c.check.dc,
              chance: e.chanceFor(c.check),
            }
          : undefined,
      }));
      this.stats = { ...e.stats } as Record<string, number>;
      this.effects = e.effects.map((x) => ({ id: x.id, name: x.name, icon: x.icon, desc: x.desc }));
    },

    /** Клик по выбору: с проверкой — бросок, без — сразу исход. */
    pickChoice(index: number): void {
      const e = this.engine;
      if (!e || this.rollResult || this.outcomeText) return;
      const choice = e.visibleChoices()[index];
      if (!choice) return;

      if (choice.check) {
        this.pendingChoice = choice;
        this.pendingIndex = index;
        this.rollResult = e.roll(choice.check);
        return;
      }
      this.pendingChoice = choice;
      this.pendingIndex = index;
      this.pendingBranch = 'success';
      this.finishChoice();
    },

    /** Подтверждение после анимации броска. */
    confirmRoll(): void {
      if (!this.rollResult || !this.pendingChoice) return;
      this.pendingBranch = this.rollResult.success ? 'success' : 'fail';
      // Прокачка: успешная проверка → +1 к стату (в духе Disco Elysium)
      if (this.rollResult.success && this.engine) {
        this.engine.stats[this.rollResult.stat] += 1;
        eventBus.emit('log:message', {
          text: `${STORY_STAT_NAMES[this.rollResult.stat]} растёт (+1)`,
          kind: 'state',
        });
      }
      this.rollResult = null;
      this.finishChoice();
    },

    /** Применить исход: награды → текст исхода → узел/бой. */
    finishChoice(): void {
      const e = this.engine;
      const choice = this.pendingChoice;
      if (!e || !choice) return;

      const outcome = this.pendingBranch === 'success' || !choice.fail ? choice.success : choice.fail;
      const nextNode = e.applyOutcome(choice, this.pendingBranch);
      this.conductAwards(e.takeAwards());

      // Исход запускает бой: ждём подтверждения игрока («Сразиться»)
      if (outcome.battle) {
        this.outcomeText = outcome.text ?? 'Бой неизбежен.';
        this.pendingBattleEnemies = outcome.battle.enemies;
        return;
      }
      this.outcomeText = outcome.text ?? null;
      this.pendingChoice = null;
      if (nextNode) {
        this.deferredGoTo(nextNode);
        // Терминальный узел без текста исхода — завершаем акт сразу
        // (иначе игрок зависает без кнопки «Продолжить»)
        if (this.engine?.actFinished && !this.outcomeText) {
          this.completeAct();
        }
      }
    },

    /** Сценарный бой завершён (вызывает battle-store через UI). */
    onStoryBattleEnd(result: 'victory' | 'spared' | 'defeat'): void {
      const e = this.engine;
      if (!e || !this.pendingChoice) return;
      if (result === 'defeat') {
        // Смерть: акт сбрасывается к последнему чекпоинту (кнопка в хабе)
        this.actActive = false;
        this.engine = null;
        useUiStore().setScreen('hub');
        return;
      }
      const choice = this.pendingChoice;
      const nextNode = e.applyBattleResult(choice, this.pendingBranch, result);
      this.pendingChoice = null;
      this.conductAwards(e.takeAwards());
      this.outcomeText = null;
      useUiStore().setScreen('story');
      this.deferredGoTo(nextNode);
    },

    /** Перейти на узел после закрытия панели исхода (либо сразу, если текста нет). */
    deferredGoTo(nodeId: string): void {
      this.engine?.goTo(nodeId);
      this.loadNode();
      if (this.engine?.actFinished) {
        this.actActive = false;
      }
    },

    /** Бонусные story-статы из боевых ветвей Алтаря (3 уровня → +1, 7 → +2). */
    altarStoryBonus(skills: Record<string, number>): Record<string, number> {
      const bonus: Record<string, number> = {};
      const MAP: Array<[string, string]> = [
        ['strength', 'strength'],      // боевая Сила → story Сила
        ['intellect', 'intellect'],    // боевая Интеллект → story Интеллект
        ['dexterity', 'resolve'],      // Ловкость → Упорство
        ['endurance', 'sincerity'],    // Выносливость → Искренность
        ['spirit', 'wrath'],           // Дух → Гнев
      ];
      for (const [branchId, statId] of MAP) {
        const lvl = skills[branchId] ?? 0;
        if (lvl >= 7) bonus[statId] = (bonus[statId] ?? 0) + 2;
        else if (lvl >= 3) bonus[statId] = (bonus[statId] ?? 0) + 1;
      }
      // Память — от суммарного уровня всех ветвей (опыт = память)
      const total = Object.values(skills).reduce((a, b) => a + b, 0);
      if (total >= 25) bonus.memory = (bonus.memory ?? 0) + 2;
      else if (total >= 12) bonus.memory = (bonus.memory ?? 0) + 1;
      return bonus;
    },

    /** Завершение акта: флаги, чекпоинт, перенос статов, финальный экран. */
    completeAct(): void {
      const engine = this.engine;
      if (!engine) return;
      const meta = useMetaStore();
      // Сохраняем статы для следующего акта
      meta.storyStats = { ...engine.stats };
      this.engine = null;
      this.actActive = false;
      const ui = useUiStore();
      if (engine.flags.has('act1_done')) {
        meta.storyCheckpoint = null;
        meta.actsCompleted = Math.max(meta.actsCompleted, 1);
        ui.setScreen('act_complete');
      } else if (engine.flags.has('act2_done')) {
        meta.storyCheckpoint = null;
        meta.actsCompleted = Math.max(meta.actsCompleted, 2);
        ui.setScreen('act_complete');
      } else {
        ui.setScreen('hub');
      }
    },

    /** Закрыть текст исхода и продолжить (или вступить в бой). */
    dismissOutcome(): void {
      // Исход запускал бой — стартуем после подтверждения
      if (this.pendingBattleEnemies) {
        const enemies = this.pendingBattleEnemies;
        this.pendingBattleEnemies = null;
        this.outcomeText = null;
        useBattleStore().startStoryBattle(enemies, this.combatBonusFor(enemies));
        return;
      }
      this.outcomeText = null;
      if (this.engine?.actFinished) {
        this.completeAct();
      }
    },

    /** Эффекты акта → боевые модификаторы (Связь, Обет). */
    combatBonusFor(defIds: string[]): Partial<CombatStats> {
      const bonus: Partial<CombatStats> = {};
      const ids = (this.engine?.effects ?? []).map((e) => e.id);
      const isBoss = defIds.some((id) => getEnemyDefinition(id).boss);
      if (ids.includes('bond')) bonus.surviveLethalOnce = true;
      if (ids.includes('vow') && isBoss) bonus.bonusDamage = 2;
      return bonus;
    },

    /** Награды движка → профиль игрока. */
    conductAwards(a: StoryAwards): void {
      if (a.souls === 0 && a.cards.length === 0 && a.essences === 0 && a.ashShards === 0 && a.lore.length === 0) return;
      const meta = useMetaStore();
      if (a.souls !== 0) {
        // Защита от минуса: не списываем больше чем есть
        const actualSouls = a.souls < 0 ? Math.max(a.souls, -meta.souls) : a.souls;
        meta.souls += actualSouls;
        if (actualSouls > 0) {
          meta.stats.soulsEarned += actualSouls;
          this.actSouls += actualSouls;
        }
      }
      if (a.essences > 0) meta.essences += a.essences;
      if (a.ashShards !== 0) {
        const actualShards = a.ashShards < 0 ? Math.max(a.ashShards, -meta.ashShards) : a.ashShards;
        meta.ashShards += actualShards;
      }
      for (const defId of a.cards) meta.grantCard(defId);
      for (const loreId of a.lore) {
        if (!meta.lore.includes(loreId)) meta.lore.push(loreId);
      }
      eventBus.emit('log:message', {
        text: `Получено: ${a.souls > 0 ? `${a.souls} душ ` : ''}${a.essences ? `· ${a.essences} эссенций ` : ''}${a.ashShards !== 0 ? `· ${a.ashShards > 0 ? '+' : ''}${a.ashShards} осколков ` : ''}${a.cards.length ? `· карт: ${a.cards.length}` : ''}`.trim(),
        kind: 'info',
      });
    },
  },
});
