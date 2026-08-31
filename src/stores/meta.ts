/**
 * meta-store — мета-прогресс игрока: ресурсы, коллекция карт, колода,
 * дерево навыков, статистика, лор. Единственный владелец персистентности
 * (Repository pattern): Electron IPC (gameStorage) с fallback на localStorage
 * для чистого браузерного dev-режима.
 */
import { defineStore } from 'pinia';
import { BALANCE } from '@/core/config';
import { createCard, syncUidCounter } from '@/game/CardFactory';
import { BRANCHES, computeCombatStats, nextNode } from '@/data/skills';
import { LORE, type LoreStats } from '@/data/lore';
import { CRAFT_POOL } from '@/data/cards';
import type { BranchId, CardInstance, CardType, CombatStats, EnemyDefinition } from '@/types';

const SAVE_SLOT = 'profile';
const LS_KEY = 'eotf:profile';

/** Сериализуемая часть профиля (то, что лежит в сейве). */
export interface ProfileData {
  version: 1;
  souls: number;
  essences: number;
  collection: CardInstance[];
  deckUids: string[];
  /** 3 слота пресетов колод (null — пусто) */
  presets: (string[] | null)[];
  skills: Record<BranchId, number>;
  stats: { battles: number; victories: number; deaths: number; enemiesSlain: number; soulsEarned: number };
  lore: string[];
  /** Глубина похода: растёт с каждой победой, сбрасывается смертью */
  progress: { depth: number };
  /** Чекпоинт Акта 1 (узел + флаги + статы): смерть возвращает сюда */
  storyCheckpoint: import('@/game/StoryEngine').StorySnapshot | null;
  /** Пепельные осколки — актовая валюта Акта 2 (Рынок, крафт) */
  ashShards: number;
  /** Сколько актов пройдено (1 = Акт I done, 2 = Акт II done) */
  actsCompleted: number;
  /** Туториал первого боя показан */
  tutorialDone: boolean;
  /** Звук выключен (M / кнопка) */
  audioMuted: boolean;
}

function freshProfile(): ProfileData {
  // Стартовая коллекция = 10 базовых карт, все сразу в колоде
  const base = BALANCE.player.startingDeck.map((id) => createCard(id));
  return {
    version: 1,
    souls: 0,
    essences: 0,
    collection: base,
    deckUids: base.map((c) => c.uid),
    presets: [null, null, null],
    skills: { strength: 0, dexterity: 0, intellect: 0, endurance: 0, spirit: 0 },
    stats: { battles: 0, victories: 0, deaths: 0, enemiesSlain: 0, soulsEarned: 0 },
    lore: [],
    progress: { depth: 1 },
    storyCheckpoint: null,
    ashShards: 0,
    actsCompleted: 0,
    tutorialDone: false,
    audioMuted: false,
  };
}

export interface BattleReward {
  souls: number;
  essence: number;
}

export const useMetaStore = defineStore('meta', {
  state: (): ProfileData => freshProfile(),

  getters: {
    /** Карты активной колоды (в порядке uids). */
    activeDeckCards(state): CardInstance[] {
      const byUid = new Map(state.collection.map((c) => [c.uid, c]));
      return state.deckUids.map((uid) => byUid.get(uid)).filter((c): c is CardInstance => Boolean(c));
    },
    /** Агрегированные боевые статы из дерева навыков. */
    combatStats(state): CombatStats {
      return computeCombatStats(state.skills);
    },
    totalSkillLevels(state): number {
      return Object.values(state.skills).reduce((a, b) => a + b, 0);
    },
    /** Есть ли прогресс для «Продолжить» в главном меню. */
    hasProgress(): boolean {
      return (
        this.souls > 0 ||
        this.collection.length > 10 ||
        this.totalSkillLevels > 0 ||
        this.storyCheckpoint !== null
      );
    },
  },

  actions: {
    /** Загрузка профиля при старте приложения (до mount). */
    async init(): Promise<void> {
      let loaded: Partial<ProfileData> | null = null;
      try {
        if (window.gameStorage) {
          loaded = (await window.gameStorage.load(SAVE_SLOT)) as Partial<ProfileData> | null;
        } else {
          const raw = localStorage.getItem(LS_KEY);
          loaded = raw ? (JSON.parse(raw) as Partial<ProfileData>) : null;
        }
      } catch (e) {
        console.error('Failed to load profile, starting fresh', e);
      }
      if (loaded && loaded.version === 1) {
        this.$patch(loaded);
        syncUidCounter(this.collection);
      }
      // Любое дальнейшее изменение → автосохранение
      this.$subscribe(() => void this.persist());
    },

    async persist(): Promise<void> {
      try {
        if (window.gameStorage) {
          await window.gameStorage.save(SAVE_SLOT, this.$state as ProfileData);
        } else {
          localStorage.setItem(LS_KEY, JSON.stringify(this.$state));
        }
      } catch (e) {
        console.error('Failed to persist profile', e);
      }
    },

    // ==================== Награды за бой ====================

    /** Начислить награду за победу. Вызывается battle-store один раз за бой. */
    onVictory(enemyDef: EnemyDefinition): BattleReward {
      const souls = Math.round(enemyDef.soulsDrop * (1 + this.combatStats.soulsBonusPct / 100));
      const essence = Math.random() < enemyDef.essenceChance ? 1 : 0;
      this.souls += souls;
      this.essences += essence;
      this.stats.battles += 1;
      this.stats.victories += 1;
      this.stats.enemiesSlain += 1;
      this.stats.soulsEarned += souls;
      // Победа углубляет поход
      this.progress.depth += 1;
      this.checkLoreUnlocks();
      return { souls, essence };
    },

    onDefeat(): void {
      this.stats.battles += 1;
      this.stats.deaths += 1;
      // Смерть возвращает к началу похода (метапрогресс хаба сохраняется)
      this.progress.depth = 1;
      this.checkLoreUnlocks();
    },

    checkLoreUnlocks(): void {
      const s: LoreStats = this.stats;
      for (const frag of LORE) {
        if (!this.lore.includes(frag.id) && frag.unlock(s)) {
          this.lore.push(frag.id);
        }
      }
    },

    /** Полный сброс профиля («Новая игра» в меню). */
    resetProfile(): void {
      this.$patch(freshProfile());
    },

    // ==================== Алтарь душ ====================

    /** Изучить следующий уровень ветви. Возвращает false при нехватке душ/максимуме. */
    learnSkill(branch: BranchId): boolean {
      const node = nextNode(branch, this.skills[branch]);
      if (!node || this.souls < node.cost) return false;
      this.souls -= node.cost;
      this.skills[branch] += 1;
      return true;
    },

    // ==================== Кузница ====================

    /** Улучшить карту в коллекции. Максимум — 5 уровней (см. CardFactory). */
    upgradeCard(uid: string): boolean {
      const card = this.collection.find((c) => c.uid === uid);
      if (!card || card.upgradeLevel >= 5) return false;
      const cost = BALANCE.hub.upgradeBaseCost * (card.upgradeLevel + 1);
      if (this.souls < cost) return false;
      this.souls -= cost;
      card.upgradeLevel += 1;
      return true;
    },

    upgradeCost(uid: string): number {
      const card = this.collection.find((c) => c.uid === uid);
      if (!card) return 0;
      return BALANCE.hub.upgradeBaseCost * (card.upgradeLevel + 1);
    },

    // ==================== Мастерская ====================

    /** Можно ли платить за крафт. */
    canAffordCraft(): boolean {
      return this.souls >= BALANCE.hub.craftSoulCost && this.essences >= BALANCE.hub.craftEssenceCost;
    },

    /** 3 случайных варианта карт выбранного типа. */
    rollCraftOptions(type: CardType): string[] {
      const pool = CRAFT_POOL[type as keyof typeof CRAFT_POOL] ?? [];
      const picked = new Set<string>();
      while (picked.size < Math.min(3, pool.length)) {
        picked.add(pool[Math.floor(Math.random() * pool.length)]!);
      }
      return [...picked];
    },

    /** Создать карту (выбранный вариант из 3). */
    craftCard(defId: string): boolean {
      if (!this.canAffordCraft()) return false;
      this.souls -= BALANCE.hub.craftSoulCost;
      this.essences -= BALANCE.hub.craftEssenceCost;
      const card = createCard(defId);
      this.collection.push(card);
      // Новая карта сразу доступна для добавления в колоду (но не добавляется автоматически)
      return true;
    },

    /** Бесплатно добавить карту в коллекцию (сюжетные награды, стартовый класс). */
    grantCard(defId: string): void {
      this.collection.push(createCard(defId));
    },

    // ==================== Хранилище ====================

    /** Добавить/убрать карту из активной колоды. */
    toggleDeckCard(uid: string): boolean {
      const inDeck = this.deckUids.includes(uid);
      if (inDeck) {
        // Нельзя опуститься ниже минимума
        if (this.deckUids.length <= BALANCE.hub.minDeck) return false;
        this.deckUids = this.deckUids.filter((u) => u !== uid);
        return true;
      }
      if (this.deckUids.length >= BALANCE.hub.maxDeck) return false;
      this.deckUids.push(uid);
      return true;
    },

    savePreset(slot: number): void {
      this.presets[slot] = [...this.deckUids];
    },

    loadPreset(slot: number): void {
      const preset = this.presets[slot];
      if (!preset) return;
      // Валидация: пресет может ссылаться на удалённые карты
      const owned = new Set(this.collection.map((c) => c.uid));
      this.deckUids = preset.filter((u) => owned.has(u));
    },
  },
});

/** Для UI: локализованные названия ветвей дерева (синоним данных skills.ts). */
export const SKILL_BRANCHES = BRANCHES;
