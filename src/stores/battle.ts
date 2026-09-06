/**
 * battle-store — реактивная обёртка над BattleEngine для Vue.
 * Движок — источник истины; стор после каждого действия делает снапшот
 * (дёшево: копируем только то, что рендерит UI).
 *
 * Ход врага исполняется ПОШАГОВО через setTimeout, чтобы Phaser/Vue успевали
 * показывать анимации урона — но каждый шаг детерминирован движком.
 */
import { defineStore } from 'pinia';
import { BALANCE } from '@/core/config';
import { eventBus } from '@/core/EventBus';
import { BattleEngine, type BattlePhase, type EnemyStep } from '@/game/BattleEngine';
import { getCardDefinition, cardCost } from '@/game/CardFactory';
import { CLASSES } from '@/data/classes';
import { useMetaStore, type BattleReward } from '@/stores/meta';
import { useUiStore } from '@/stores/ui';
import type { RunModifiers } from '@/stores/trial';
import type { CardInstance, CardType, Combatant, EnemyDefinition, EnemyIntent, StateInstance } from '@/types';

/** UI-представление карты в руке (definition + instance слиты для рендера). */
export interface HandCardView {
  uid: string;
  defId: string;
  name: string;
  type: CardType;
  cost: number;
  description: string;
  rarity: string;
  upgradeLevel: number;
  playable: boolean;
}

const ENEMY_STEP_MS = 750;

/** UI-представление врага (слота) для панели списка. */
export interface EnemyView {
  id: string;
  defId: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  block: number;
  states: StateInstance[];
  intent: EnemyIntent;
  isBoss: boolean;
  isAlive: boolean;
}

export const useBattleStore = defineStore('battle', {
  state: () => ({
    engine: null as BattleEngine | null,
    phase: 'player' as BattlePhase,
    turn: 0,
    energy: 0,
    maxEnergy: BALANCE.player.energyPerTurn,
    player: null as Combatant | null,
    /** Список врагов (мульти-враг); мёртвые — с isAlive=false */
    enemies: [] as EnemyView[],
    /** Выбранная цель атак (id слота); null → первый живой */
    selectedTargetId: null as string | null,
    hand: [] as HandCardView[],
    drawCount: 0,
    discardCount: 0,
    battleLog: [] as { text: string; kind: string }[],
    busy: false, // ход врага анимируется — блокируем ввод
    /** Награда начислена один раз за бой */
    rewarded: false,
    lastReward: null as BattleReward | null,
    currentEnemyDefs: [] as EnemyDefinition[],
    enemyLevel: 1,
    enemyPhaseName: null as string | null,
    isBossFight: false,
    /** Бой запущен из похода (результат вернётся в trial-store) */
    trialMode: false,
    /** Смерть в походном бою уже обработана (сброс глубины) */
    deathHandled: false,
    /** Поколение хода врага: инкремент обрывает шаги, оставшиеся от старого боя */
    turnSeq: 0,
  }),

  getters: {
    isPlayerTurn: (s): boolean => s.phase === 'player' && !s.busy,
    battleOver: (s): boolean => s.phase === 'victory' || s.phase === 'defeat' || s.phase === 'spared',
    aliveEnemies: (s): EnemyView[] => s.enemies.filter((e) => e.isAlive),
    /** Основной враг для совместимости (первый живой). */
    enemy(): EnemyView | null {
      return this.aliveEnemies[0] ?? this.enemies[0] ?? null;
    },
    /** Доступна ли пощада (враг «склонился» ниже порога) */
    mercyAvailable(): boolean {
      return this.isPlayerTurn && Boolean(this.engine?.mercyAvailable());
    },
  },

  actions: {
    /**
     * Походный бой: походная колода + сохранение HP между узлами.
     * Награды начисляет trial-store, не meta напрямую.
     */
    startTrialBattle(
      defs: EnemyDefinition[],
      deck: CardInstance[],
      currentHp: number,
      maxHp: number,
      _isElite: boolean,
      dmgBonus: number,
      runMods?: RunModifiers,
    ): void {
      const meta = useMetaStore();
      const ui = useUiStore();

      this.currentEnemyDefs = defs;
      this.rewarded = true; // награда через trial-store
      this.deathHandled = false;
      this.turnSeq += 1; // шаги старого боя больше не тикают
      this.lastReward = null;
      this.trialMode = true;
      this.selectedTargetId = null;
      this.enemyLevel = defs[0]?.level ?? 1;
      this.isBossFight = defs.some((d) => d.boss);
      this.enemyPhaseName = defs[0]?.boss?.phases[0]?.name ?? null;

      // Движок с походным HP и колодой + дар класса + модификаторы похода
      const base = meta.combatStats;
      const stats = {
        ...base,
        maxHpBonus: maxHp - BALANCE.player.maxHp,
        startBlock: base.startBlock + (runMods?.startBlock ?? 0),
        cardsPerTurnBonus: base.cardsPerTurnBonus + (runMods?.cardsPerTurnBonus ?? 0),
        healMultBonus: base.healMultBonus + (runMods?.healMultBonus ?? 0),
      };
      const gift = meta.giftLevel > 0
        ? { id: CLASSES[meta.classId].gift.id, level: meta.giftLevel }
        : undefined;
      const engine = new BattleEngine(BALANCE.player.maxHp, deck, defs, stats, dmgBonus, gift);
      engine.player.hp = currentHp; // сохранение HP между боями
      this.engine = engine;
      this.battleLog = [];
      this.pushLog(`Из пепла восстаёт ${defs.map((d) => d.name).join(', ')}...`, 'info');
      engine.start();
      ui.setScreen('battle');
      this.sync();
    },

    /** Выбрать цель атак (клик по панели врага). */
    selectTarget(id: string): void {
      if (!this.engine) return;
      const slot = this.engine.enemySlots.find((s) => s.unit.id === id && s.unit.hp > 0);
      if (slot) {
        this.selectedTargetId = id;
        eventBus.emit('battle:targetSelected', { targetId: id });
      }
    },

    playCard(uid: string): void {
      if (!this.isPlayerTurn || !this.engine) return;
      const target = this.selectedTargetId ?? undefined;
      const ok = this.engine.playCard(uid, target);
      if (ok) {
        const card = this.hand.find((c) => c.uid === uid);
        if (card) this.pushLog(`Вы играете «${card.name}»`, 'info');
      }
      this.sync();
    },

    /** Пощадить «склонившегося» врага (бой завершится исходом 'spared'). */
    spareEnemy(): void {
      if (!this.isPlayerTurn || !this.engine) return;
      this.engine.spareEnemy();
      this.sync();
    },

    endTurn(): void {
      if (!this.isPlayerTurn || !this.engine) return;
      this.engine.endPlayerTurn();
      this.sync();
      if (this.engine.phase === 'enemy') void this.runEnemyTurn();
      else this.sync();
    },

    /** Пошаговое исполнение плана врага с паузами под анимации.
     *  Поколение turnSeq обрывает цикл, если бой сменился/вышли посреди хода. */
    async runEnemyTurn(): Promise<void> {
      const engine = this.engine;
      if (!engine) return;
      const seq = ++this.turnSeq;
      this.busy = true;
      try {
        const steps: EnemyStep[] = engine.beginEnemyTurn();
        this.sync();

        for (const step of steps) {
          // Пустые шаги не паузим: pass и карты мёртвых слотов пропускаем
          // мгновенно — иначе ход врага выглядит зависанием
          if (step.kind === 'pass') continue;
          const slot = engine.enemySlots[step.enemyIndex];
          if (!slot || slot.unit.hp <= 0) continue;

          await sleep(this.enemyStepMs());
          if (seq !== this.turnSeq) return; // бой уже неактуален
          engine.executeEnemyStep(step);
          const cardName = getCardDefinition(step.card.defId).name;
          this.pushLog(`${slot.unit.name} применяет «${cardName}»`, 'damage');
          this.sync();
          if (engine.phase !== 'enemy') break; // бой закончился посреди хода врага
        }

        if (engine.phase === 'enemy') {
          await sleep(this.enemyStepMs());
          if (seq !== this.turnSeq) return;
          engine.finishEnemyTurn();
          this.pushLog('Ваш ход', 'info');
        }
      } catch (e) {
        // VFX-ошибка не должна намертво вешать ход: логируем и отдаём ход игроку
        console.error('[battle] enemy turn failed', e);
        if (engine.phase === 'enemy') {
          engine.finishEnemyTurn();
        }
      } finally {
        if (seq === this.turnSeq) {
          this.busy = false;
          this.sync();
        }
      }
    },

    /** Длительность шага анимации хода врага (настраивается «быстрые анимации»). */
    enemyStepMs(): number {
      const meta = useMetaStore();
      return meta.fastAnimations ? 320 : ENEMY_STEP_MS;
    },

    /** Оборвать анимацию хода врага (выход из боя/смена экрана). */
    abortEnemyTurn(): void {
      this.turnSeq += 1;
      this.busy = false;
    },

    /** Пересобрать UI-снапшот из движка. */
    sync(): void {
      const e = this.engine;
      if (!e) return;
      this.phase = e.phase;
      this.turn = e.turn;
      this.energy = e.energy;
      this.player = { ...e.player, states: [...e.player.states] };
      this.drawCount = e.drawPile.length;
      this.discardCount = e.discardPile.length;
      this.enemies = e.enemySlots.map((slot) => ({
        id: slot.unit.id,
        defId: slot.def.id,
        name: slot.unit.name,
        level: slot.def.level,
        hp: slot.unit.hp,
        maxHp: slot.unit.maxHp,
        block: slot.unit.block,
        states: [...slot.unit.states],
        intent: slot.intent,
        isBoss: Boolean(slot.def.boss),
        isAlive: slot.unit.hp > 0,
      }));
      // Цель по умолчанию — первый живой; сброс, если выбранная цель умерла
      const aliveIds = new Set(this.enemies.filter((x) => x.isAlive).map((x) => x.id));
      if (this.selectedTargetId && !aliveIds.has(this.selectedTargetId)) {
        this.selectedTargetId = null;
      }
      this.enemyLevel = e.enemyLevel;
      this.enemyPhaseName = e.bossPhaseName;
      this.isBossFight = e.enemySlots.some((s) => s.def.boss);
      this.hand = e.hand.map((c) => {
        const def = getCardDefinition(c.defId);
        return {
          uid: c.uid,
          defId: c.defId,
          name: def.name,
          type: def.type,
          cost: cardCost(c),
          description: def.description,
          rarity: def.rarity,
          upgradeLevel: c.upgradeLevel,
          // проклятые карты неиграбельны — портят руку мёртвым весом
          playable: this.isPlayerTurn && !def.curse && cardCost(c) <= e.energy,
        };
      });

      // Начисление награды — ровно один раз в момент завершения боя
      if (this.phase === 'victory' || this.phase === 'defeat') {
        if (!this.rewarded) {
          this.rewarded = true;
          const meta = useMetaStore();
          if (this.phase === 'victory' && this.currentEnemyDefs.length > 0) {
            this.lastReward = meta.onVictory(this.currentEnemyDefs[0]!);
          } else {
            meta.onDefeat();
          }
        } else if (this.phase === 'defeat' && !this.deathHandled) {
          // Походный бой: наград нет, но смерть есть смерть — сброс глубины
          this.deathHandled = true;
          useMetaStore().onDefeat();
        }
      }
    },

    pushLog(text: string, kind: string): void {
      this.battleLog.push({ text, kind });
      if (this.battleLog.length > 50) this.battleLog.shift();
    },
  },
});

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// Лог игровых событий → в боевой лог (подписка один раз при импорте стора в main.ts)
export function wireBattleLog(): void {
  eventBus.on('vfx:damage', ({ targetId, amount }) => {
    const store = useBattleStore();
    const name = targetId === 'player' ? 'Вы' : store.enemies.find((e) => e.id === targetId)?.name ?? 'Враг';
    store.pushLog(`${name}: −${amount} HP`, 'damage');
  });
  eventBus.on('vfx:heal', ({ amount }) => {
    const store = useBattleStore();
    store.pushLog(`Восстановлено ${amount} HP`, 'heal');
  });
  eventBus.on('vfx:state', ({ state, isNew, targetId }) => {
    if (!isNew) return;
    const store = useBattleStore();
    const who = targetId === 'player' ? 'На вас' : `На ${store.enemies.find((e) => e.id === targetId)?.name ?? 'враге'}`;
    store.pushLog(`${who}: ${stateName(state)}`, 'state');
  });
  eventBus.on('vfx:enemySpawned', ({ targetId, defId }) => {
    const store = useBattleStore();
    store.pushLog(`Призван ${defId} (${targetId})`, 'state');
  });
}

function stateName(s: StateInstance): string {
  const names: Record<string, string> = {
    burn: `Горение ${s.stacks}`,
    poison: `Гниль ${s.stacks}`,
    bleed: `Кровотечение ${s.stacks}`,
    blessing: `Милость ${s.stacks}`,
    fury: 'Ярость',
    vulnerable: 'Пробитая броня',
    heal_ban: 'Порча',
  };
  return names[s.type] ?? s.type;
}
