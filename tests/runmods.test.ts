/**
 * Тесты событий похода: благословения Святыни и искушения Тлена.
 * Эффекты живут в RunModifiers похода и применяются к движку боя.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTrialStore, SHRINE_POOL, CURSE_POOL, rollShrineOptions, rollCurseOption, type ShrineOption, type CurseOption } from '@/stores/trial';
import { useMetaStore } from '@/stores/meta';
import { CRAFT_POOL } from '@/data/cards';
import { CARDS } from '@/data/cards';
import { createCard } from '@/game/CardFactory';

const shrine = (id: string): ShrineOption => SHRINE_POOL.find((o) => o.id === id)!;
const curse = (id: string): CurseOption => CURSE_POOL.find((o) => o.id === id)!;

describe('События похода: Святыня и Тлен', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('Живучесть пепла: +12 к максимуму и текущему HP', () => {
    const t = useTrialStore();
    t.maxHp = 70; t.hp = 40;
    shrine('vigor').apply(t);
    expect(t.maxHp).toBe(82);
    expect(t.hp).toBe(52);
  });

  it('Оберег/Быстрая рука/Жадность: модификаторы похода', () => {
    const t = useTrialStore();
    shrine('ward').apply(t);
    shrine('haste').apply(t);
    shrine('greed').apply(t);
    expect(t.runMods.startBlock).toBe(5);
    expect(t.runMods.cardsPerTurnBonus).toBe(1);
    expect(t.runMods.soulsBonusPct).toBe(40);
  });

  it('Кровавая цена: −10 макс. HP (HP зажимается) и +80 душ', () => {
    const t = useTrialStore();
    const meta = useMetaStore();
    t.maxHp = 70; t.hp = 65; meta.souls = 0;
    curse('blood_price').accept(t);
    expect(t.maxHp).toBe(60);
    expect(t.hp).toBe(60); // 65 > новый максимум
    expect(meta.souls).toBe(80);
  });

  it('Пепел в глазах: +2 урона врагам и редкая карта в колоду', () => {
    const t = useTrialStore();
    t.deck = [];
    curse('ash_eyes').accept(t);
    expect(t.runMods.enemyDmgBonus).toBe(2);
    expect(t.deck).toHaveLength(1);
    expect(CARDS[t.deck[0]!.defId]).toBeDefined(); // id реальной карты
  });

  it('Клятва пустого сосуда: −30% лечения и +120 душ', () => {
    const t = useTrialStore();
    const meta = useMetaStore();
    meta.souls = 10;
    curse('oath').accept(t);
    expect(t.runMods.healMultBonus).toBeCloseTo(-0.3);
    expect(meta.souls).toBe(130);
  });

  it('Святыня предлагает два РАЗНЫХ благословения', () => {
    for (let i = 0; i < 20; i++) {
      const opts = rollShrineOptions();
      expect(opts).toHaveLength(2);
      expect(opts[0]!.id).not.toBe(opts[1]!.id);
    }
  });

  it('пулы крафта содержат только реальные id карт (регрессия keys/values)', () => {
    const ids = Object.values(CRAFT_POOL).flat();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(() => createCard(id)).not.toThrow();
    }
    // Тлен больше никогда не добавит несуществующую карту
    const t = useTrialStore();
    t.deck = [];
    curse('ash_eyes').accept(t);
    expect(() => createCard(t.deck[0]!.defId)).not.toThrow();
  });

  it('rollCurseOption возвращает валидное искушение', () => {
    const opt = rollCurseOption();
    expect(CURSE_POOL).toContain(opt);
  });
});
