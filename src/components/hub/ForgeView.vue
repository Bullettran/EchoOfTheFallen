<script setup lang="ts">
/**
 * Кузня: улучшение карт коллекции за души.
 * Прирост за уровень задаётся data (upgradePerLevel), стоимость — BALANCE.hub.
 */
import { computed, ref } from 'vue';
import { useMetaStore } from '@/stores/meta';
import { useArtStore } from '@/stores/art';
import { getCardDefinition, upgradePreview, describeCardHtml } from '@/game/CardFactory';
import CardTile from '@/components/CardTile.vue';

const meta = useMetaStore();
const art = useArtStore();
const selectedUid = ref<string | null>(null);

const selected = computed(() => meta.collection.find((c) => c.uid === selectedUid.value) ?? null);
const selectedDef = computed(() => (selected.value ? getCardDefinition(selected.value.defId) : null));
const cost = computed(() => (selected.value ? meta.upgradeCost(selected.value.uid) : 0));
const canUpgrade = computed(
  () => Boolean(selected.value) && selected.value!.upgradeLevel < 5 && meta.souls >= cost.value,
);
</script>

<template>
  <div class="forge">
    <div class="grid">
      <CardTile
        v-for="card in meta.collection"
        :key="card.uid"
        :instance="card"
        :selected="card.uid === selectedUid"
        @click="selectedUid = card.uid"
      />
    </div>

    <div class="panel" v-if="selected && selectedDef">
      <img
        v-if="selected && art.artUrl('card', selected.defId)"
        :src="art.artUrl('card', selected.defId)!"
        class="art-preview"
        alt="Арт карты"
      />
      <h3>{{ selectedDef.name }} <span class="lvl">ур. {{ selected.upgradeLevel }}/5</span></h3>
      <p class="desc" v-html="describeCardHtml(selected)"></p>
      <p v-if="selected.upgradeLevel < 5" class="gain">
        Следующий уровень: <span style="color:#7dd87d">{{ upgradePreview(selected.defId) }}</span>
      </p>
      <p v-else class="gain max">Достигнут максимум улучшения</p>
      <button :disabled="!canUpgrade" @click="meta.upgradeCard(selected.uid)">
        Улучшить — {{ cost }} душ
      </button>
      <p class="hint" v-if="selected.upgradeLevel < 5 && meta.souls < cost">Недостаточно душ</p>
    </div>
    <div class="panel empty" v-else>
      <p>Выберите карту для улучшения.</p>
      <p class="hint">Каждый уровень: +прирост к базовым характеристикам. Максимум — 5.</p>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./ForgeView.scss"></style>
