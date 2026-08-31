<script setup lang="ts">
/**
 * Экран выбора класса перед Актом I: 5 классов-карточек.
 * Класс = story-статы + карта (сразу в колоду!) + приветственный текст Колумбария.
 */
import { useStoryStore } from '@/stores/story';

const story = useStoryStore();

const CLASSES = [
  {
    id: 'warden',
    title: 'Страж',
    quote: '«Я охранял эти стены.»',
    desc: 'Тяжесть в руках. Память меча. Ты помнишь, как падал, защищая кого-то.',
    stats: '+2 Силы',
    card: 'warden_blade',
    cardName: 'Клинок стража (6 урона)',
  },
  {
    id: 'priest',
    title: 'Жрец',
    quote: '«Я читал огонь.»',
    desc: 'Жар на коже. Слова, зажигавшие свет. Ты помнишь, как они погасли.',
    stats: '+2 Интеллекта',
    card: 'ash_word',
    cardName: 'Слово пепла (4 урона, горение)',
  },
  {
    id: 'wanderer',
    title: 'Странник',
    quote: '«Я искал правду.»',
    desc: 'Ветер дорог, ведущих в никуда. Ты помнишь, что никогда не находил.',
    stats: '+2 Памяти',
    card: 'ash_trace',
    cardName: 'Пепельный след (добор 2)',
  },
  {
    id: 'heretic',
    title: 'Еретик',
    quote: '«Я шептал запретное.»',
    desc: 'Горечь на языке. Слова, от которых гнило железо. Ты помнишь, как тебя сожгли.',
    stats: '+2 Гнева',
    card: 'heresy',
    cardName: 'Ересь (2 урона, яд 4)',
  },
  {
    id: 'blank',
    title: 'Чистый лист',
    quote: '«Я был никем.»',
    desc: 'Пустота. Ты ничего не помнишь — и помнишь, что это твой выбор.',
    stats: '+1 ко всему',
    card: 'void_card',
    cardName: 'Пустота (1 урон, +1 энергия)',
  },
] as const;

type ClassId = 'warden' | 'priest' | 'wanderer' | 'heretic' | 'blank';

const pick = (classId: ClassId): void => {
  story.startWithClass(classId);
};
</script>

<template>
  <div class="class-select">
    <div class="intro">
      <p class="whisper">«Ты — никто. Ты — все. Ты — пепел. Ты — искра.<br/>Выбери, кем ты был, — и узнаешь, кем станешь».</p>
    </div>

    <div class="cards">
      <button
        v-for="c in CLASSES"
        :key="c.id"
        class="cls-card"
        @click="pick(c.id)"
      >
        <h3>{{ c.title }}</h3>
        <p class="quote">{{ c.quote }}</p>
        <p class="desc">{{ c.desc }}</p>
        <div class="stats">{{ c.stats }}</div>
        <div class="card-gain">{{ c.cardName }}</div>
      </button>
    </div>

    <button class="back" @click="story.cancelClassSelect()">← Назад в убежище</button>
  </div>
</template>

<style lang="scss" scoped src="./ClassSelectScreen.scss"></style>
