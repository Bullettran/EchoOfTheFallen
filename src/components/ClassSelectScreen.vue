<script setup lang="ts">
/**
 * Экран выбора класса: Пепельный = стартовая колода + стартовые уровни Алтаря.
 * Выбор запускает новый профиль (старый прогресс теряется — предупреждение в меню).
 */
import { useUiStore } from '@/stores/ui';
import { useMetaStore } from '@/stores/meta';
import { CLASS_LIST } from '@/data/classes';
import { BRANCHES } from '@/data/skills';
import { getCardDefinition } from '@/game/CardFactory';
import { uiUrl } from '@/core/assets';
import type { BranchId } from '@/types';

const ui = useUiStore();
const meta = useMetaStore();

const branchName = (id: BranchId): string => BRANCHES.find((b) => b.id === id)?.name ?? id;

const cardOf = (cls: (typeof CLASS_LIST)[number]) => {
  // Одна «визитная» карта класса для карточки
  const hero = { courier: 'heavy_blow', welder: 'plate_armor', companion: 'rust_bomb' } as const;
  return getCardDefinition(hero[cls.id]);
};

const pick = (classId: 'courier' | 'welder' | 'companion'): void => {
  meta.resetProfile(classId);
  ui.setScreen('hub');
};

const back = (): void => ui.setScreen('menu');
</script>

<template>
  <div class="class-select">
    <div class="intro">
      <p class="whisper">Мир сгорел в Великом Пожаре. Боги и люди стали пеплом.<br />Выбери, кто понесёт их души дальше.</p>
    </div>

    <div class="cards">
      <button v-for="c in CLASS_LIST" :key="c.id" class="cls-card" @click="pick(c.id)">
        <div class="portrait">
          <img v-if="uiUrl(c.portrait)" :src="uiUrl(c.portrait)!" alt="" />
          <span v-else class="ph">{{ c.icon }}</span>
        </div>
        <h3>{{ c.icon }} {{ c.name }}</h3>
        <p class="role">{{ c.role }}</p>
        <p class="quote">{{ c.quote }}</p>
        <p class="desc">{{ c.desc }}</p>
        <div class="skills">
          <span v-for="(lvl, id) in c.startSkills" :key="id" class="skill-tag">
            +{{ lvl }} {{ branchName(id) }}
          </span>
        </div>
        <div class="card-gain">Реликвия класса: «{{ cardOf(c).name }}»</div>
        <div class="card-gain gift">Дар: {{ c.gift.icon }} {{ c.gift.name }} — {{ c.gift.describe(1) }}</div>
      </button>
    </div>

    <button class="back" @click="back">← Назад в меню</button>
  </div>
</template>

<style lang="scss" scoped src="./ClassSelectScreen.scss"></style>
