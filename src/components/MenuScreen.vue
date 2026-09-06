<script setup lang="ts">
/**
 * Главное меню: титул, «Продолжить» (при наличии прогресса) и
 * «Новая игра» с подтверждением (полный сброс профиля).
 */
import { computed, ref } from 'vue';
import { useMetaStore } from '@/stores/meta';
import { useUiStore } from '@/stores/ui';
import { sceneUrl } from '@/core/assets';

const meta = useMetaStore();
const ui = useUiStore();
const bg = sceneUrl('menu_bg') ?? sceneUrl('station');
const confirmReset = ref(false);
const hasProgress = computed(() => meta.hasProgress);

const continueGame = (): void => ui.setScreen('hub');

// «Новая игра»: сначала подтверждение потери прогресса, затем выбор класса.
// Сам сброс профиля происходит в момент выбора Пепельного на ClassSelectScreen.
const newGame = (): void => {
  confirmReset.value = false;
  ui.setScreen('class_select');
};
</script>

<template>
  <div class="menu" :style="bg ? { backgroundImage: `url(${bg})` } : {}">
    <div class="shade">
      <div class="title-block">
        <span class="over">карточный рогалик о душах павших</span>
        <h1>ECHOES<br />OF THE FALLEN</h1>
        <span class="under">демо · Угольные пустоши</span>
      </div>

      <div class="menu-buttons">
        <button v-if="hasProgress" class="btn primary" @click="continueGame">
          Продолжить
        </button>
        <button v-if="!confirmReset" class="btn" @click="confirmReset = true">
          {{ hasProgress ? 'Новая игра' : 'Начать игру' }}
        </button>
        <template v-else>
          <p class="warn">Весь прогресс — души, карты, навыки — будет потерян. Далее — выбор Пепельного.</p>
          <div class="row">
            <button class="btn danger" @click="newGame">Да, начать с нуля</button>
            <button class="btn" @click="confirmReset = false">Отмена</button>
          </div>
        </template>
      </div>

      <footer class="foot">
        <span>v0.1.0 — демонстрационная версия</span>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./MenuScreen.scss"></style>
