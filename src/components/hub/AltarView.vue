<script setup lang="ts">
/**
 * Алтарь: дар класса (уникальная пассивка, 0–10) + дерево навыков —
 * 5 ветвей по 10 уровней. Узел 5 — спецнавык (золотая рамка), 10 — ульта (фиолетовая).
 * Клик по узлу: выбор для описания; кнопка изучает следующий уровень ветви.
 */
import { computed, ref } from 'vue';
import { useMetaStore, SKILL_BRANCHES } from '@/stores/meta';
import { nextNode } from '@/data/skills';
import { CLASSES } from '@/data/classes';
import type { BranchId } from '@/types';

const meta = useMetaStore();
const activeBranch = ref<BranchId>('strength');

const branch = computed(() => SKILL_BRANCHES.find((b) => b.id === activeBranch.value)!);
const level = computed(() => meta.skills[activeBranch.value]);
const next = computed(() => nextNode(activeBranch.value, level.value));
const canLearn = computed(() => Boolean(next.value) && meta.souls >= (next.value?.cost ?? Infinity));

const gift = computed(() => CLASSES[meta.classId].gift);
const canLearnGift = computed(() => meta.giftLevel < 10 && meta.souls >= meta.giftCost);

const switchBranch = (id: BranchId): void => {
  activeBranch.value = id;
};

const nodeState = (nodeLevel: number): 'owned' | 'next' | 'locked' => {
  if (nodeLevel <= level.value) return 'owned';
  if (nodeLevel === level.value + 1) return 'next';
  return 'locked';
};

const learn = (): void => {
  meta.learnSkill(activeBranch.value);
};
</script>

<template>
  <div class="altar">
    <section class="gift">
      <div class="gift-info">
        <span class="g-icon">{{ gift.icon }}</span>
        <div class="g-text">
          <span class="g-name">{{ gift.name }} <em class="g-class">· дар {{ CLASSES[meta.classId].name }}а</em></span>
          <span class="g-desc">{{ gift.describe(Math.max(meta.giftLevel, 1)) }}</span>
          <span class="g-level">Уровень: {{ meta.giftLevel }}/10</span>
        </div>
      </div>
      <button v-if="meta.giftLevel < 10" :disabled="!canLearnGift" @click="meta.learnGift()">
        {{ meta.giftLevel === 0 ? 'Пробудить дар' : 'Усилить дар' }} — {{ meta.giftCost }} душ
      </button>
      <span v-else class="g-max">Дар пробуждён полностью</span>
    </section>

    <div class="branches">
      <button
        v-for="b in SKILL_BRANCHES"
        :key="b.id"
        class="branch-btn"
        :class="{ active: b.id === activeBranch }"
        :style="{ '--c': b.color }"
        @click="switchBranch(b.id)"
      >
        <span class="icon">{{ b.icon }}</span>
        <span class="bname">{{ b.name }}</span>
        <span class="blvl">{{ meta.skills[b.id] }}/10</span>
      </button>
    </div>

    <div class="tree" :style="{ '--c': branch.color }">
      <div
        v-for="n in branch.nodes"
        :key="n.level"
        class="node"
        :class="[nodeState(n.level), n.kind]"
      >
        <span class="lvl-num">{{ n.level }}</span>
        <div class="node-info">
          <span class="node-name">{{ n.name }}</span>
          <span class="node-desc">{{ n.desc }}</span>
        </div>
        <span v-if="nodeState(n.level) === 'owned'" class="mark owned">✓</span>
        <span v-else-if="nodeState(n.level) === 'next'" class="mark cost">{{ n.cost }} душ</span>
      </div>
    </div>

    <div class="footer">
      <template v-if="next">
        <p>
          Следующий уровень: <b>{{ next.name }}</b> — {{ next.desc }} (<span class="souls">{{ next.cost }} душ</span>)
        </p>
        <button :disabled="!canLearn" @click="learn">
          Изучить{{ meta.souls < next.cost ? ' — не хватает душ' : '' }}
        </button>
      </template>
      <p v-else class="maxed">Ветвь «{{ branch.name }}» изучена до предела.</p>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./AltarView.scss"></style>
