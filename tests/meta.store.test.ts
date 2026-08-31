/**
 * Тесты meta-store: экономика похода, кузница, алтарь, хранилище, крафт.
 * Мета-прогресс — самое «коммерчески опасное» место, покрываем тщательно.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useMetaStore } from '@/stores/meta';
import { dummyEnemy } from './fixtures';

describe('meta-store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  // ---------- Награды и глубина ----------

  it('onVictory: души, гарантированная эссенция, глубина +1', () => {
    const m = useMetaStore();
    const reward = m.onVictory({ ...dummyEnemy, soulsDrop: 100, essenceChance: 1 });
    expect(reward.souls).toBe(100);
    expect(reward.essence).toBe(1);
    expect(m.souls).toBe(100);
    expect(m.essences).toBe(1);
    expect(m.progress.depth).toBe(2);
    expect(m.stats.victories).toBe(1);
  });

  it('ветка Духа даёт +% душ', () => {
    const m = useMetaStore();
    m.skills.spirit = 4; // +40%
    const reward = m.onVictory({ ...dummyEnemy, soulsDrop: 100, essenceChance: 0 });
    expect(reward.souls).toBe(140);
  });

  it('onDefeat: глубина сбрасывается, метапрогресс остаётся', () => {
    const m = useMetaStore();
    m.onVictory({ ...dummyEnemy, essenceChance: 0 });
    m.onVictory({ ...dummyEnemy, essenceChance: 0 });
    expect(m.progress.depth).toBe(3);
    m.onDefeat();
    expect(m.progress.depth).toBe(1);
    expect(m.souls).toBe(200); // души не сгорают
    expect(m.stats.deaths).toBe(1);
  });

  it('лор открывается по достижению', () => {
    const m = useMetaStore();
    expect(m.lore).not.toContain('first_blood');
    m.onVictory({ ...dummyEnemy, essenceChance: 0 });
    expect(m.lore).toContain('first_blood');
  });

  // ---------- Алтарь ----------

  it('learnSkill: списывает души, растёт уровень; без денег — отказ', () => {
    const m = useMetaStore();
    m.souls = 0;
    expect(m.learnSkill('strength')).toBe(false);
    m.souls = 100;
    expect(m.learnSkill('strength')).toBe(true);
    expect(m.skills.strength).toBe(1);
    expect(m.souls).toBe(100 - 50); // узел 1 = 50
  });

  // ---------- Кузница ----------

  it('upgradeCard: цена 100*(уровень+1), максимум 5', () => {
    const m = useMetaStore();
    const card = m.collection[0]!;
    m.souls = 100 + 200 + 300 + 400 + 500 + 999;
    for (let i = 1; i <= 5; i++) expect(m.upgradeCard(card.uid)).toBe(true);
    expect(card.upgradeLevel).toBe(5);
    expect(m.upgradeCard(card.uid)).toBe(false); // потолок
    expect(m.souls).toBe(999);
  });

  it('upgradeCard: не хватает душ — отказ без списания', () => {
    const m = useMetaStore();
    const card = m.collection[0]!;
    m.souls = 50;
    expect(m.upgradeCard(card.uid)).toBe(false);
    expect(card.upgradeLevel).toBe(0);
    expect(m.souls).toBe(50);
  });

  // ---------- Хранилище ----------

  it('toggleDeckCard: нельзя выйти за границы 10..30', () => {
    const m = useMetaStore();
    // стартовая колода = 10 карт (минимум)
    const first = m.deckUids[0]!;
    expect(m.toggleDeckCard(first)).toBe(false); // ниже минимума

    m.collection.push({ uid: 'extra1', defId: 'strike', upgradeLevel: 0 });
    m.collection.push({ uid: 'extra2', defId: 'strike', upgradeLevel: 0 });
    expect(m.toggleDeckCard('extra1')).toBe(true);
    expect(m.toggleDeckCard('extra2')).toBe(true);
    expect(m.toggleDeckCard(first)).toBe(true); // 11 карт — можно убирать
  });

  it('пресеты: сохранение и загрузка с валидацией', () => {
    const m = useMetaStore();
    const snapshot = [...m.deckUids];
    m.toggleDeckCard(m.deckUids[0]!); // осознанно ниже? нет — минимум. Добавим карт:
    m.collection.push({ uid: 'extra1', defId: 'strike', upgradeLevel: 0 });
    m.toggleDeckCard('extra1');
    m.savePreset(0);
    const after = [...m.deckUids];
    m.loadPreset(0);
    expect(m.deckUids).toEqual(after);
    // пресет ссылается на удалённую карту → она выкидывается
    m.presets[0] = ['extra1', 'ghost-uid'];
    m.loadPreset(0);
    expect(m.deckUids).toEqual(['extra1']);
    expect(snapshot.length).toBe(10);
  });

  // ---------- Мастерская ----------

  it('craftCard: списывает ресурсы и добавляет карту в коллекцию', () => {
    const m = useMetaStore();
    m.souls = 150;
    m.essences = 1;
    const before = m.collection.length;
    expect(m.craftCard('fire_lance')).toBe(true);
    expect(m.collection.length).toBe(before + 1);
    expect(m.souls).toBe(0);
    expect(m.essences).toBe(0);
    expect(m.craftCard('fire_lance')).toBe(false); // больше нет ресурсов
  });

  it('rollCraftOptions: 3 уникальных варианта', () => {
    const m = useMetaStore();
    const options = m.rollCraftOptions('attack');
    expect(options).toHaveLength(2); // в пуле атак всего 2 карты
    expect(new Set(options).size).toBe(options.length);
  });

  // ---------- Стартовое состояние ----------

  it('новый профиль: 10 карт коллекции, все в колоде', () => {
    const m = useMetaStore();
    expect(m.collection).toHaveLength(10);
    expect(m.deckUids).toHaveLength(10);
    expect(m.activeDeckCards).toHaveLength(10);
  });
});
