<script setup lang="ts">
/**
 * TrialCardInspect — выезжающая справа панель осмотра карты похода:
 * арт, полные характеристики с учётом улучшений, прирост следующего уровня
 * и (в контексте костра) кнопка походного улучшения.
 */
import { computed } from 'vue';
import { getCardDefinition, describeCardHtml, upgradePreview } from '@/game/CardFactory';
import { cardArtUrl } from '@/core/assets';
import type { CardInstance } from '@/types';

const props = defineProps<{
  card: CardInstance | null;
  /** Костёр: можно улучшить. Колода: только осмотр. */
  canUpgrade: boolean;
}>();

const emit = defineEmits<{
  close: [];
  upgrade: [uid: string];
}>();

const def = computed(() => (props.card ? getCardDefinition(props.card.defId) : null));
const descHtml = computed(() => (props.card ? describeCardHtml(props.card) : ''));

const rarityColor: Record<string, string> = {
  common: '#8f8878',
  uncommon: '#4fae6d',
  rare: '#5b8ee5',
  legendary: '#e0a63c',
};

const typeNames: Record<string, string> = {
  attack: 'атака',
  defense: 'защита',
  skill: 'навык',
  state: 'состояние',
  equipment: 'снаряжение',
};
</script>

<template>
  <Transition name="slide">
    <aside v-if="card && def" class="inspect" :style="{ borderColor: rarityColor[def.rarity] }">
      <button class="close" @click="emit('close')">✕</button>

      <div class="art">
        <img v-if="cardArtUrl(card.defId)" :src="cardArtUrl(card.defId)!" alt="" />
        <span v-else class="ph">✦</span>
      </div>

      <h4 class="name">
        {{ def.name }}<span v-if="card.upgradeLevel > 0" class="up">+{{ card.upgradeLevel }}</span>
      </h4>
      <div class="meta">
        <span class="cost">{{ def.cost }} ⚡</span>
        <span class="type">{{ typeNames[def.type] ?? def.type }}</span>
        <span class="rarity" :style="{ color: rarityColor[def.rarity] }">{{ def.rarity }}</span>
      </div>

      <p class="desc" v-html="descHtml"></p>

      <div class="upgrade-block">
        <template v-if="def.upgradePerLevel">
          <div class="u-title">Походное улучшение ({{ card.upgradeLevel }}/5)</div>
          <div class="u-gain">Следующий уровень: <b class="plus">{{ upgradePreview(card.defId) }}</b></div>
          <button
            v-if="canUpgrade && card.upgradeLevel < 5"
            class="u-btn"
            @click="emit('upgrade', card.uid)"
          >
            ⚒ Улучшить за костром
          </button>
          <div v-else-if="card.upgradeLevel >= 5" class="u-max">Достигнут максимум улучшения</div>
          <div v-else class="u-hint">Улучшение доступно у костра</div>
        </template>
        <div v-else class="u-none">Эта карта не улучшается</div>
      </div>
    </aside>
  </Transition>
</template>

<style lang="scss" scoped src="./TrialCardInspect.scss"></style>
