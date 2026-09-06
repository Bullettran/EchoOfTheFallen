<script setup lang="ts">
/**
 * HubScreen — каркас Последнего очага: ресурсы, навигация по 5 зонам, запуск похода.
 * Зона рендерится через <component :is> внутри <Transition> — мягкая смена.
 */
import { computed, ref, watch } from 'vue';
import { useMetaStore } from '@/stores/meta';
import { useTrialStore } from '@/stores/trial';
import { BALANCE } from '@/core/config';
import { sceneUrl, uiUrl } from '@/core/assets';
import { setMuted } from '@/core/audio';
import ForgeView from '@/components/hub/ForgeView.vue';
import AltarView from '@/components/hub/AltarView.vue';
import WorkshopView from '@/components/hub/WorkshopView.vue';
import VaultView from '@/components/hub/VaultView.vue';
import StatueView from '@/components/hub/StatueView.vue';

const ZONES = [
  { id: 'forge', label: 'Кузня', icon: '🔨', hint: 'Улучшение карт', component: ForgeView },
  { id: 'altar', label: 'Алтарь', icon: '🕯', hint: 'Дерево навыков', component: AltarView },
  { id: 'workshop', label: 'Горнило', icon: '🔥', hint: 'Создание карт', component: WorkshopView },
  { id: 'vault', label: 'Реликварий', icon: '📜', hint: 'Колода и пресеты', component: VaultView },
  { id: 'statue', label: 'Зал Эха', icon: '🏛', hint: 'Лор и статистика', component: StatueView },
] as const;

type ZoneId = (typeof ZONES)[number]['id'];

const meta = useMetaStore();
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
const hubBg = sceneUrl('station');
const partIcon = uiUrl('soul_icon');
const memoryIcon = uiUrl('essence_icon');

const toggleAudio = (): void => {
  meta.audioMuted = !meta.audioMuted;
  setMuted(meta.audioMuted);
};

const embark = (): void => {
  const trial = useTrialStore();
  trial.start(); // старт похода → экран 'trial'
};
</script>

<template>
  <div class="hub" :style="hubBg ? { backgroundImage: `url(${hubBg})` } : {}">
    <div class="hub-shade">
    <header class="hub-header">
      <div class="title-block">
        <span class="subtitle">последний очаг угольных пустошей</span>
        <h1>ECHOES OF THE FALLEN</h1>
      </div>
      <div class="resources">
        <span class="res souls" title="Души — валюта Кузни и Алтаря">
          <img v-if="partIcon" :src="partIcon" class="res-icon" alt="" /> {{ meta.souls }}
        </span>
        <span class="res essences" title="Угли — ресурс Горнила">
          <img v-if="memoryIcon" :src="memoryIcon" class="res-icon" alt="" /> {{ meta.essences }}
        </span>
        <button
          class="res audio-btn"
          :title="meta.fastAnimations ? 'Обычные анимации' : 'Быстрые анимации хода врага'"
          @click="meta.fastAnimations = !meta.fastAnimations"
        >
          {{ meta.fastAnimations ? '⏩' : '🐢' }}
        </button>
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
        <button class="embark" :disabled="!deckReady" @click="embark">
          ⚔ Выйти в пустоши
        </button>
      </div>
    </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./HubScreen.scss"></style>
