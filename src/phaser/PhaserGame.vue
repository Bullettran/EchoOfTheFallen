/**
 * Мост Vue → Phaser. Инициализация — один раз при монтировании контейнера;
 * destroy() обязателен при отмонтировании, иначе утечки WebGL-контекста
 * (лимит браузера — ~16 живых контекстов).
 *
 * Оптимизация: Phaser стартует в ROUND_PIXELS и без лишних пайплайнов —
 * для карточной игры важна экономия GPU, а не физика.
 */
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import Phaser from 'phaser';
import { BattleScene } from '@/phaser/scenes/BattleScene';

const container = ref<HTMLDivElement | null>(null);
let game: Phaser.Game | null = null;

onMounted(() => {
  if (!container.value) return;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container.value,
    width: 1280,
    height: 720,
    backgroundColor: '#0b0a0f',
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BattleScene],
  });
});

onBeforeUnmount(() => {
  game?.destroy(true);
  game = null;
});
</script>

<template>
  <div ref="container" class="phaser-host" />
</template>

<style lang="scss" scoped src="./PhaserGame.scss"></style>
