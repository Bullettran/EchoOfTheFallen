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
import { useStoryStore } from '@/stores/story';
import { eventBus } from '@/core/EventBus';
import { uiUrl } from '@/core/assets';

const store = useBattleStore();
const ui = useUiStore();
const meta = useMetaStore();
const story = useStoryStore();
const soulIcon = uiUrl('soul_icon');
const essenceIcon = uiUrl('essence_icon');

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

const removeFloat = (id: number): void => {
  floats.value = floats.value.filter((f) => f.id !== id);
};

onMounted(() => {
  eventBus.on('vfx:damage', onDamage);
  eventBus.on('vfx:heal', onHeal);
  eventBus.on('vfx:block', onBlock);
});
onBeforeUnmount(() => {
  eventBus.off('vfx:damage', onDamage);
  eventBus.off('vfx:heal', onHeal);
  eventBus.off('vfx:block', onBlock);
});

// ---- Туториал ----
const TUTORIAL_STEPS = [
  { title: 'Рука и энергия', text: 'Клик по карте (или клавиши 1–9) разыгрывает её. Число в левом верхнем углу — стоимость в энергии ⚡. Энергия восстанавливается в начале каждого хода.' },
  { title: 'Намерение врага', text: 'Бейдж на карточке врага показывает его следующий ход: ⚔ — атака (число — урон), 🛡 — защита. Планируй: закройся блоком, когда он замахивается.' },
  { title: 'Блок сгорает', text: '🛡 Блок защищает только до начала твоего следующего хода — не копи его впустую. Урон от Горения и Яда проходит сквозь блок.' },
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
            <span class="mercy-text">Она больше не сражается...</span>
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
            {{ store.phase === 'victory' ? 'ПОБЕДА' : store.phase === 'spared' ? 'ПОЩАДА' : 'ВЫ ПАЛИ' }}
          </h2>
          <p v-if="store.phase === 'spared'" class="souls">Она опускает оружие. Вода внизу абсолютно спокойна.</p>
          <p v-else-if="store.phase === 'victory' && store.lastReward" class="souls">
            <img v-if="soulIcon" :src="soulIcon" class="reward-icon" alt="" />
            {{ store.lastReward.souls }} душ
            <template v-if="store.lastReward.essence">
              · <img v-if="essenceIcon" :src="essenceIcon" class="reward-icon" alt="" />
              {{ store.lastReward.essence }} эссенция
            </template>
          </p>
          <p v-else-if="store.phase === 'victory' && store.storyContext" class="souls">Эхо рассеивается. История продолжается.</p>
          <p v-else class="souls">Тьма поглощает вас... но убежище ждёт.</p>

          <div v-if="store.storyContext" class="buttons">
            <button v-if="store.phase !== 'defeat'" class="primary" @click="story.onStoryBattleEnd(store.phase === 'spared' ? 'spared' : 'victory')">Продолжить историю</button>
            <button @click="story.onStoryBattleEnd('defeat')">Вернуться в убежище</button>
          </div>
          <div v-else class="buttons">
            <button v-if="store.phase === 'victory'" class="primary" @click="ui.setScreen('map')">Продолжить поход (глубина {{ meta.progress.depth }})</button>
            <button @click="ui.setScreen('hub')">Вернуться в убежище</button>
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
