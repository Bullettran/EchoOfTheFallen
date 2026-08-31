<script setup lang="ts">
/**
 * HubScreen — каркас убежища: ресурсы, навигация по 5 зонам, запуск похода.
 * Зона рендерится через <component :is> внутри <Transition> — мягкая смена.
 */
import { computed, ref, watch } from 'vue';
import { useMetaStore } from '@/stores/meta';
import { useUiStore } from '@/stores/ui';
import { useStoryStore, CHECKPOINT_LABELS } from '@/stores/story';
import { BALANCE } from '@/core/config';
import { sceneUrl, uiUrl } from '@/core/assets';
import { setMuted } from '@/core/audio';
import ForgeView from '@/components/hub/ForgeView.vue';
import AltarView from '@/components/hub/AltarView.vue';
import WorkshopView from '@/components/hub/WorkshopView.vue';
import VaultView from '@/components/hub/VaultView.vue';
import StatueView from '@/components/hub/StatueView.vue';

const ZONES = [
  { id: 'forge', label: 'Кузница', icon: '🔨', hint: 'Улучшение карт', component: ForgeView },
  { id: 'altar', label: 'Алтарь душ', icon: '🕯', hint: 'Дерево навыков', component: AltarView },
  { id: 'workshop', label: 'Мастерская', icon: '⚗', hint: 'Создание карт', component: WorkshopView },
  { id: 'vault', label: 'Хранилище', icon: '📜', hint: 'Колода и пресеты', component: VaultView },
  { id: 'statue', label: 'Статуя', icon: '🗿', hint: 'Память и статистика', component: StatueView },
] as const;

type ZoneId = (typeof ZONES)[number]['id'];

const meta = useMetaStore();
const ui = useUiStore();
const zone = ref<ZoneId>('forge');

// Заголовок зоны при входе (появляется и тает)
const zoneTitle = ref<string | null>(null);
let titleTimer: number | undefined;
watch(zone, (z) => {
  const found = ZONES.find((x) => x.id === z);
  zoneTitle.value = found?.label ?? null;
  window.clearTimeout(titleTimer);
  titleTimer = window.setTimeout(() => (zoneTitle.value = null), 1500);
});

const activeZone = computed(() => ZONES.find((z) => z.id === zone.value)!);
const deckReady = computed(() => meta.deckUids.length >= BALANCE.hub.minDeck);
const hubBg = sceneUrl('hub_scene');
const soulIcon = uiUrl('soul_icon');
const essenceIcon = uiUrl('essence_icon');
const checkpoint = computed(() => meta.storyCheckpoint);
const checkpointLabel = computed(
  () => (checkpoint.value ? CHECKPOINT_LABELS[checkpoint.value.nodeId] ?? checkpoint.value.nodeId : ''),
);
const story = useStoryStore();
const act2Available = computed(() => meta.actsCompleted >= 1);

const toggleAudio = (): void => {
  meta.audioMuted = !meta.audioMuted;
  setMuted(meta.audioMuted);
};

const startAct2 = (): void => {
  if (meta.storyCheckpoint) story.startAct2(true);
  else story.openClassSelect(2);
};

const embark = (): void => {
  ui.setScreen('map');
};

const startAct = (): void => {
  // Есть чекпоинт — продолжаем; нет — новый ран через выбор класса
  if (meta.storyCheckpoint) story.startAct1(true);
  else story.openClassSelect(1);
};

const resumeAct = (): void => {
  story.startAct1(true);
};

const restartAct = (): void => {
  story.discardCheckpoint();
  story.startAct1(false);
};
</script>

<template>
  <div class="hub" :style="hubBg ? { backgroundImage: `url(${hubBg})` } : {}">
    <div class="hub-shade">
    <header class="hub-header">
      <div class="title-block">
        <span class="subtitle">убежище павших</span>
        <h1>ECHOES OF THE FALLEN</h1>
      </div>
      <div class="resources">
        <span class="res souls" title="Души — валюта убежища">
          <img v-if="soulIcon" :src="soulIcon" class="res-icon" alt="" /> {{ meta.souls }}
        </span>
        <span class="res essences" title="Эссенции — ресурс Мастерской">
          <img v-if="essenceIcon" :src="essenceIcon" class="res-icon" alt="" /> {{ meta.essences }}
        </span>
        <span v-if="meta.ashShards > 0" class="res shards" title="Пепельные осколки — валюта Рынка (Акт 2)">
          ◈ {{ meta.ashShards }}
        </span>
        <button
          class="res audio-btn"
          :title="meta.audioMuted ? 'Включить звук (M)' : 'Выключить звук (M)'"
          @click="toggleAudio"
        >
          {{ meta.audioMuted ? '🔇' : '🔊' }}
        </button>
      </div>
    </header>

    <nav class="zone-nav">
      <button
        v-for="z in ZONES"
        :key="z.id"
        :class="{ active: z.id === zone }"
        @click="zone = z.id"
      >
        <span class="z-icon">{{ z.icon }}</span>
        <span class="z-text">
          <span class="z-label">{{ z.label }}</span>
          <span class="z-hint">{{ z.hint }}</span>
        </span>
      </button>
    </nav>

    <main class="zone-content">
      <Transition name="zone" mode="out-in">
        <component :is="activeZone.component" :key="activeZone.id" />
      </Transition>
      <!-- Заголовок зоны при входе -->
      <Transition name="zt">
        <div v-if="zoneTitle" class="zone-title" aria-hidden="true">
          <span class="zt-orn">✦ ─── ✦ ─── ✦</span>
          <span class="zt-text">{{ zoneTitle }}</span>
        </div>
      </Transition>
    </main>

    <footer class="hub-footer">
      <span class="deck-info">
        Колода: <b>{{ meta.deckUids.length }}</b> карт
        <em v-if="!deckReady">— нужно минимум {{ BALANCE.hub.minDeck }}</em>
        <span class="sep">·</span> Глубина похода: <b>{{ meta.progress.depth }}</b>
      </span>
      <div class="embark-row">
        <template v-if="checkpoint">
          <button class="act" :disabled="!deckReady" @click="resumeAct">
            ✦ Продолжить Акт {{ story.actId === 1 ? 'I' : 'II' }} — {{ checkpointLabel }}
          </button>
          <button class="act secondary" :disabled="!deckReady" @click="restartAct" title="Начать акт заново">
            ⟲ Заново
          </button>
        </template>
        <template v-else>
          <button v-if="!act2Available" class="act" :disabled="!deckReady" title="Сюжетная кампания" @click="startAct">
            ✦ Акт I: Голос из пепла
          </button>
          <button v-if="act2Available" class="act" :disabled="!deckReady" title="Сюжетная кампания" @click="startAct2">
            ✦ Акт II: Пепельный город
          </button>
          <button v-if="act2Available" class="act secondary" :disabled="!deckReady" @click="startAct" title="Пройти Акт I заново">
            ⟲ Акт I
          </button>
        </template>
        <button class="embark" :disabled="!deckReady" @click="embark">
          ⚔ Испытания
        </button>
      </div>
    </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./HubScreen.scss"></style>
