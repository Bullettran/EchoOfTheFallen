/**
 * trial-store — рогалик-режим «Испытания»:
 * походная колода (временная), HP между боями, карта узлов.
 * Смерть/выход → поход сгорает (карты и улучшения внутри рана не переносятся).
 */
import { defineStore } from 'pinia';
import { BALANCE } from '@/core/config';
import { useMetaStore } from '@/stores/meta';
import { useBattleStore } from '@/stores/battle';
import { useUiStore } from '@/stores/ui';
import { scaleEnemy } from '@/game/EnemyFactory';
import { createCard } from '@/game/CardFactory';
import { NORMAL_ENEMY_POOL, ELITE_ENEMY_POOL, BOSS_POOL } from '@/data/enemies';
import { CARDS, CRAFT_POOL } from '@/data/cards';
import { classCardPool } from '@/data/classes';
import type { TrialFloor, TrialNode, TrialNodeType } from '@/types/trial';
import type { CardInstance, RunModifiers } from '@/types';

export type { RunModifiers };

const ELITE_POOL = ELITE_ENEMY_POOL;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Мета узлов: иконка/имя для карты похода + подсказка «что делает»
 * (используется и генератором этажей, и TrialMapScreen).
 */
export const NODE_META: Record<TrialNodeType, { label: string; icon: string; desc: string }> = {
  battle: { label: 'Схватка', icon: '⚔️', desc: 'Бой с обычным врагом. Победа приносит души; HP переносятся на следующие узлы.' },
  elite: { label: 'Лютый враг', icon: '💀', desc: 'Усиленный враг. Победа: редкая карта в походную колоду и больше душ.' },
  event: { label: 'Находка', icon: '❓', desc: 'Встреча на пепелище: выбор одного из двух путей — души, лечение, реликвия или искушение.' },
  campfire: { label: 'Костёр', icon: '🔥', desc: 'Отдых у огня: +20 HP или улучшение одной карты (только на этот поход).' },
  shop: { label: 'Торговец', icon: '💰', desc: 'Покупка карт за души. Карты действуют только в этом походе.' },
  shrine: { label: 'Святыня', icon: '⚱', desc: 'Пепельная святыня: выбор одного из двух благословений — до конца похода.' },
  curse: { label: 'Тлен', icon: '☠', desc: 'Зловещее искушение: возьми проклятие и награду — или обходи стороной.' },
  boss: { label: 'БОСС', icon: '👑', desc: 'Король-Пепел. Победа: много душ, уголёк и редкая карта.' },
};

/** Модификаторы похода (действуют до конца рана; сливаются с статами класса в бою). */
const EMPTY_RUN_MODS: RunModifiers = {
  startBlock: 0,
  cardsPerTurnBonus: 0,
  healMultBonus: 0,
  soulsBonusPct: 0,
  enemyDmgBonus: 0,
};

type TrialStore = ReturnType<typeof useTrialStore>;

/** Благословение святыни: выбор одного из двух. */
export interface ShrineOption {
  id: string;
  name: string;
  desc: string;
  apply: (t: TrialStore) => void;
}

export const SHRINE_POOL: ShrineOption[] = [
  {
    id: 'vigor',
    name: 'Живучесть пепла',
    desc: '+12 к максимуму HP (и сразу +12 HP) — до конца похода',
    apply: (t) => {
      t.maxHp += 12;
      t.hp += 12;
    },
  },
  {
    id: 'ward',
    name: 'Оберег',
    desc: '+5 блока в начале каждого боя — до конца похода',
    apply: (t) => {
      t.runMods.startBlock += 5;
    },
  },
  {
    id: 'haste',
    name: 'Быстрая рука',
    desc: '+1 карта при доборе в начале каждого хода — до конца похода',
    apply: (t) => {
      t.runMods.cardsPerTurnBonus += 1;
    },
  },
  {
    id: 'greed',
    name: 'Жадность',
    desc: '+40% душ за все бои похода',
    apply: (t) => {
      t.runMods.soulsBonusPct += 40;
    },
  },
];

/** Искушение Тлена: проклятие + награда (можно отказаться). */
export interface CurseOption {
  id: string;
  name: string;
  desc: string;
  accept: (t: TrialStore) => void;
}

export const CURSE_POOL: CurseOption[] = [
  {
    id: 'blood_price',
    name: 'Кровавая цена',
    desc: '−10 к максимуму HP, но +80 душ',
    accept: (t) => {
      t.maxHp = Math.max(20, t.maxHp - 10);
      t.hp = Math.min(t.hp, t.maxHp);
      useMetaStore().souls += 80;
    },
  },
  {
    id: 'ash_eyes',
    name: 'Пепел в глазах',
    desc: 'Все враги похода бьют на +2 сильнее, но редкая карта в колоду',
    accept: (t) => {
      t.runMods.enemyDmgBonus += 2;
      const pool = Object.values(CRAFT_POOL).flat();
      if (pool.length > 0) t.deck.push(createCard(pool[Math.floor(Math.random() * pool.length)]!));
    },
  },
  {
    id: 'oath',
    name: 'Клятва пустого сосуда',
    desc: 'Исцеление в походе на 30% слабее, но +120 душ',
    accept: (t) => {
      t.runMods.healMultBonus -= 0.3;
      useMetaStore().souls += 120;
    },
  },
  {
    id: 'tainted_gift',
    name: 'Проклятая сделка',
    desc: 'Пепельная смола ляжет в твою колоду (−2 HP за копию в начале хода), но +150 душ и 2 редкие карты',
    accept: (t) => {
      t.deck.push(createCard('curse_tar'));
      const pool = Object.values(CRAFT_POOL).flat();
      for (let i = 0; i < 2 && pool.length > 0; i++) {
        t.deck.push(createCard(pool[Math.floor(Math.random() * pool.length)]!));
      }
      useMetaStore().souls += 150;
    },
  },
];

/** Два случайных различных благословения для святыни. */
export function rollShrineOptions(): ShrineOption[] {
  const pool = [...SHRINE_POOL];
  const out: ShrineOption[] = [];
  while (out.length < 2 && pool.length > 0) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  }
  return out;
}

/** Одно случайное искушение для узла Тлена. */
export function rollCurseOption(): CurseOption {
  return CURSE_POOL[Math.floor(Math.random() * CURSE_POOL.length)]!;
}

function makeNode(type: TrialNodeType, lane: number, data?: string): TrialNode {
  const m = NODE_META[type];
  return { id: `${type}_${Math.random().toString(36).slice(2, 8)}`, type, label: m.label, icon: m.icon, cleared: false, lane, data };
}

/**
 * Тип узла для этажа карты-графа:
 *   1-й — без элит/тлена; 3+ — элиты; 2+ — святыни и тлен;
 *   предбоссовый (14-й) — только отдых/торговец; 15-й — босс (единственный узел).
 */
function rollNodeType(floor: number): TrialNodeType {
  if (floor === BALANCE.progression.bossEveryDepth) return 'boss';
  if (floor === BALANCE.progression.bossEveryDepth - 1) return Math.random() < 0.6 ? 'campfire' : 'shop';
  const nonCombat: TrialNodeType[] = ['event', 'campfire', 'shop'];
  const r = Math.random();
  if (floor === 1) return Math.random() < 0.5 ? 'battle' : pick(nonCombat);
  if (r < 0.08) return 'shrine';
  if (r < 0.16) return 'curse';
  if (floor >= 3 && r < 0.34) return 'elite';
  if (r < 0.62) return 'battle';
  return pick(nonCombat);
}

/**
 * ВСЯ карта похода сразу (StS-лайк): этажи 1..15, узлы 2–4 на этаж,
 * рёбра-тропы без пересечений. Каждый узел следующего этажа достижим.
 */
function genMap(): TrialFloor[] {
  const bossFloor = BALANCE.progression.bossEveryDepth;
  const floors: TrialFloor[] = [];

  for (let f = 1; f <= bossFloor; f++) {
    const count = f === bossFloor ? 1 : 2 + Math.floor(Math.random() * 3); // 2..4
    const nodes: TrialNode[] = [];
    for (let lane = 0; lane < count; lane++) {
      const type = rollNodeType(f);
      const data = type === 'battle' ? pick(NORMAL_ENEMY_POOL) : type === 'elite' ? pick(ELITE_POOL) : type === 'boss' ? pick(BOSS_POOL) : undefined;
      nodes.push(makeNode(type, lane, data));
    }
    // 1-й этаж всегда содержит хотя бы один бой
    if (f === 1 && !nodes.some((n) => n.type === 'battle')) {
      nodes[Math.floor(Math.random() * nodes.length)] = makeNode('battle', 0, pick(NORMAL_ENEMY_POOL));
    }
    // Мини-босс середины: на eliteFloor хотя бы одна элита (по одному из двух)
    if (f === BALANCE.progression.eliteFloor && !nodes.some((n) => n.type === 'elite')) {
      nodes[Math.floor(Math.random() * nodes.length)] = makeNode('elite', 0, pick(ELITE_POOL));
    }
    // Боссу восстанавливаем lane 0
    if (f === bossFloor) nodes[0]!.lane = 0;
    floors.push({ floor: f, nodes, edges: [] });
  }

  // Рёбра: монотонная основа j→base(j) (+ иногда j→base(j)+1), затем закрытие
  // «дыр» монотонными rescue-рёбрами — тропы НЕ пересекаются по построению.
  for (let f = 0; f < floors.length - 1; f++) {
    const cur = floors[f]!;
    const next = floors[f + 1]!;
    const n = cur.nodes.length;
    const m = next.nodes.length;
    const edges = new Set<string>();
    const add = (a: number, b: number): void => {
      edges.add(`${a}:${b}`);
    };
    // Монотонное отображение индексов (n=1 → звезда во все узлы)
    const baseOf = (j: number): number =>
      n === 1 ? Math.floor(m / 2) : Math.round((j * (m - 1)) / (n - 1));
    if (n === 1) {
      for (let k = 0; k < m; k++) add(0, k);
    } else {
      for (let j = 0; j < n; j++) {
        const base = baseOf(j);
        add(j, base);
        // Ветка +1 — только если не пересечётся с base следующего узла (m<n)
        const nextBase = j + 1 < n ? baseOf(j + 1) : Infinity;
        if (base + 1 <= m - 1 && base + 1 <= nextBase && Math.random() < 0.55) add(j, base + 1);
      }
      // Каждый узел следующего этажа достижим: для k без входящих добавляем
      // ребро от j-1, где j — первый индекс с base(j) > k (сохраняет монотонность)
      for (let k = 0; k < m; k++) {
        if ([...edges].some((e) => e.endsWith(`:${k}`))) continue;
        let j = 0;
        while (j < n && baseOf(j) <= k) j++;
        const from = j > 0 ? j - 1 : 0;
        add(from, k);
      }
    }
    cur.edges = [...edges]
      .map((e) => e.split(':').map(Number) as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  return floors;
}

/** Найти узел по id: [индекс этажа, индекс узла] или [-1, -1] (чистая функция). */
function findNode(floors: TrialFloor[], nodeId: string): { floorIdx: number; idx: number } {
  for (let f = 0; f < floors.length; f++) {
    const idx = floors[f]!.nodes.findIndex((n) => n.id === nodeId);
    if (idx !== -1) return { floorIdx: f, idx };
  }
  return { floorIdx: -1, idx: -1 };
}

export const useTrialStore = defineStore('trial', {
  state: () => ({
    active: false,
    deck: [] as CardInstance[],
    hp: 70 as number,
    maxHp: 70 as number,
    floor: 1,
    depth: 1,
    /** Вся карта похода (этажи 1..15 с рёбрами-тропами) */
    floors: [] as TrialFloor[],
    nodeState: null as string | null,
    /** ID узла, с которым взаимодействует игрок сейчас */
    currentNodeId: null as string | null,
    /** Последний пройденный узел (от него считаются доступные тропы) */
    lastClearedId: null as string | null,
    /** Пройденные тропы: пары id узлов (для подсветки пути) */
    walkedEdges: [] as Array<[string, string]>,
    /** Купленные в текущем магазине карты (не показывать повторно) */
    purchasedFromShop: [] as string[],
    /** Модификаторы похода (благословения/проклятия — до конца рана) */
    runMods: { ...EMPTY_RUN_MODS } as RunModifiers,
    /** Душ собрано за этот поход (для итогового экрана) */
    runSouls: 0,
  }),

  getters: {
    /** Узлы, доступные для выбора сейчас (соседи по тропам от последнего пройденного). */
    reachableIds(state): Set<string> {
      if (state.floors.length === 0) return new Set();
      if (!state.lastClearedId) {
        // Старт: доступны все узлы первого этажа
        return new Set(state.floors[0]!.nodes.map((n) => n.id));
      }
      const { floorIdx, idx } = findNode(state.floors, state.lastClearedId);
      if (floorIdx === -1) return new Set();
      const floor = state.floors[floorIdx]!;
      const next = state.floors[floorIdx + 1];
      if (!next) return new Set(); // конец карты
      return new Set(floor.edges.filter((e) => e[0] === idx).map((e) => next.nodes[e[1]]!.id));
    },
    /** Этаж, на котором сейчас происходит выбор (для подсветки). */
    choiceFloorNumber(state): number {
      if (state.floors.length === 0) return 1;
      if (!state.lastClearedId) return 1;
      const { floorIdx } = findNode(state.floors, state.lastClearedId);
      return floorIdx === -1 ? 1 : Math.min(floorIdx + 2, state.floors.length);
    },
    /** Босс повержен — поход пройден, показать финал (Механизм). */
    bossDefeated(state): boolean {
      if (!state.lastClearedId) return false;
      const { floorIdx, idx } = findNode(state.floors, state.lastClearedId);
      return floorIdx !== -1 && state.floors[floorIdx]!.nodes[idx]!.type === 'boss';
    },
  },

  actions: {
    /** Начать поход: копия постоянной колоды → походная, карта генерится целиком. */
    start(): void {
      const meta = useMetaStore();
      const deck = meta.activeDeckCards.map((c) => ({ ...c }));
      if (deck.length < BALANCE.hub.minDeck) return;
      this.active = true;
      this.deck = deck;
      this.maxHp = 70 + meta.combatStats.maxHpBonus;
      this.hp = this.maxHp;
      this.floor = 1;
      // NG+: каждый завершённый мир углубляет следующий поход (враги и награды масштабируются)
      this.depth = meta.progress.depth;
      this.runSouls = 0;
      this.floors = genMap();
      this.nodeState = null;
      this.currentNodeId = null;
      this.lastClearedId = null;
      this.walkedEdges = [];
      this.purchasedFromShop = [];
      this.runMods = { ...EMPTY_RUN_MODS };
      useUiStore().setScreen('trial');
    },

    /** Выйти из похода (добровольно или после смерти) — всё сгорает. */
    exit(): void {
      this.active = false;
      this.deck = [];
      this.floors = [];
      this.nodeState = null;
      this.lastClearedId = null;
      this.walkedEdges = [];
      useUiStore().setScreen('hub');
    },

    /** Доступен ли узел для выбора (по тропам). */
    isReachable(nodeId: string): boolean {
      return this.reachableIds.has(nodeId);
    },

    /**
     * Завершить выбранный узел (по id), обновить HP. Игрок идёт по тропам:
     * следующий выбор — только соседи пройденного узла на следующем этаже.
     */
    clearNodeById(nodeId: string, hpAfter?: number): void {
      const { floorIdx, idx } = findNode(this.floors, nodeId);
      if (floorIdx === -1) return;
      const node = this.floors[floorIdx]!.nodes[idx]!;
      node.cleared = true;
      if (hpAfter !== undefined) this.hp = hpAfter;
      if (this.lastClearedId) {
        this.walkedEdges.push([this.lastClearedId, node.id]);
      }
      this.lastClearedId = node.id;
      this.currentNodeId = null;
      this.floor = floorIdx + 2 <= this.floors.length ? floorIdx + 2 : this.floors.length;
      this.depth += 1;
    },

    /** Завершить текущий узел (currentNodeId). */
    clearCurrentNode(): void {
      if (this.currentNodeId) {
        this.clearNodeById(this.currentNodeId);
      } else {
        // Fallback: первый доступный узел текущего этажа
        const floor = this.floors[this.floor - 1];
        const node = floor?.nodes.find((n) => this.isReachable(n.id));
        if (node) this.clearNodeById(node.id);
      }
    },

    /** Начать бой на узле. */
    startBattle(node: TrialNode): void {
      if (!node.data) return;
      this.currentNodeId = node.id; // запоминаем для очистки после боя
      const battle = useBattleStore();
      const isElite = node.type === 'elite';
      const isBoss = node.type === 'boss';
      const scaled = scaleEnemy(node.data, isElite ? this.depth + 1 : this.depth);
      battle.startTrialBattle(
        [scaled.def],
        this.deck,
        this.hp,
        this.maxHp,
        isElite || isBoss,
        scaled.dmgBonus + this.runMods.enemyDmgBonus,
        this.runMods,
      );
    },

    /** Бой завершён (вызывает battle-store). 'spared' — враг пощажён. */
    onBattleEnd(result: 'victory' | 'defeat' | 'spared', hpAfter: number): void {
      if (result === 'defeat') {
        this.exit();
        return;
      }
      const spared = result === 'spared';
      // Тип узла фиксируем ДО очистки: clearNodeById перейдёт на следующий этаж
      const node = this.floors[this.floor - 1]?.nodes.find((n) => n.id === this.currentNodeId);
      const isBoss = node?.type === 'boss';
      const isElite = node?.type === 'elite';
      // Очищаем ИМЕННО тот узел который били
      this.clearNodeById(this.currentNodeId ?? '', hpAfter);
      // Награда: души (+ бонус «Жадности»; пощада — половина душ и очко милосердия)
      const meta = useMetaStore();
      const T = BALANCE.trial;
      let base = isBoss ? T.bossSouls : T.battleBaseSouls + (this.depth - 1) * T.battleSoulsPerDepth;
      if (isElite) base = Math.round(base * T.eliteSoulsMult);
      if (spared) {
        base = Math.round(base * 0.5);
        meta.stats.mercyPoints += 1;
      }
      const granted = Math.round(base * (1 + this.runMods.soulsBonusPct / 100));
      meta.souls += granted;
      this.runSouls += granted;
      if (isBoss) meta.essences += 1;
      // Элита/босс: гарантированная карта в ПОХОДНУЮ колоду —
      // с шансом 40% классовая (углубляет билд класса)
      if (isElite || isBoss) {
        const meta2 = useMetaStore();
        const craft = Object.values(CRAFT_POOL).flat();
        const classPool = classCardPool(meta2.classId);
        const pool = Math.random() < 0.4 && classPool.length > 0
          ? classPool
          : craft.length > 0 ? craft : ['strike'];
        this.deck.push(createCard(pick(pool)));
      }
      useUiStore().setScreen('trial');
    },

    /** Костёр: лечение или улучшение карты (только походное). */
    rest(): void {
      this.hp = Math.min(this.maxHp, this.hp + 20);
      this.clearCurrentNode();
    },

    /** Костёр: улучшить карту (походное, +1 уровень). */
    upgradeCard(uid: string): void {
      const card = this.deck.find((c) => c.uid === uid);
      if (card && card.upgradeLevel < 5) card.upgradeLevel += 1;
      this.clearCurrentNode();
    },

    /** Магазин: купить карту за души (закрывает узел). */
    buyCard(defId: string): boolean {
      const meta = useMetaStore();
      const cost = this.shopCost();
      if (meta.souls < cost) return false;
      // Проверяем что карта ещё не куплена в этом магазине
      if (this.purchasedFromShop.includes(defId)) return false;
      meta.souls -= cost;
      this.deck.push(createCard(defId));
      this.purchasedFromShop.push(defId);
      return true;
    },

    /** Магазин: 3 случайных варианта (исключая купленные). */
    shopOptions(): string[] {
      const pool = [...Object.values(CRAFT_POOL).flat(), ...Object.keys(CARDS).filter((k) => CARDS[k]!.rarity === 'rare')]
        .filter((id) => !this.purchasedFromShop.includes(id));
      const out = new Set<string>();
      while (out.size < 3 && out.size < pool.length) {
        out.add(pick(pool));
      }
      return [...out];
    },

    /** Магазин: сброс покупок (новый магазин = новый ассортимент). */
    resetShop(): void {
      this.purchasedFromShop = [];
    },

    shopCost(): number {
      const raw = BALANCE.trial.shopBaseCost + this.depth * BALANCE.trial.shopCostPerDepth;
      // Скидка милосердия: 5% за каждое очко (пощада врагов), максимум 30%
      const disc = Math.min(0.3, useMetaStore().stats.mercyPoints * 0.05);
      return Math.max(10, Math.round(raw * (1 - disc)));
    },

    /** Текущая скидка милосердия (для подсказки торговца), в процентах. */
    mercyDiscountPct(): number {
      return Math.round(Math.min(0.3, useMetaStore().stats.mercyPoints * 0.05) * 100);
    },
  },
});
