<script setup lang="ts">
/**
 * Пепел: медленные частицы поверх всех экранов (атмосфера Souls).
 * Один оверлей на приложение; частицы — div с CSS-анимацией, pointer-events: none.
 */
import { ref, onMounted } from 'vue';

interface Ash {
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  opacity: number;
  ember: boolean;
}

const particles = ref<Ash[]>([]);

onMounted(() => {
  const n = 26;
  particles.value = Array.from({ length: n }, () => ({
    left: Math.random() * 100,
    size: 2 + Math.random() * 3,
    duration: 9 + Math.random() * 14,
    delay: -Math.random() * 20,
    drift: (Math.random() - 0.5) * 160,
    opacity: 0.25 + Math.random() * 0.5,
    ember: Math.random() < 0.25,
  }));
});
</script>

<template>
  <div class="ash-overlay" aria-hidden="true">
    <span
      v-for="(p, i) in particles"
      :key="i"
      class="ash"
      :class="{ ember: p.ember }"
      :style="{
        left: `${p.left}%`,
        width: `${p.size}px`,
        height: `${p.size}px`,
        animationDuration: `${p.duration}s`,
        animationDelay: `${p.delay}s`,
        opacity: p.opacity,
        '--drift': `${p.drift}px`,
      }"
    />
  </div>
</template>

<style lang="scss" scoped src="./AshOverlay.scss"></style>
