<script setup lang="ts">
/**
 * Хранилище: вся коллекция карт, сборка боевой колоды (тоггл кликом),
 * 3 слота пресетов. Ограничения — BALANCE.hub (min/max).
 */
import { computed } from 'vue';
import { useMetaStore } from '@/stores/meta';
import { BALANCE } from '@/core/config';
import CardTile from '@/components/CardTile.vue';

const meta = useMetaStore();

const deckOk = computed(() => meta.deckUids.length >= BALANCE.hub.minDeck);
const deckUids = computed(() => new Set(meta.deckUids));

const toggle = (uid: string): void => {
  meta.toggleDeckCard(uid);
};
</script>

<template>
  <div class="vault">
    <div class="sidebar">
      <div class="deck-count" :class="{ ok: deckOk }">
        Колода: {{ meta.deckUids.length }} / {{ BALANCE.hub.maxDeck }}
        <span v-if="!deckOk" class="warn">(минимум {{ BALANCE.hub.minDeck }})</span>
      </div>

      <div class="presets">
        <p class="title">Пресеты колод</p>
        <div v-for="i in 3" :key="i" class="preset-row">
          <button :disabled="!deckOk" @click="meta.savePreset(i - 1)">Сохранить {{ i }}</button>
          <button :disabled="!meta.presets[i - 1]" @click="meta.loadPreset(i - 1)">
            {{ meta.presets[i - 1] ? `Загрузить (${meta.presets[i - 1]!.length})` : `Слот ${ i } пуст` }}
          </button>
        </div>
      </div>

      <p class="hint">Клик по карте — добавить/убрать из колоды.</p>
    </div>

    <div class="grid">
      <CardTile
        v-for="card in meta.collection"
        :key="card.uid"
        :instance="card"
        :selected="deckUids.has(card.uid)"
        :badge="deckUids.has(card.uid) ? 'в колоде' : undefined"
        @click="toggle(card.uid)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped src="./VaultView.scss"></style>
