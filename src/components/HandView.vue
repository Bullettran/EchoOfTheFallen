<script setup lang="ts">
/**
 * Рука карт: веерная раскладка (лёгкий поворот/дуга), hover-подъём,
 * тултип с полным описанием, горячие клавиши 1..9, Space — конец хода.
 * Углы поворота считаются от центра руки — CSS-переменными per-card.
 */
import { onMounted, onBeforeUnmount } from 'vue';
import { useBattleStore } from '@/stores/battle';
import { useArtStore } from '@/stores/art';
import { uiUrl } from '@/core/assets';
import { describeCardHtml } from '@/game/CardFactory';

const store = useBattleStore();
const art = useArtStore();
const frame = uiUrl('card_frame');

const rarityColor: Record<string, string> = {
  common: '#8f8878',
  uncommon: '#4fae6d',
  rare: '#5b8ee5',
  legendary: '#e0a63c',
};

/** Стиль конкретной карты в веере: угол и вертикальный сдвиг от центра. */
const fanStyle = (index: number): Record<string, string> => {
  const n = store.hand.length;
  const center = (n - 1) / 2;
  const offset = index - center;
  const rot = offset * 4;        // до ~±16°
  const dy = Math.abs(offset) * 4; // мягкая дуга (не уводит крайние за экран)
  return {
    '--rot': `${rot}deg`,
    '--dy': `${dy}px`,
    '--rz': String(n - index),   // z-index: правые карты выше
    'animation-delay': `${index * 60}ms`,
  };
};

const onKey = (e: KeyboardEvent): void => {
  if (e.code === 'Space' || e.code === 'KeyE') {
    e.preventDefault();
    store.endTurn();
    return;
  }
  const n = Number(e.key);
  if (n >= 1 && n <= 9) {
    const card = store.hand[n - 1];
    if (card) {
      flyCardToEnemy(document.querySelectorAll('.hand .card')[n - 1] as HTMLElement | undefined);
      store.playCard(card.uid);
    }
  }
};

/** Анимация розыгрыша: клон карты летит к врагу и растворяется. */
function flyCardToEnemy(el: HTMLElement | undefined): void {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.style.position = 'fixed';
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = '0';
  ghost.style.zIndex = '200';
  ghost.style.pointerEvents = 'none';
  ghost.style.transform = 'none';
  ghost.style.transition = 'transform 0.45s cubic-bezier(0.3, 0.7, 0.4, 1), opacity 0.45s ease-in';
  document.body.appendChild(ghost);
  // цель — арена врага: центр по фактическому положению canvas (масштаб учитывается)
  const canvas = document.querySelector('.battle-screen canvas') as HTMLElement | null;
  const cr = canvas?.getBoundingClientRect();
  const tx = (cr ? cr.left + cr.width * 0.72 : window.innerWidth * 0.72) - (rect.left + rect.width / 2);
  const ty = (cr ? cr.top + cr.height * 0.38 : window.innerHeight * 0.38) - (rect.top + rect.height / 2);
  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${tx}px, ${ty}px) rotate(12deg) scale(0.35)`;
    ghost.style.opacity = '0.15';
  });
  setTimeout(() => ghost.remove(), 500);
}

const playCard = (e: MouseEvent, uid: string): void => {
  flyCardToEnemy(e.currentTarget as HTMLElement);
  store.playCard(uid);
};

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="hand-zone">
    <div class="hand">
      <div
        v-for="(card, i) in store.hand"
        :key="card.uid"
        class="card"
        :class="{ unplayable: !card.playable, framed: Boolean(frame) }"
        :style="[fanStyle(i), frame ? { borderImageSource: `url(${frame})` } : { borderColor: rarityColor[card.rarity] }]"
        @click="playCard($event, card.uid)"
      >
        <div class="cost">{{ card.cost }}</div>
        <div class="name">
          {{ card.name }}<span v-if="card.upgradeLevel > 0" class="up">+{{ card.upgradeLevel }}</span>
        </div>
        <div class="type">{{ card.type }}</div>
        <div class="art">
          <img v-if="art.artUrl('card', card.defId)" :src="art.artUrl('card', card.defId)!" alt="" />
          <template v-else>✦</template>
        </div>
        <div class="hotkey">{{ i + 1 }}</div>
        <div class="tooltip">
          <span class="t-name">{{ card.name }}<template v-if="card.upgradeLevel > 0">+{{ card.upgradeLevel }}</template></span>
          <span class="t-type">{{ card.type }} · {{ card.rarity }}</span>
          <span class="t-desc" v-html="describeCardHtml(card)"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./HandView.scss"></style>
