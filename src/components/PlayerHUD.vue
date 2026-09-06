<script setup lang="ts">
/**
 * Карточка игрока (Hearthstone-стиль): портрет, HP-бар, блок, состояния, энергия.
 * Стоит слева-снизу, над рукой.
 */
import { useBattleStore } from '@/stores/battle';
import { STATES } from '@/data/states';
import { conditionIconUrl, uiUrl, playerPortraitUrl } from '@/core/assets';

const store = useBattleStore();
const portrait = playerPortraitUrl();
const orbFull = uiUrl('orb_full');
const orbEmpty = uiUrl('orb_empty');
</script>

<template>
  <div v-if="store.player" class="hero-card" data-target-id="player">
    <div class="portrait tip-host">
      <img v-if="portrait" :src="portrait" alt="" />
      <span v-else>👤</span>
      <span class="tip">Пепельный — это ты. Держи HP выше нуля: ноль — угасание и возврат в Последний очаг.</span>
    </div>
    <div class="body">
      <div class="name-row">
        <span class="name">{{ store.player.name }}</span>
        <span v-if="store.player.block > 0" class="block tip-host">
          🛡 {{ store.player.block }}
          <span class="tip">Блок: поглощает урон до начала твоего следующего хода. Не защищает от Горения и Гнили.</span>
        </span>
      </div>
      <div class="bar hp tip-host">
        <div class="ghost" :style="{ width: `${(store.player.hp / store.player.maxHp) * 100}%` }" />
        <div class="fill" :style="{ width: `${(store.player.hp / store.player.maxHp) * 100}%` }" />
        <span class="bar-text">{{ store.player.hp }} / {{ store.player.maxHp }}</span>
        <span class="tip">Жизненная сила. Урон врага и Горение/Гниль снижают её. Ниже 30% экран пульсирует красным.</span>
      </div>
      <div v-if="store.player.states.length" class="states">
        <span
          v-for="s in store.player.states"
          :key="s.type"
          class="state-chip tip-host"
          :style="{ borderColor: STATES[s.type].color }"
        >
          <img v-if="conditionIconUrl(s.type)" :src="conditionIconUrl(s.type)!" alt="" />
          {{ s.stacks > 1 ? s.stacks : '' }}
          <span class="tip">{{ STATES[s.type].describe(s) }}</span>
        </span>
      </div>
      <div class="meta">
        <span class="orbs tip-host">
          <span
            v-for="i in store.maxEnergy"
            :key="i"
            class="orb"
            :style="{
              backgroundImage: i <= store.energy && orbFull
                ? `url(${orbFull})`
                : orbEmpty
                  ? `url(${orbEmpty})`
                  : undefined,
            }"
            :class="{ lit: i <= store.energy }"
          />
          <span class="tip">Энергия ⚡: тратится на карты. Восстанавливается полностью в начале хода.</span>
        </span>
        <span class="piles tip-host">К {{ store.drawCount }} · С {{ store.discardCount }}
          <span class="tip">Колода (К) — откуда берёшь карты. Сброс (С) — куда уходят сыгранные. Пустая колода тасует сброс обратно.</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./PlayerHUD.scss"></style>
