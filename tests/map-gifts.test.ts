/**
 * Инварианты карты похода (genMap) и экономики дара (learnGift).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia, setActivePinia as setPinia } from 'pinia';
import { useTrialStore } from '@/stores/trial';
import { useMetaStore } from '@/stores/meta';
import { BALANCE } from '@/core/config';
import { makeEngine, playByDefId, dummyEnemy } from './fixtures';

describe('Карта похода: инварианты genMap', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useMetaStore().resetProfile('courier');
  });

  const startTrial = () => {
    const trial = useTrialStore();
    trial.start();
    return trial;
  };

  it('15 этажей; последний — единственный босс; предбоссовый — только костёр/торговец', () => {
    const t = startTrial();
    expect(t.floors).toHaveLength(BALANCE.progression.bossEveryDepth);
    const bossFloor = t.floors.at(-1)!;
    expect(bossFloor.nodes).toHaveLength(1);
    expect(bossFloor.nodes[0]!.type).toBe('boss');
    const preBoss = t.floors.at(-2)!;
    for (const n of preBoss.nodes) {
      expect(['campfire', 'shop']).toContain(n.type);
    }
  });

  it('первый этаж содержит бой; на этаже элиты (8) есть хотя бы одна элита', () => {
    const t = startTrial();
    expect(t.floors[0]!.nodes.some((n) => n.type === 'battle')).toBe(true);
    const eliteFloor = t.floors[BALANCE.progression.eliteFloor - 1]!;
    expect(eliteFloor.nodes.some((n) => n.type === 'elite')).toBe(true);
  });

  it('каждый узел следующего этажа достижим: есть входящее ребро из предыдущего', () => {
    const t = startTrial();
    for (let f = 0; f < t.floors.length - 1; f++) {
      const next = t.floors[f + 1]!;
      for (let k = 0; k < next.nodes.length; k++) {
        const hasIn = t.floors[f]!.edges.some((e) => e[1] === k);
        expect(hasIn, `этаж ${f + 2}, узел ${k}: нет входящей тропы`).toBe(true);
      }
    }
  });

  it('тропы не пересекаются (монотонность отображения индексов)', () => {
    const t = startTrial();
    for (let f = 0; f < t.floors.length - 1; f++) {
      const edges = t.floors[f]!.edges;
      for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
          const [a1, b1] = edges[i]!;
          const [a2, b2] = edges[j]!;
          const crossed = (a1 < a2 && b1 > b2) || (a1 > a2 && b1 < b2);
          expect(crossed, `этаж ${f + 1}: тропы (${a1}→${b1}) и (${a2}→${b2}) пересекаются`).toBe(false);
        }
      }
    }
  });

  it('старт: доступны все узлы 1-го этажа; после узла — только его соседи', () => {
    const t = startTrial();
    expect(t.reachableIds.size).toBe(t.floors[0]!.nodes.length);
    const first = t.floors[0]!.nodes[0]!;
    t.clearNodeById(first.id);
    const cur = t.floors[0]!;
    const expected = new Set(cur.edges.filter((e) => e[0] === 0).map((e) => t.floors[1]!.nodes[e[1]]!.id));
    expect(t.reachableIds).toEqual(expected);
    expect(t.choiceFloorNumber).toBe(2);
  });
});

describe('Дар класса: экономика learnGift', () => {
  beforeEach(() => {
    setPinia(createPinia());
  });

  it('уровни 0→10, цены как у узлов ветвей (50…230), дальше — отказ', () => {
    const meta = useMetaStore();
    meta.souls = 1400;
    for (let lvl = 1; lvl <= 10; lvl++) {
      expect(meta.giftCost).toBe(30 + 20 * lvl);
      expect(meta.learnGift()).toBe(true);
      expect(meta.giftLevel).toBe(lvl);
    }
    expect(meta.giftLevel).toBe(10);
    expect(meta.giftCost).toBe(Infinity);
    expect(meta.learnGift()).toBe(false); // максимум
    expect(meta.souls).toBe(0); // потрачено ровно 1400
  });

  it('без душ дар не пробудить', () => {
    const meta = useMetaStore();
    meta.souls = 10;
    expect(meta.learnGift()).toBe(false);
    expect(meta.giftLevel).toBe(0);
  });
});

describe('Карты-проклятия', () => {
  it('не играются и обычная карта играется рядом с ними', () => {
    const e = makeEngine(['curse_tar', 'curse_dread', 'strike', 'guard', 'guard'], {}, undefined, 0);
    e.start();
    // Проклятые карты в руе неиграбельны
    const tar = e.hand.find((c) => c.defId === 'curse_tar')!;
    const dread = e.hand.find((c) => c.defId === 'curse_dread')!;
    expect(e.playCard(tar.uid)).toBe(false);
    expect(e.playCard(dread.uid)).toBe(false);
    // Обычная карта играется
    expect(playByDefId(e, 'strike')).toBe(true);
  });

  it('смола тикает ровно −2 за копию (без атак врага)', () => {
    const pacifist = { ...dummyEnemy, aiStyle: 'defensive' as const, deck: ['enemy_guard', 'enemy_guard', 'enemy_slash'] };
    const e = makeEngine(['curse_tar', 'curse_tar', 'guard', 'guard', 'guard'], {}, pacifist, 0);
    e.start();
    e.endPlayerTurn(); // тик смолы на СЛЕДУЮЩЕМ начале хода игрока
    const steps = e.beginEnemyTurn();
    for (const s of steps) e.executeEnemyStep(s);
    const hpAfterEnemy = e.player.hp;
    e.finishEnemyTurn(); // beginPlayerTurn: смола ×2 = −4
    expect(e.player.hp).toBe(hpAfterEnemy - 4);
  });
});
