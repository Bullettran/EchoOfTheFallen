/**
 * Тесты StoryEngine: броски 2d6 (детерминированный RNG), вероятности,
 * флаги/эффекты, сценарные бои, валидность графа Акта 1.
 */
import { describe, it, expect } from 'vitest';
import { StoryEngine, successProbability } from '@/game/StoryEngine';
import { ACT1_NODES, ACT1_START } from '@/data/story/act1';
import type { StoryNode } from '@/types/story';

/** RNG с фиксированной последовательностью результатов d6. */
const seqRng = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

/** d6 из rng(): floor(r*6)+1. r=0.1..0.16 → 1 */
const engineWith = (dice: number[]): StoryEngine =>
  new StoryEngine({
    nodes: ACT1_NODES,
    startNode: ACT1_START,
    // каждый вызов rng → следующий «кубик»
    random: seqRng(dice.map((d) => (d - 1 + 0.5) / 6)),
  });

describe('successProbability (2d6)', () => {
  it('точные вероятности', () => {
    expect(successProbability(0, 2)).toBe(1);       // минимум 2 — всегда
    expect(successProbability(0, 13)).toBe(0);      // невозможно
    expect(successProbability(0, 7)).toBeCloseTo(21 / 36); // >=7: 21/36
    expect(successProbability(2, 7)).toBeCloseTo(30 / 36); // нужен >=5: 30/36
  });
});

describe('StoryEngine: проверки и эффекты', () => {
  it('выбор класса даёт статы и карту', () => {
    const e = engineWith([3, 3]);
    e.goTo('class_choice');
    const choice = e.visibleChoices()[0]!; // страж
    e.applyOutcome(choice, 'success');
    expect(e.stats.strength).toBe(2);
    expect(e.pendingAwards.cards).toContain('warden_blade');
    expect([...e.flags]).toContain('class:warden');
  });

  it('успех проверки: 2d6 + стат >= dc', () => {
    const e = engineWith([6, 6]); // 12
    e.goTo('corridor');
    const choice = e.visibleChoices()[0]!; // Память 6
    const roll = e.roll(choice.check!);
    expect(roll.total).toBe(12);
    expect(roll.success).toBe(true);
  });

  it('провал проверки ведёт на сценарный бой', () => {
    const e = engineWith([1, 1]); // 2 — провал любой проверки
    e.goTo('corridor');
    const choice = e.visibleChoices()[0]!;
    const roll = e.roll(choice.check!);
    expect(roll.success).toBe(false);
    const next = e.applyOutcome(choice, 'fail');
    expect(next).toBeNull(); // исход запускает бой
    const victoryNode = e.applyBattleResult(choice, 'fail', 'victory');
    expect(victoryNode).toBe('corridor_after_battle');
  });

  it('«Решимость» (+1, once) тратится броском', () => {
    const e = engineWith([2, 2]); // 4
    e.goTo('corridor');
    // успех без проверки не нужен — добавим эффект напрямую через 3-й выбор
    const stubborn = e.visibleChoices()[2]!; // «Я не хочу говорить», Упорство 6
    e.applyOutcome(stubborn, 'success'); // с каким branch — выдаёт эффект
    expect(e.effects.map((x) => x.id)).toContain('determination');
    // бросок 4 без бонуса провален; с Решимостью 4+1 <6 всё равно провал —
    // проверяем消耗: после броска эффект исчез
    e.roll({ stat: 'resolve', dc: 6 });
    expect(e.effects.map((x) => x.id)).not.toContain('determination');
  });

  it('награды накапливаются и забираются один раз', () => {
    const e = engineWith([3, 3]);
    e.goTo('corridor_after_battle');
    e.applyOutcome(e.visibleChoices()[0]!, 'success'); // 30 душ + осколок
    const a = e.takeAwards();
    expect(a.souls).toBe(30);
    expect(a.cards).toContain('memory_shard');
    expect(e.takeAwards().souls).toBe(0); // очищено
  });
});

describe('Валидность графа Акта 1', () => {
  it('все next/victoryNode/autoNext ссылаются на существующие узлы', () => {
    const ids = new Set(Object.keys(ACT1_NODES));
    for (const node of Object.values(ACT1_NODES)) {
      if (node.autoNext) expect(ids, `autoNext ${node.autoNext}`).toContain(node.autoNext);
      for (const c of node.choices ?? []) {
        for (const out of [c.success, c.fail]) {
          if (!out) continue;
          expect(ids, `next ${out.next}`).toContain(out.next);
          if (out.battle) expect(ids, `victoryNode ${out.battle.victoryNode}`).toContain(out.battle.victoryNode);
        }
      }
    }
  });

  it('терминальный узел завершает акт', () => {
    const e = engineWith([3, 3]);
    e.goTo('act1_end');
    expect(e.actFinished).toBe(true);
  });

  it('эпилог выдаёт полный пакет наград', () => {
    const e = engineWith([3, 3]);
    e.goTo('boss_epilogue');
    e.applyOutcome(e.visibleChoices()[0]!, 'success');
    const a = e.takeAwards();
    expect(a.souls).toBe(200);
    expect(a.essences).toBe(2);
    expect(a.cards).toContain('gate_spear');
    expect(a.lore).toContain('gates_open');
    expect([...e.flags]).toContain('act1_done');
  });

  it('Зал Суда: роли выдают крылья и эффекты', () => {
    const e = engineWith([3, 3]);
    e.goTo('hall');
    // свидетель: +1 все проверки, открывает колодец
    e.applyOutcome(e.visibleChoices()[2]!, 'success');
    expect(e.effects.map((x) => x.id)).toContain('witness');
    expect([...e.flags]).toContain('well_open');
    // «никто»: Пустота −1
    const e2 = engineWith([3, 3]);
    e2.goTo('hall');
    e2.applyOutcome(e2.visibleChoices()[3]!, 'success');
    expect(e2.effects.map((x) => x.id)).toContain('void');
  });

  it('босс: провал Памяти о сестре ведёт на Тень; пощада — отдельный узел', () => {
    const e = engineWith([1, 1]); // гарантированный провал
    e.goTo('well');
    const choice = e.visibleChoices()[0]!;
    e.roll(choice.check!);
    const next = e.applyOutcome(choice, 'fail');
    expect(next).toBeNull();
    // убил → sister_slain
    expect(e.applyBattleResult(choice, 'fail', 'victory')).toBe('sister_slain');
    // пощадил → sister_spared
    expect(e.applyBattleResult(choice, 'fail', 'spared')).toBe('sister_spared');
    e.goTo('sister_spared');
    e.applyOutcome(e.visibleChoices()[0]!, 'success');
    const a = e.takeAwards();
    expect(a.cards).toContain('compassion');
    expect(a.cards).toContain('forgiveness');
  });

  it('чекпоинт: snapshot/restore восстанавливает состояние акта', () => {
    const e = engineWith([3, 3]);
    const play = (index: number, branch: 'success' | 'fail' = 'success'): void => {
      const next = e.applyOutcome(e.visibleChoices()[index]!, branch);
      if (next) e.goTo(next);
    };
    // класс → коридор (подарок) → врата (честность) → зал (свидетель)
    e.goTo('class_choice');
    play(2); // странник: +2 Памяти
    e.goTo('corridor');
    play(1); // «не помню»
    e.goTo('gates');
    play(3); // честность
    e.goTo('hall');
    play(2); // свидетель: эффект + well_open

    const snap = e.snapshot();
    expect(snap.nodeId).toBe('crossroad');
    expect(snap.flags).toContain('role:witness');
    expect(snap.stats.memory).toBe(2);

    // «Новый движок» + восстановление
    const e2 = engineWith([1, 1]);
    expect(e2.restore(snap)).toBe(true);
    expect(e2.currentNodeId).toBe('crossroad');
    expect([...e2.flags]).toContain('well_open');
    expect(e2.stats.memory).toBe(2);
    expect(e2.effects.map((x) => x.id)).toContain('witness');
    // неактуальный снимок отклоняется
    expect(e2.restore({ nodeId: 'no_such_node', flags: [], stats: {}, effects: [] })).toBe(false);
  });

  it('requiresFlags скрывает недоступные выборы (развилка крыльев)', () => {
    const e = engineWith([3, 3]);
    e.goTo('crossroad');
    expect(e.visibleChoices().length).toBe(1); // только «Сесть у алтаря»
    e.flags.add('lib_open');
    e.flags.add('lib_done');
    expect(e.visibleChoices().length).toBe(1); // Библиотека пройдена — скрыта
    e.flags.add('forge_open');
    expect(e.visibleChoices().length).toBe(2); // Кузница + алтарь
  });
});

void ({} as StoryNode);
