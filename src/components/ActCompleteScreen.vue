<script setup lang="ts">
/**
 * Финальный экран Акта I: итоги прохождения и путь в убежище.
 */
import { computed } from 'vue';
import { useMetaStore } from '@/stores/meta';
import { useUiStore } from '@/stores/ui';
import { useStoryStore } from '@/stores/story';
import { sceneUrl, uiUrl } from '@/core/assets';

const meta = useMetaStore();
const ui = useUiStore();
const story = useStoryStore();
const bg = sceneUrl('boss_throne');
const soulIcon = uiUrl('soul_icon');

const isAct2 = computed(() => story.actId === 2);
const soulsEarned = computed(() => story.actSouls);

const actTitle = computed(() => (isAct2.value ? 'АКТ II ЗАВЕРШЁН' : 'АКТ I ЗАВЕРШЁН'));
const actQuote = computed(() =>
  isAct2.value
    ? '«Иди в Огненное сердце. Там ты найдёшь истину. И там ты выберешь свою судьбу.»'
    : '«За этой дверью — истинная Цитадель. Там ждёт правда».',
);
const nextAct = computed(() => (isAct2.value ? 'Акт III: Огненное Сердце — в разработке' : 'Акт II: Пепельный город — ждёт тебя'));
const summary = computed(() => {
  const lines: string[] = [];
  if (meta.lore.includes('gates_open')) lines.push('Врата Цитадели открыты');
  return lines;
});
</script>

<template>
  <div class="finale" :style="bg ? { backgroundImage: `url(${bg})` } : {}">
    <div class="shade">
      <div class="ornament">✦ ──── ✦ ──── ✦</div>
      <h1>{{ actTitle }}</h1>
      <p class="quote">{{ actQuote }}</p>

      <div class="results">
        <div class="res">
          <img v-if="soulIcon" :src="soulIcon" class="icon" alt="" />
          <span class="value">{{ soulsEarned }}</span>
          <span class="label">душ собрано за акт</span>
        </div>
        <div v-for="line in summary" :key="line" class="line">{{ line }}</div>
      </div>

      <p class="next">{{ nextAct }}</p>

      <div class="buttons">
        <button class="btn primary" @click="ui.setScreen('hub')">Вернуться в убежище</button>
        <button v-if="!isAct2" class="btn" @click="story.openClassSelect(2); ">→ Акт II</button>
        <button class="btn" @click="ui.setScreen('map')">Испытания</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./ActCompleteScreen.scss"></style>
