<script setup lang="ts">
/**
 * BattleScreen — Hearthstone-раскладка:
 *   верх: карточки врагов по центру (ход слева, лог справа)
 *   низ: карточка игрока слева, рука по центру, кнопка хода справа
 * Phaser — только фон. Числа урона — HTML-всплывашки над карточками.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import PhaserGame from '@/phaser/PhaserGame.vue';
import PlayerHUD from '@/components/PlayerHUD.vue';
import EnemyPanel from '@/components/EnemyPanel.vue';
import HandView from '@/components/HandView.vue';
import BattleLogCompact from '@/components/BattleLogCompact.vue';
import { useBattleStore } from '@/stores/battle';
import { useUiStore } from '@/stores/ui';
import { useMetaStore } from '@/stores/meta';
import { useTrialStore } from '@/stores/trial';
import { eventBus } from '@/core/EventBus';
import { STATES } from '@/data/states';
import type { StateInstance } from '@/types';

const store = useBattleStore();
const ui = useUiStore();
const meta = useMetaStore();
const trial = useTrialStore();

/** HP < 30% — красная пульсация краёв экрана */
const lowHp = computed(() => {
  const p = store.player;
  return Boolean(p && p.hp > 0 && p.hp / p.maxHp < 0.3);
});

// ---- Всплывающие числа и встряска карточек по событиям ----
const floats = ref<Array<{ id: number; text: string; color: string; x: number; y: number }>>([]);
let floatId = 0;

const spawnFloat = (targetId: string, text: string, color: string): void => {
  const el = document.querySelector(`[data-target-id="${targetId}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  floats.value.push({ id: floatId++, text, color, x: r.left + r.width / 2, y: r.top + 8 });
  el.classList.remove('hit-shake');
  void (el as HTMLElement).offsetWidth; // рестарт анимации
  el.classList.add('hit-shake');
};

const onDamage = ({ targetId, amount }: { targetId: string; amount: number }): void => {
  if (amount > 0) spawnFloat(targetId, `−${amount}`, targetId === 'player' ? '#ff5544' : '#ff8a5a');
};
const onHeal = ({ targetId, amount }: { targetId: string; amount: number }): void => {
  spawnFloat(targetId, `+${amount}`, '#7dff8a');
};
const onBlock = ({ targetId, amount }: { targetId: string; amount: number }): void => {
  spawnFloat(targetId, `🛡${amount}`, '#6db3ff');
};
/** Наложение состояния — всплывашка с иконкой и именем (биты/дебафы всегда видны) */
const onState = ({ targetId, state }: { targetId: string; state: StateInstance }): void => {
  const def = STATES[state.type];
  spawnFloat(targetId, `${def.icon} ${def.name}`, def.color);
};

const removeFloat = (id: number): void => {
  floats.value = floats.value.filter((f) => f.id !== id);
};

onMounted(() => {
  eventBus.on('vfx:damage', onDamage);
  eventBus.on('vfx:heal', onHeal);
  eventBus.on('vfx:block', onBlock);
  eventBus.on('vfx:state', onState);
});
onBeforeUnmount(() => {
  eventBus.off('vfx:damage', onDamage);
  eventBus.off('vfx:heal', onHeal);
  eventBus.off('vfx:block', onBlock);
  eventBus.off('vfx:state', onState);
  store.abortEnemyTurn(); // таймеры хода врага не должны тикать в мёртвом экране
});

// ---- Туториал ----
const TUTORIAL_STEPS = [
  { title: 'Рука и энергия', text: 'Клик по карте (или клавиши 1–9) разыгрывает её. Число в левом верхнем углу — стоимость в энергии ⚡. Энергия восстанавливается в начале каждого хода.' },
  { title: 'Намерение врага', text: 'Бейдж на карточке врага показывает его следующий ход: ⚔ — атака (число — урон), 🛡 — защита. Планируй: закройся блоком, когда он замахивается.' },
  { title: 'Блок сгорает', text: '🛡 Блок защищает только до начала твоего следующего хода — не копи его впустую. Урон от Горения и Гнили проходит сквозь блок.' },
];
const tutorialStep = ref(-1);
if (!meta.tutorialDone) tutorialStep.value = 0;
const closeTutorial = (): void => {
  tutorialStep.value = -1;
  meta.tutorialDone = true;
};
const nextTutorial = (): void => {
  if (tutorialStep.value < TUTORIAL_STEPS.length - 1) tutorialStep.value += 1;
  else closeTutorial();
};
</script>

<template>
  <div class="battle-screen">
    <PhaserGame />
    <div class="battle-vignette" aria-hidden="true"></div>
    <div v-if="lowHp" class="low-hp" aria-hidden="true"></div>

    <div class="hud-overlay">
      <!-- ВЕРХ: ход · враги · лог -->
      <div class="top-zone">
        <div class="side left">
          <span class="turn-num">Ход {{ store.turn + 1 }}</span>
          <span class="depth">глубина {{ meta.progress.depth }}</span>
        </div>
        <EnemyPanel />
        <div class="side right"><BattleLogCompact /></div>
      </div>

      <div class="spacer" />

      <!-- НИЗ: игрок · рука · кнопка -->
      <div class="bottom-zone">
        <PlayerHUD />
        <HandView />
        <div class="right-bottom">
          <div v-if="store.mercyAvailable" class="mercy">
            <span class="mercy-text">Он больше не сражается...</span>
            <span class="mercy-tip">Пощада: половина душ, но +1 очко милосердия (скидка торговца)</span>
            <button class="mercy-btn" @click="store.spareEnemy()">🤝 Пощадить</button>
          </div>
          <button class="end-turn" :class="{ ready: store.isPlayerTurn }" :disabled="!store.isPlayerTurn" @click="store.endTurn()">
            Завершить ход <span class="hint">[Space]</span>
          </button>
        </div>
      </div>

          <!-- Экран завершения боя -->
          <div v-if="store.battleOver" class="game-over">
            <div class="panel">
              <div class="ornament">✦ ──── ✦ ──── ✦</div>
              <h2 :class="{ spared: store.phase === 'spared' }">
                {{ store.phase === 'victory' ? 'ПОБЕДА' : store.phase === 'spared' ? 'ПОЩАДА' : 'ВЫ УГАСЛИ' }}
              </h2>
              <p v-if="store.phase === 'spared'" class="souls">Он опускает оружие. Пепел медленно оседает на землю.</p>
              <p v-else-if="store.phase === 'victory'" class="souls">Враг рассыпается пеплом. Можно собрать души.</p>
              <p v-else class="souls">Уголёк гаснет... но Последний очаг воскресит тебя.</p>

            <!-- Походный бой: возврат на карту -->
            <div class="buttons">
              <button
                v-if="store.phase !== 'defeat'"
                class="primary"
                @click="trial.onBattleEnd(store.phase === 'spared' ? 'spared' : 'victory', store.player?.hp ?? 0)"
              >
                Продолжить поход
              </button>
            <button
              v-if="store.phase === 'defeat'"
              @click="trial.onBattleEnd('defeat', 0)"
            >
              Поход окончен
            </button>
            <button @click="ui.setScreen('hub')">Вернуться в Очаг</button>
          </div>
          <div class="ornament">✦ ──── ✦ ──── ✦</div>
        </div>
      </div>
      <div v-else-if="store.busy" class="turn-banner">Ход противника...</div>
      <div v-else class="turn-banner player">Ваш ход</div>

      <!-- Туториал -->
      <div v-if="tutorialStep >= 0" class="tutorial-overlay" @click="closeTutorial">
        <div class="tutorial-panel" @click.stop>
          <span class="t-counter">{{ tutorialStep + 1 }} / {{ TUTORIAL_STEPS.length }}</span>
          <h3>{{ TUTORIAL_STEPS[tutorialStep]!.title }}</h3>
          <p>{{ TUTORIAL_STEPS[tutorialStep]!.text }}</p>
          <div class="t-buttons">
            <button class="btn skip" @click="closeTutorial">Пропустить</button>
            <button class="btn" @click="nextTutorial">{{ tutorialStep < TUTORIAL_STEPS.length - 1 ? 'Далее' : 'В бой' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Всплывающие числа поверх всего -->
    <div
      v-for="f in floats"
      :key="f.id"
      class="float-num"
      :style="{ left: `${f.x}px`, top: `${f.y}px`, color: f.color }"
      @animationend="removeFloat(f.id)"
    >{{ f.text }}</div>
  </div>
</template>

<style lang="scss" scoped src="./BattleScreen.scss"></style>
