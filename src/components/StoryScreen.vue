<script setup lang="ts">
/**
 * StoryScreen — экран сценария (в духе Disco Elysium):
 * фон локации, панель спикера с текстом, выборы с шансами проверок,
 * модалка броска 2d6 с анимацией, панель исхода.
 */
import { computed, ref, watch, onUnmounted } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useUiStore } from '@/stores/ui';
import { sceneUrl, enemyPortraitUrl } from '@/core/assets';
import { STORY_STAT_NAMES, type StoryStat } from '@/types/story';

const story = useStoryStore();
const ui = useUiStore();

const bg = computed(() => sceneUrl((story.engine?.node.scene ?? 'battle_crypt') as never));
const statOrder: StoryStat[] = ['strength', 'intellect', 'memory', 'resolve', 'sincerity', 'wrath'];

/** Спикер → файл портрета (assets/images/enemies). */
const SPEAKER_PORTRAITS: Record<string, string> = {
  'Пепельный отголосок': 'ash_echo',
  'Привратник': 'gatekeeper',
  'Архивариус': 'archivarius',
  'Эдмон': 'edmond',
  'Лира': 'lyra',
  'Тень Лиры': 'sisters_shadow',
  'Привратник, что стал Тенью': 'gate_shadow',
  'Память': 'memory_vision',
};
const portrait = computed(() =>
  story.speaker ? enemyPortraitUrl(SPEAKER_PORTRAITS[story.speaker] ?? '') : null,
);

// ---- Typewriter: параграцы печатаются по очереди, клик достраивает ----
const typed = ref(0);
const paraIdx = ref(0);
let timer: number | undefined;

const startTyping = (): void => {
  window.clearInterval(timer);
  typed.value = 0;
  paraIdx.value = 0;
  timer = window.setInterval(() => {
    const paras = story.paragraphs;
    if (paraIdx.value >= paras.length) {
      window.clearInterval(timer);
      return;
    }
    typed.value += 2;
    if (typed.value >= paras[paraIdx.value]!.length) {
      paraIdx.value += 1;
      typed.value = 0;
      if (paraIdx.value >= paras.length) window.clearInterval(timer);
    }
  }, 24);
};

watch(() => story.nodeId, startTyping, { immediate: true });
onUnmounted(() => window.clearInterval(timer));

const shownParas = computed(() => {
  const out: string[] = [];
  for (let i = 0; i <= Math.min(paraIdx.value, story.paragraphs.length - 1); i++) {
    out.push(i < paraIdx.value ? story.paragraphs[i]! : story.paragraphs[i]!.slice(0, typed.value));
  }
  return out;
});

const isTyping = computed(() => paraIdx.value < story.paragraphs.length);
const skipTyping = (): void => {
  if (!isTyping.value) return;
  paraIdx.value = story.paragraphs.length;
  typed.value = 0;
  window.clearInterval(timer);
};

const chanceClass = (chance: number): string =>
  chance >= 70 ? 'high' : chance >= 40 ? 'mid' : 'low';

const dice = computed(() => story.rollResult?.dice ?? [1, 1]);
</script>

<template>
  <div class="story-screen" :style="bg ? { backgroundImage: `url(${bg})` } : {}">
    <div class="shade">
      <!-- Верхняя панель: статы + эффекты акта -->
      <header class="top">
        <div class="stats">
          <span v-for="s in statOrder" :key="s" class="stat" :title="STORY_STAT_NAMES[s]">
            {{ STORY_STAT_NAMES[s].slice(0, 3) }} <b>{{ story.stats[s] ?? 0 }}</b>
          </span>
        </div>
        <div class="effects">
          <span v-for="e in story.effects" :key="e.id" class="effect" :title="e.desc">
            {{ e.icon }} {{ e.name }}
          </span>
        </div>
      </header>

      <!-- Сцена: текст + выборы -->
      <main class="scene">
        <div class="text-panel" @click="skipTyping">
          <div class="speaker-row">
            <div v-if="portrait" class="portrait">
              <img :src="portrait" alt="" />
            </div>
            <div class="speaker-col">
              <div v-if="story.speaker" class="speaker">{{ story.speaker }}</div>
            </div>
          </div>
          <p v-for="(p, i) in shownParas" :key="i" class="para">{{ p }}</p>
          <span v-if="isTyping" class="caret"></span>
        </div>

        <div class="choices">
          <button
            v-for="(c, i) in story.choices"
            :key="i"
            class="choice"
            :disabled="Boolean(story.rollResult || story.outcomeText)"
            @click="story.pickChoice(i)"
          >
            <span class="choice-text">{{ c.text }}</span>
            <span v-if="c.check" class="check" :class="chanceClass(c.check.chance)">
              {{ c.check.statName }} {{ c.check.dc }} · {{ c.check.chance }}%
            </span>
          </button>
        </div>
      </main>

      <footer class="bottom">
        <button class="back" @click="ui.setScreen('hub')">⌂ Убежище</button>
      </footer>
    </div>

    <!-- Модалка броска -->
    <Transition name="fade">
      <div v-if="story.rollResult" class="roll-overlay">
        <div class="roll-panel">
          <h3>Проверка: {{ STORY_STAT_NAMES[story.rollResult.stat] }}</h3>
          <div class="dice-row">
            <div class="die">{{ dice[0] }}</div>
            <div class="die">{{ dice[1] }}</div>
          </div>
          <p class="math">
            {{ story.rollResult.dice[0] }} + {{ story.rollResult.dice[1] }}
            <template v-if="story.rollResult.statValue"> + {{ story.rollResult.statValue }} ({{ STORY_STAT_NAMES[story.rollResult.stat] }})</template>
            <template v-if="story.rollResult.bonus"> + {{ story.rollResult.bonus }} (эффекты)</template>
            = <b>{{ story.rollResult.total }}</b> против {{ story.rollResult.dc }}
          </p>
          <p class="verdict" :class="story.rollResult.success ? 'ok' : 'fail'">
            {{ story.rollResult.success ? 'УСПЕХ' : 'ПРОВАЛ' }}
          </p>
          <button class="btn" @click="story.confirmRoll()">Дальше</button>
        </div>
      </div>
    </Transition>

    <!-- Панель исхода -->
    <Transition name="fade">
      <div v-if="story.outcomeText" class="roll-overlay">
        <div class="roll-panel outcome">
          <p class="outcome-text">{{ story.outcomeText }}</p>
          <button
            v-if="!story.pendingChoice || story.pendingBattleEnemies"
            class="btn"
            @click="story.dismissOutcome()"
          >
            {{ story.pendingBattleEnemies ? '⚔ Сразиться' : 'Продолжить' }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped src="./StoryScreen.scss"></style>
