<script setup lang="ts">
/**
 * Зал Эха: статистика и эхо павших героев (лор).
 */
import { useMetaStore } from '@/stores/meta';
import { LORE } from '@/data/lore';

const meta = useMetaStore();

const statRows: { label: string; value: () => number }[] = [
  { label: 'Сражений', value: () => meta.stats.battles },
  { label: 'Побед', value: () => meta.stats.victories },
  { label: 'Смертей', value: () => meta.stats.deaths },
  { label: 'Врагов повержено', value: () => meta.stats.enemiesSlain },
  { label: 'Душ собрано', value: () => meta.stats.soulsEarned },
  { label: 'Уровней навыков', value: () => meta.totalSkillLevels },
];
</script>

<template>
  <div class="statue">
    <div class="stats">
      <div v-for="row in statRows" :key="row.label" class="stat">
        <span class="value">{{ row.value() }}</span>
        <span class="label">{{ row.label }}</span>
      </div>
    </div>

    <div class="lore">
      <div
        v-for="frag in LORE"
        :key="frag.id"
        class="fragment"
        :class="{ locked: !meta.lore.includes(frag.id) }"
      >
        <h4>{{ meta.lore.includes(frag.id) ? frag.title : '· · ·' }}</h4>
        <p v-if="meta.lore.includes(frag.id)">{{ frag.text }}</p>
        <p v-else class="sealed">Эхо умолкло. Собирайте души, чтобы вспомнить.</p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./StatueView.scss"></style>
