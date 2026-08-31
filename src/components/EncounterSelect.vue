<script setup lang="ts">
/**
 * EncounterSelect — экран выбора противника (глубина похода).
 * 3 случайных обычных врага; каждая 5-я глубина — босс.
 * Опции генерируются при монтировании (новый визит = новые варианты).
 */
import { onMounted, ref } from 'vue';
import { useMetaStore } from '@/stores/meta';
import { useBattleStore } from '@/stores/battle';
import { useUiStore } from '@/stores/ui';
import { useArtStore } from '@/stores/art';
import { uiUrl } from '@/core/assets';
import { rollEncounters, AI_STYLE_HINTS, type ScaledEnemy } from '@/game/EnemyFactory';

const meta = useMetaStore();
const battle = useBattleStore();
const ui = useUiStore();
const art = useArtStore();

const options = ref<ScaledEnemy[]>([]);

onMounted(() => {
  options.value = rollEncounters(meta.progress.depth);
});

const fight = (defId: string): void => {
  battle.startBattle(defId);
};
</script>

<template>
  <div class="select">
    <header>
      <h1>ГЛУБИНА {{ meta.progress.depth }}</h1>
      <p class="sub">
        {{ options.length === 1 ? 'Впереди — могучий противник. Приготовьтесь.' : 'Тьма шепчет имена. Выберите свою судьбу.' }}
      </p>
    </header>

    <div class="cards" :class="{ boss: options.length === 1 }">
      <div
        v-for="opt in options"
        :key="opt.def.id"
        class="enemy-card"
        :class="{ boss: Boolean(opt.def.boss) }"
      >
        <div class="ribbon" v-if="opt.def.boss">БОСС</div>
        <div class="portrait">
          <img v-if="art.artUrl('enemy', opt.def.id)" :src="art.artUrl('enemy', opt.def.id)!" alt="" />
          <span v-else class="portrait-ph">👁</span>
        </div>
        <h3>{{ opt.def.name }}</h3>
        <p class="meta-line">Уровень {{ opt.def.level }} · {{ opt.def.maxHp }} HP</p>
        <p class="hint-line">{{ AI_STYLE_HINTS[opt.def.aiStyle] }}</p>
        <p v-if="opt.def.boss" class="boss-line">Фазы боя · «{{ opt.def.boss.ritual?.label }}» каждые {{ opt.def.boss.ritual?.everyTurns }} хода</p>
        <p class="drop">
          <img v-if="uiUrl('soul_icon')" :src="uiUrl('soul_icon')!" class="res-icon" alt="" /> ~{{ opt.def.soulsDrop }}
          ·
          <img v-if="uiUrl('essence_icon')" :src="uiUrl('essence_icon')!" class="res-icon" alt="" /> {{ Math.round(opt.def.essenceChance * 100) }}%
        </p>
        <button @click="fight(opt.def.id)">Сразиться</button>
      </div>
    </div>

    <footer>
      <button class="back" @click="ui.setScreen('hub')">← Вернуться в убежище</button>
    </footer>
  </div>
</template>

<style lang="scss" scoped src="./EncounterSelect.scss"></style>
