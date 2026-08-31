<script setup lang="ts">
/**
 * Карточки врагов (Hearthstone-стиль): вертикальная карточка с портретом,
 * HP-баром на карточке, блоком, намерением и состояниями.
 * Клик по живой карточке — выбор цели атаки.
 */
import { useBattleStore } from '@/stores/battle';
import { useArtStore } from '@/stores/art';
import { STATES } from '@/data/states';
import { conditionIconUrl } from '@/core/assets';

const store = useBattleStore();
const art = useArtStore();

const intentText = (kind: string, value?: number): string => {
  switch (kind) {
    case 'attack': return `⚔ ${value}`;
    case 'defend': return `🛡 ${value}`;
    case 'buff': return '◈';
    default: return '...';
  };
};

/** Тултип намерения: что враг сделает на своём ходу. */
const intentTip = (kind: string, value?: number): string => {
  switch (kind) {
    case 'attack': return `Собирается нанести ${value} урона. Закройся блоком!`;
    case 'defend': return `Готовит ${value} блока. Его атаки будут слабее — копи силу.`;
    case 'buff': return 'Накладывает усиление на себя.';
    default: return 'Намерение неясно...';
  }
};
</script>

<template>
  <div class="enemies-row">
    <div
      v-for="e in store.enemies"
      :key="e.id"
      class="foe-card"
      :class="{
        dead: !e.isAlive,
        selected: e.isAlive && store.selectedTargetId === e.id,
        targetable: e.isAlive && store.aliveEnemies.length > 1,
      }"
      :data-target-id="e.id"
      @click="e.isAlive && store.selectTarget(e.id)"
    >
      <span v-if="e.isBoss" class="boss-mark">БОСС</span>
      <div class="portrait">
        <img v-if="art.artUrl('enemy', e.defId)" :src="art.artUrl('enemy', e.defId)!" alt="" />
        <span v-else>👁</span>
        <span v-if="e.isAlive" class="intent tip-host" :class="e.intent.kind">
          {{ intentText(e.intent.kind, e.intent.value) }}
          <span class="tip">{{ intentTip(e.intent.kind, e.intent.value) }}</span>
        </span>
      </div>
      <div class="body">
        <div class="name-row">
          <span class="name">{{ e.name }}</span>
          <span class="level">{{ e.level }}</span>
        </div>
        <div v-if="e.isBoss && store.enemyPhaseName" class="phase">⟡ {{ store.enemyPhaseName }}</div>
        <div class="bar">
          <div class="ghost" :style="{ width: `${(e.hp / e.maxHp) * 100}%` }" />
          <div class="fill" :style="{ width: `${(e.hp / e.maxHp) * 100}%` }" />
          <span class="bar-text">{{ e.hp }}<template v-if="e.block > 0"> +🛡{{ e.block }}</template></span>
        </div>
        <div v-if="e.states.length" class="states">
          <span
            v-for="s in e.states"
            :key="s.type"
            class="state-chip tip-host"
            :style="{ borderColor: STATES[s.type].color }"
          >
            <img v-if="conditionIconUrl(s.type)" :src="conditionIconUrl(s.type)!" alt="" />
            {{ s.stacks > 1 ? s.stacks : '' }}
            <span class="tip">{{ STATES[s.type].describe(s) }}</span>
          </span>
        </div>
        <span v-if="!e.isAlive" class="dead-mark">повержен</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./EnemyPanel.scss"></style>
