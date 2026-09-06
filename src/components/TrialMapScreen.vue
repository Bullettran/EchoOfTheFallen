<script setup lang="ts">
/**
 * TrialMapScreen — карта-граф похода (StS-лайк): ВСЯ карта видна сразу,
 * узлы соединены тропами-рёбрами; выбирать можно только соседей по тропе
 * от последнего пройденного узла. Босс — на последнем (15-м) этаже.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTrialStore } from '@/stores/trial';
import { useMetaStore } from '@/stores/meta';
import { CARDS } from '@/data/cards';
import { getCardDefinition } from '@/game/CardFactory';
import { cardArtUrl } from '@/core/assets';
import { play as sfx } from '@/core/audio';
import { NODE_META, rollShrineOptions, rollCurseOption, type ShrineOption, type CurseOption } from '@/stores/trial';
import { rollEventScenario, type EventContext, type EventScenario } from '@/data/events';
import TrialCardInspect from '@/components/TrialCardInspect.vue';
import type { TrialNode } from '@/types/trial';

const trial = useTrialStore();
const meta = useMetaStore();

const hpPct = computed(() => (trial.hp / trial.maxHp) * 100);
const deckNames = computed(() =>
  trial.deck.map((c) => getCardDefinition(c.defId).name + (c.upgradeLevel > 0 ? `+${c.upgradeLevel}` : '')),
);
/** Узел уже выбран (костёр/магазин открыт) — остальные кнопки блокируются */
const nodeLocked = computed(() => trial.currentNodeId !== null);
/** Этаж, где сейчас выбор */
const choiceFloor = computed(() => trial.choiceFloorNumber);

// Состояние узла
type PanelView = 'none' | 'campfire' | 'shop' | 'shrine' | 'curse' | 'event';
const panel = ref<PanelView>('none');
const shopItems = ref<string[]>([]);
const selectedCardUid = ref<string | null>(null);
// Святыня/Тлен/Находка: предложенные варианты
const shrineOptions = ref<ShrineOption[]>([]);
const curseOption = ref<CurseOption | null>(null);
const eventScenario = ref<EventScenario | null>(null);

/** Контекст эффектов события: замыкает сторы и колоды */
const pushRunCard = (defId: string): void => {
  trial.deck.push({ uid: `ev${Date.now()}${Math.random().toString(36).slice(2, 6)}`, defId, upgradeLevel: 0 });
};
const eventContext: EventContext = {
  addSouls: (n) => { meta.souls += n; },
  healHp: (n) => { trial.hp = Math.max(1, Math.min(trial.maxHp, trial.hp + n)); },
  addMaxHp: (n) => { trial.maxHp += n; trial.hp = Math.min(trial.maxHp, trial.hp + n); },
  addCard: pushRunCard,
  addRandomRareCard: () => {
    const pool = Object.values(CARDS).filter((c) => c.rarity === 'rare').map((c) => c.id);
    if (pool.length) pushRunCard(pool[Math.floor(Math.random() * pool.length)]!);
  },
  addEssence: (n) => { meta.essences += n; },
  addRunMod: (mod) => {
    trial.runMods.startBlock += mod.startBlock ?? 0;
    trial.runMods.cardsPerTurnBonus += mod.cardsPerTurnBonus ?? 0;
    trial.runMods.healMultBonus += mod.healMultBonus ?? 0;
    trial.runMods.soulsBonusPct += mod.soulsBonusPct ?? 0;
    trial.runMods.enemyDmgBonus += mod.enemyDmgBonus ?? 0;
  },
};

// ---- Осмотр карты: выезжающая панель характеристик ----
const inspectUid = ref<string | null>(null);
const inspectCard = computed(() => trial.deck.find((c) => c.uid === inspectUid.value) ?? null);
/** Улучшать можно только у костра (панель костра открыта и узел ещё не израсходован) */
const canUpgradeInspect = computed(() => panel.value === 'campfire' && Boolean(selectedCardUid.value));

const inspectDeckCard = (uid: string): void => {
  inspectUid.value = uid;
};
const closeInspect = (): void => {
  inspectUid.value = null;
};
/** Походное улучшение из панели осмотра (костёр догорает — узел закрывается) */
const upgradeFromInspect = (uid: string): void => {
  trial.upgradeCard(uid);
  inspectUid.value = null;
  panel.value = 'none';
};

// ---- Карта: тропы-рёбра (SVG поверх раскладки) и автопрокрутка ----
const mapInner = ref<HTMLElement | null>(null);
interface EdgeLine { x1: number; y1: number; x2: number; y2: number; walked: boolean; ahead: boolean }
const edgeLines = ref<EdgeLine[]>([]);
const svgSize = ref({ w: 0, h: 0 });

const drawEdges = async (): Promise<void> => {
  await nextTick();
  const inner = mapInner.value;
  if (!inner) return;
  // Единая система координат: ЛОКАЛЬНЫЕ layout-px (offsetLeft/offsetTop).
  // getBoundingClientRect нельзя: он в экранных px (масштабируется CSS zoom),
  // а размеры svg — локальные; смешивание даёт смещение троп.
  svgSize.value = { w: inner.scrollWidth, h: inner.scrollHeight };
  const localPos = (el: Element, root: HTMLElement): { x: number; y: number } => {
    let x = 0;
    let y = 0;
    let cur: HTMLElement | null = el as HTMLElement;
    while (cur && cur !== root) {
      x += cur.offsetLeft;
      y += cur.offsetTop;
      cur = cur.offsetParent as HTMLElement | null;
    }
    return { x, y };
  };
  const center = (id: string): { x: number; y: number; w: number; h: number } | null => {
    const el = inner.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
    if (!el) return null;
    const p = localPos(el, inner);
    return { x: p.x + el.offsetWidth / 2, y: p.y + el.offsetHeight / 2, w: el.offsetWidth, h: el.offsetHeight };
  };
  /** Отрезок между ГРАНИЦАМИ двух узлов (с зазором): линия не заезжает на карточку. */
  const EDGE_GAP = 6;
  const trimToBorders = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ): { x1: number; y1: number; x2: number; y2: number } => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // выход из прямоугольника a: параметр до пересечения с его границей (+зазор)
    const ta = Math.min(
      ux !== 0 ? Math.abs((a.w / 2 + EDGE_GAP) / ux) : Infinity,
      uy !== 0 ? Math.abs((a.h / 2 + EDGE_GAP) / uy) : Infinity,
    );
    // вход в прямоугольник b (от центра b назад к границе)
    const tb = Math.min(
      ux !== 0 ? Math.abs((b.w / 2 + EDGE_GAP) / ux) : Infinity,
      uy !== 0 ? Math.abs((b.h / 2 + EDGE_GAP) / uy) : Infinity,
    );
    return {
      x1: a.x + ux * ta,
      y1: a.y + uy * ta,
      x2: b.x - ux * tb,
      y2: b.y - uy * tb,
    };
  };
  const lines: EdgeLine[] = [];
  for (let f = 0; f < trial.floors.length - 1; f++) {
    const cur = trial.floors[f]!;
    const next = trial.floors[f + 1]!;
    for (const [a, b] of cur.edges) {
      const p1 = center(cur.nodes[a]!.id);
      const p2 = center(next.nodes[b]!.id);
      if (!p1 || !p2) continue;
      const fromId = cur.nodes[a]!.id;
      const toId = next.nodes[b]!.id;
      const seg = trimToBorders(p1, p2);
      lines.push({
        ...seg,
        walked: trial.walkedEdges.some(([w1, w2]) => w1 === fromId && w2 === toId),
        ahead: trial.lastClearedId === fromId,
      });
    }
  }
  edgeLines.value = lines;
};

const scrollToCurrent = async (): Promise<void> => {
  await nextTick();
  const row = mapInner.value?.querySelector(`.floor-row[data-floor="${choiceFloor.value}"]`);
  row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

onMounted(() => {
  void drawEdges();
  void scrollToCurrent();
  window.addEventListener('resize', redraw);
});
onBeforeUnmount(() => window.removeEventListener('resize', redraw));
const redraw = (): void => void drawEdges();
watch(() => [trial.lastClearedId, trial.floors.length, trial.currentNodeId], () => {
  void drawEdges();
  void scrollToCurrent();
});

const rowState = (floorNumber: number): 'past' | 'current' | 'future' => {
  if (floorNumber < choiceFloor.value) return 'past';
  if (floorNumber === choiceFloor.value) return 'current';
  return 'future';
};

const enterNode = (node: TrialNode) => {
  if (node.cleared || nodeLocked.value || !trial.isReachable(node.id)) return;
  trial.currentNodeId = node.id; // запоминаем: на этом узле путь уже выбран
  switch (node.type) {
    case 'battle':
    case 'elite':
    case 'boss':
      trial.startBattle(node);
      break;
    case 'campfire':
      panel.value = 'campfire';
      selectedCardUid.value = null;
      break;
    case 'shop':
      trial.resetShop();
      shopItems.value = trial.shopOptions();
      panel.value = 'shop';
      break;
    case 'shrine':
      shrineOptions.value = rollShrineOptions();
      panel.value = 'shrine';
      break;
    case 'curse':
      curseOption.value = rollCurseOption();
      panel.value = 'curse';
      break;
    case 'event':
      eventScenario.value = rollEventScenario();
      panel.value = 'event';
      break;
  }
};

/** Находка: применить выбранный вариант (узел закрывается) */
const applyEventOption = (opt: EventScenario['options'][number]): void => {
  opt.apply(eventContext);
  sfx('dice', 0.7);
  eventScenario.value = null;
  panel.value = 'none';
  trial.clearCurrentNode();
};

/** Святыня: взять благословение (узел закрывается) */
const takeShrine = (opt: ShrineOption) => {
  opt.apply(trial);
  sfx('heal', 0.9);
  panel.value = 'none';
  inspectUid.value = null;
  trial.clearCurrentNode();
};

/** Святыня: уйти ни с чем */
const leaveShrine = () => {
  panel.value = 'none';
  trial.clearCurrentNode();
};

/** Тлен: принять проклятие с наградой */
const acceptCurse = () => {
  curseOption.value?.accept(trial);
  sfx('dice', 0.95);
  panel.value = 'none';
  trial.clearCurrentNode();
};

/** Тлен: отказаться */
const refuseCurse = () => {
  panel.value = 'none';
  trial.clearCurrentNode();
};

const doRest = () => {
  trial.rest();
  sfx('heal', 0.8);
  panel.value = 'none';
  inspectUid.value = null;
};

const buyCard = (defId: string) => {
  if (trial.buyCard(defId)) {
    // Обновляем список (убираем купленную)
    shopItems.value = shopItems.value.filter((id) => id !== defId);
    // Если всё куплено — закрываем магазин
    if (shopItems.value.length === 0) {
      panel.value = 'none';
      trial.clearCurrentNode();
    }
  }
};

const leaveShop = () => {
  panel.value = 'none';
  trial.clearCurrentNode();
};
</script>

<template>
  <div class="trial-screen" v-if="trial.active">
    <header class="trial-header">
      <span class="floor-label">Этаж {{ choiceFloor }}/{{ trial.floors.length }}</span>
      <div class="hp-bar tip-host">
        <div class="hp-fill" :style="{ width: `${hpPct}%` }" />
        <span class="hp-text">{{ trial.hp }} / {{ trial.maxHp }}</span>
        <span class="tip">Здоровье похода. Переносится между узлами; восстанавливается у костров и находок. Ноль — поход сгорает.</span>
      </div>
      <div class="resources">
        <span class="souls tip-host">💀 {{ meta.souls }}
          <span class="tip">Души — выпадают за победы. Тратятся у Торговца; после похода остаются с тобой.</span>
        </span>
        <button class="btn-exit" @click="trial.exit()">Вернуться в Очаг</button>
      </div>
    </header>

    <main class="floor-map">
      <div class="map-scroll">
        <div class="map-inner" ref="mapInner">
          <!-- Тропы-рёбра -->
          <svg class="map-edges" :width="svgSize.w" :height="svgSize.h" aria-hidden="true">
            <line
              v-for="(e, i) in edgeLines"
              :key="i"
              :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
              :class="{ walked: e.walked, ahead: e.ahead }"
            />
          </svg>

          <div
            v-for="f in trial.floors"
            :key="f.floor"
            class="floor-row"
            :data-floor="f.floor"
            :class="[rowState(f.floor), { bossrow: f.nodes[0]?.type === 'boss' }]"
          >
            <span class="row-num">{{ f.floor }}</span>
            <div class="nodes" :style="{ '--lanes': f.nodes.length }">
              <button
                v-for="node in f.nodes"
                :key="node.id"
                :data-node-id="node.id"
                class="node"
                :class="{
                  [node.type]: true,
                  cleared: node.cleared,
                  reachable: !node.cleared && trial.isReachable(node.id),
                }"
                :disabled="node.cleared || nodeLocked || !trial.isReachable(node.id)"
                @click="enterNode(node)"
              >
                <span class="node-icon">{{ node.icon }}</span>
                <span class="node-label">{{ node.label }}</span>
                <span v-if="node.cleared" class="cleared-mark">✓</span>
                <span class="tip">{{ NODE_META[node.type].desc }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <footer class="trial-footer">
      <p class="floor-hint">Иди по тропам: доступен только соседний узел. Босс ждёт на {{ trial.floors.length }}-м этаже</p>
      <details class="deck-info">
        <summary>Походная колода ({{ trial.deck.length }}) — клик по карте покажет характеристики</summary>
        <div class="deck-list">
          <button
            v-for="(name, i) in deckNames"
            :key="i"
            class="deck-card"
            @click="inspectDeckCard(trial.deck[i]!.uid)"
          >{{ name }}</button>
        </div>
      </details>
    </footer>

    <!-- Костёр -->
    <div v-if="panel === 'campfire'" class="overlay">
      <div class="overlay-panel">
        <h3>🔥 Костёр</h3>
        <p class="hint">Пепел ещё тепл. Отдохнуть (+20 HP) или улучшить карту — на этот поход.<br>Клик по карте: справа выедут характеристики и улучшение.</p>
        <div class="actions">
          <button class="btn" @click="doRest()">Отдохнуть (+20 HP)</button>
          <div class="card-select">
            <p>Или выбери карту для улучшения:</p>
            <div class="mini-cards">
              <button
                v-for="card in trial.deck.filter((c) => c.upgradeLevel < 5)"
                :key="card.uid"
                class="mini-card"
                :class="{ picked: selectedCardUid === card.uid }"
                @click="selectedCardUid = card.uid; inspectDeckCard(card.uid)"
              >
                {{ getCardDefinition(card.defId).name }}{{ card.upgradeLevel > 0 ? `+${card.upgradeLevel}` : '' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Магазин -->
    <div v-if="panel === 'shop'" class="overlay">
      <div class="overlay-panel">
        <h3>💰 Торговец пеплом</h3>
        <p class="hint">
          Купленные карты действуют только в этом походе. Цена: {{ trial.shopCost() }} душ<template v-if="trial.mercyDiscountPct() > 0"> (скидка милосердия −{{ trial.mercyDiscountPct() }}%)</template>.
          Купил всё или ушёл — торговец исчезнет в пепле.
        </p>
        <div class="shop-items">
          <button
            v-for="defId in shopItems"
            :key="defId"
            class="shop-card"
            :disabled="meta.souls < trial.shopCost()"
            @click="buyCard(defId)"
          >
            <div class="sc-art">
              <img :src="cardArtUrl(defId) ?? ''" alt="" />
            </div>
            <div class="sc-name">{{ CARDS[defId]?.name }}</div>
            <div class="sc-desc">{{ CARDS[defId]?.description }}</div>
          </button>
        </div>
        <button class="btn" @click="leaveShop()">Уйти</button>
      </div>
    </div>

    <!-- ФИНАЛ: Механизм запуска нового мира (после победы над боссом) -->
    <div v-if="trial.bossDefeated" class="overlay finale">
      <div class="overlay-panel finale-panel">
        <div class="ornament">✦ ──── ✦ ──── ✦</div>
        <h2 class="finale-title">МЕХАНИЗМ ЗАПУЩЕН</h2>
        <p class="finale-text">
          Король-Пепел рассыпается. Ты вынимаешь его душу из трона — и слышишь, как где-то
          под пеплом впервые за века поворачивается вал Механизма. Новый мир делает вдох.
        </p>
        <p class="finale-stats">
          Поход пройден: {{ trial.depth - 1 }} узлов · собрано {{ trial.runSouls }} душ ·
          очаг горит ярче (глубина мира: {{ meta.progress.depth }})
        </p>
        <p class="finale-ng">Следующий поход начнётся глубже: враги сильнее, награды щедрее.</p>
        <button class="btn primary" @click="trial.exit()">Вернуться в Очаг</button>
        <div class="ornament">✦ ──── ✦ ──── ✦</div>
      </div>
    </div>

    <!-- Находка: событие с выбором -->
    <div v-if="panel === 'event' && eventScenario" class="overlay">
      <div class="overlay-panel">
        <h3>{{ eventScenario.title }}</h3>
        <p class="hint event-text">{{ eventScenario.text }}</p>
        <div class="event-options">
          <button
            v-for="opt in eventScenario.options"
            :key="opt.id"
            class="event-option"
            @click="applyEventOption(opt)"
          >
            <span class="eo-name">{{ opt.label }}</span>
            <span class="eo-desc">{{ opt.effect }}</span>
            <span class="eo-cta">Выбрать</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Святыня -->
    <div v-if="panel === 'shrine'" class="overlay">
      <div class="overlay-panel">
        <h3>⚱ Пепельная святыня</h3>
        <p class="hint">В урне ещё тлеет чужая молитва. Возьми одно благословение — оно будет с тобой до конца похода.</p>
        <div class="event-options">
          <button v-for="opt in shrineOptions" :key="opt.id" class="event-option" @click="takeShrine(opt)">
            <span class="eo-name">{{ opt.name }}</span>
            <span class="eo-desc">{{ opt.desc }}</span>
            <span class="eo-cta">Принять</span>
          </button>
        </div>
        <button class="btn" @click="leaveShrine()">Уйти ни с чем</button>
      </div>
    </div>

    <!-- Тлен -->
    <div v-if="panel === 'curse'" class="overlay">
      <div class="overlay-panel">
        <h3>☠ Тлен</h3>
        <p class="hint">Из трещины сочится шёпот. Он предлагает сделку — цена останется с тобой до конца похода.</p>
        <div v-if="curseOption" class="event-options single">
          <div class="event-option curse">
            <span class="eo-name">{{ curseOption.name }}</span>
            <span class="eo-desc">{{ curseOption.desc }}</span>
          </div>
        </div>
        <div class="row-btns">
          <button class="btn primary" @click="acceptCurse()">Принять сделку</button>
          <button class="btn" @click="refuseCurse()">Отказаться</button>
        </div>
      </div>
    </div>

    <!-- Выезжающая панель осмотра карты (костёр/колода) -->
    <TrialCardInspect
      :card="inspectCard"
      :can-upgrade="canUpgradeInspect"
      @close="closeInspect"
      @upgrade="upgradeFromInspect"
    />
  </div>
</template>

<style lang="scss" scoped src="./TrialMapScreen.scss"></style>
