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
const bg = sceneUrl('hub_scene');
const confirmReset = ref(false);
const hasProgress = computed(() => meta.hasProgress);

const continueGame = (): void => ui.setScreen('hub');

const newGame = (): void => {
  meta.resetProfile();
  confirmReset.value = false;
  ui.setScreen('hub');
};
</script>

<template>
  <div class="menu" :style="bg ? { backgroundImage: `url(${bg})` } : {}">
    <div class="shade">
      <div class="title-block">
        <span class="over">карточная roguelike о павших</span>
        <h1>ECHOES<br />OF THE FALLEN</h1>
        <span class="under">демо · Акт I: Голос из пепла</span>
      </div>

      <div class="menu-buttons">
        <button v-if="hasProgress" class="btn primary" @click="continueGame">
          Продолжить
        </button>
        <button v-if="!confirmReset" class="btn" @click="confirmReset = true">
          {{ hasProgress ? 'Новая игра' : 'Начать игру' }}
        </button>
        <template v-else>
          <p class="warn">Весь прогресс — души, карты, навыки — будет потерян.</p>
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
