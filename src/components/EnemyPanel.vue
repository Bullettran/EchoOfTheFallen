<script setup lang="ts">
/**
 * Карточки врагов (Hearthstone-стиль): вертикальная карточка с портретом,
 * HP-баром на карточке, блоком, намерением и состояниями.
 * Клик по живой карточке — выбор цели атаки.
 * Намерение — ПОЛНЫЙ план хода врага (все карты), не только первое действие.
 */
import { useBattleStore } from '@/stores/battle';
import { useArtStore } from '@/stores/art';
import { STATES } from '@/data/states';
import { conditionIconUrl } from '@/core/assets';
import type { EnemyIntent, IntentPart } from '@/types';

const store = useBattleStore();
const art = useArtStore();

/** Бейдж: агрегированный план по видам — «⚔ 16 · 🛡 6 · ✦». */
const intentBadge = (intent: EnemyIntent): string => {
  if (!intent.parts || intent.parts.length === 0) {
    if (intent.kind === 'unknown') return '...';
    return intent.kind === 'attack' ? `⚔ ${intent.value}` : intent.kind === 'defend' ? `🛡 ${intent.value}` : '◈';
  }
  const chips: string[] = [];
  const sum = (k: IntentPart['kind']): number =>
    intent.parts!.filter((p) => p.kind === k).reduce((s, p) => s + (p.value ?? 0), 0);
  const attacks = intent.parts!.filter((p) => p.kind === 'attack');
  const defends = intent.parts!.filter((p) => p.kind === 'defend');
  const buffs = intent.parts!.filter((p) => p.kind === 'buff');
  const debuffs = intent.parts!.filter((p) => p.kind === 'debuff');
  if (attacks.length) chips.push(`⚔ ${sum('attack')}`);
  if (defends.length) chips.push(`🛡 ${sum('defend')}`);
  if (buffs.length) chips.push(`◈${buffs.length > 1 ? `×${buffs.length}` : ''}`);
  if (debuffs.length) chips.push(`✦${debuffs.length > 1 ? `×${debuffs.length}` : ''}`);
  return chips.join(' · ');
};

/** Тултип: построчный план — что враг сделает на своём ходу. */
const intentTipLines = (intent: EnemyIntent): string[] => {
  const lines: string[] = [];
  if (!intent.parts || intent.parts.length === 0) {
    if (intent.kind === 'unknown') return ['Намерение неясно...'];
    const v = intent.value !== undefined ? ` ${intent.value}` : '';
    lines.push(intent.kind === 'attack' ? `Собирается нанести${v} урона.` : intent.kind === 'defend' ? `Готовит${v} блока.` : 'Усиливает себя.');
  } else {
    lines.push(...intent.parts.map((p) => `«${p.cardName}» — ${p.detail}`));
  }
  // Превью блока: сколько урона дойдёт до HP при ТЕКУЩЕМ блоке игрока
  const attacks = intent.parts?.filter((p) => p.kind === 'attack') ?? (intent.kind === 'attack' ? [{ value: intent.value }] : []);
  const dmg = attacks.reduce((s, p) => s + (p.value ?? 0), 0);
  if (dmg > 0) {
    const block = store.player?.block ?? 0;
    lines.push(block > 0
      ? `Твой блок ${block} погасит часть — в HP уйдёт ${Math.max(0, dmg - block)}.`
      : 'Блока нет — весь урон пойдёт в HP.');
  }
  return lines;
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
          {{ intentBadge(e.intent) }}
          <span class="tip plan">
            <b class="plan-title">План хода:</b>
            <span v-for="(line, i) in intentTipLines(e.intent)" :key="i" class="plan-line">{{ line }}</span>
          </span>
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
