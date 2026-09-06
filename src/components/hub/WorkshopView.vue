<script setup lang="ts">
/**
 * Горнило: создание новых карт за души + угли.
 * Флоу: выбор типа → 3 случайных варианта → выбор одного.
 */
import { ref } from 'vue';
import { useMetaStore } from '@/stores/meta';
import { getCardDefinition } from '@/game/CardFactory';
import { BALANCE } from '@/core/config';
import type { CardType } from '@/types';

const meta = useMetaStore();
const options = ref<string[] | null>(null);
const chosenType = ref<CardType | null>(null);

const TYPES: { id: CardType; label: string }[] = [
  { id: 'attack', label: 'Атака ⚔' },
  { id: 'defense', label: 'Защита 🛡' },
  { id: 'skill', label: 'Навык ◈' },
  { id: 'state', label: 'Состояние ✦' },
];

const roll = (type: CardType): void => {
  chosenType.value = type;
  options.value = meta.rollCraftOptions(type);
};

const craft = (defId: string): void => {
  if (meta.craftCard(defId)) {
    options.value = null;
    chosenType.value = null;
  }
};
</script>

<template>
  <div class="workshop">
    <div class="intro">
      <p>
        Из переплавленных душ и чужих углей рождается новая реликвия. Цена:
        <span class="price">{{ BALANCE.hub.craftSoulCost }} душ + {{ BALANCE.hub.craftEssenceCost }} уголёк</span>.
        У вас: <span class="res">{{ meta.souls }} душ</span> ·
        <span class="res">{{ meta.essences }} углей</span>
      </p>
    </div>

    <div v-if="!options" class="types">
      <button
        v-for="t in TYPES"
        :key="t.id"
        :disabled="!meta.canAffordCraft()"
        @click="roll(t.id)"
      >
        {{ t.label }}
      </button>
      <p v-if="!meta.canAffordCraft()" class="hint">
        Не хватает ресурсов — угли выпадают из павших врагов.
      </p>
    </div>

    <div v-else class="options">
      <p class="choose">Горнило предлагает — выберите одно:</p>
      <div class="cards">
        <div
          v-for="defId in options"
          :key="defId"
          class="option"
          @click="craft(defId)"
        >
          <div class="name">{{ getCardDefinition(defId).name }}</div>
          <div class="cost">{{ getCardDefinition(defId).cost }} энергии</div>
          <div class="desc">{{ getCardDefinition(defId).description }}</div>
          <div class="cta">Создать</div>
        </div>
      </div>
      <button class="cancel" @click="options = null">Отказаться</button>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./WorkshopView.scss"></style>
