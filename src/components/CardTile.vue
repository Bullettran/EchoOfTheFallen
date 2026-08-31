<script setup lang="ts">
/**
 * Переиспользуемая плитка карты для хаба (кузница/мастерская/хранилище).
 * С рамкой card_frame: рамка — фон, арт — в «окне» сверху, текст — снизу.
 */
import { computed } from 'vue';
import { getCardDefinition, describeCardHtml } from '@/game/CardFactory';
import { cardArtUrl, uiUrl } from '@/core/assets';
import type { CardInstance } from '@/types';

const props = defineProps<{
  instance: CardInstance;
  selected?: boolean;
  /** Бейдж в углу («В колоде», «Ур. 2»...) */
  badge?: string;
}>();

const def = computed(() => getCardDefinition(props.instance.defId));
const artUrl = computed(() => cardArtUrl(props.instance.defId));
const frame = uiUrl('card_frame');
/** Описание с зелёным приростом от улучшений */
const descHtml = computed(() => describeCardHtml(props.instance));

const rarityColor: Record<string, string> = {
  common: '#8f8878',
  uncommon: '#4fae6d',
  rare: '#5b8ee5',
  legendary: '#e0a63c',
};
</script>

<template>
  <div
    class="tile"
    :class="{ selected, framed: Boolean(frame) }"
    :style="[
      frame ? { backgroundImage: `url(${frame})` } : { borderColor: rarityColor[def.rarity] },
      !frame && artUrl ? { backgroundImage: `url(${artUrl})` } : {},
    ]"
  >
    <img v-if="frame && artUrl" :src="artUrl" class="art-window" alt="" />
    <span class="cost">{{ def.cost }}</span>
    <span v-if="badge" class="badge">{{ badge }}</span>
    <div class="name">
      {{ def.name }}<span v-if="instance.upgradeLevel > 0" class="up">+{{ instance.upgradeLevel }}</span>
    </div>
    <div class="type">{{ def.type }}</div>
    <div class="desc" v-html="descHtml"></div>
  </div>
</template>

<style lang="scss" scoped src="./CardTile.scss"></style>
