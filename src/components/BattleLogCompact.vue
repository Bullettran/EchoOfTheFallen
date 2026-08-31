<script setup lang="ts">
/** Боевой лог: обширный, со скроллом и автопрокруткой к свежим событиям. */
import { ref, watch, nextTick } from 'vue';
import { useBattleStore } from '@/stores/battle';

const store = useBattleStore();
const box = ref<HTMLElement | null>(null);

watch(
  () => store.battleLog.length,
  async () => {
    await nextTick();
    if (box.value) box.value.scrollTop = box.value.scrollHeight;
  },
);
</script>

<template>
  <div ref="box" class="battle-log-c">
    <div v-for="(line, i) in store.battleLog" :key="i" class="line" :class="line.kind">
      {{ line.text }}
    </div>
  </div>
</template>

<style lang="scss" scoped src="./BattleLogCompact.scss"></style>
