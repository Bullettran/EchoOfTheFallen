<script setup lang="ts">
/**
 * Корневой компонент: сцена 1280×720, масштабируемая под окно (letterbox).
 * Все экраны рисуются в фиксированных координатах — дизайн не плывёт.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useUiStore } from '@/stores/ui';
import MenuScreen from '@/components/MenuScreen.vue';
import HubScreen from '@/components/HubScreen.vue';
import ClassSelectScreen from '@/components/ClassSelectScreen.vue';
import BattleScreen from '@/components/BattleScreen.vue';
import TrialMapScreen from '@/components/TrialMapScreen.vue';
import AshOverlay from '@/components/AshOverlay.vue';

const ui = useUiStore();
const stage = ref<HTMLElement | null>(null);

const BASE_W = 1280;
const BASE_H = 720;

const updateScale = (): void => {
  if (!stage.value) return;
  const s = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
  stage.value.style.transform = `scale(${s})`;
};

onMounted(() => {
  updateScale();
  window.addEventListener('resize', updateScale);
});
onBeforeUnmount(() => window.removeEventListener('resize', updateScale));
</script>

<template>
  <div class="stage-root">
    <div ref="stage" class="stage">
      <MenuScreen v-if="ui.screen === 'menu'" />
      <ClassSelectScreen v-else-if="ui.screen === 'class_select'" />
      <HubScreen v-else-if="ui.screen === 'hub'" />
      <TrialMapScreen v-else-if="ui.screen === 'trial'" />
      <BattleScreen v-else />
    </div>
  </div>
  <AshOverlay />
</template>

<style scoped>
.stage-root {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stage {
  width: 1280px;
  height: 720px;
  flex-shrink: 0;
  transform-origin: center center;
}
</style>
