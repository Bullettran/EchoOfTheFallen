/**
 * Тесты фабрик: CardFactory (улучшения, uid) и EnemyFactory (скейлинг глубины).
 */
import { describe, it, expect } from 'vitest';
import {
  createCard,
  resolveCardAction,
  syncUidCounter,
  upgradePreview,
  describeCardHtml,
} from '@/game/CardFactory';
import { scaleEnemy, rollEncounters } from '@/game/EnemyFactory';
import { BOSS_POOL } from '@/data/enemies';
import { BALANCE } from '@/core/config';

describe('CardFactory', () => {
  it('resolveCardAction применяет улучшения качественно', () => {
    const base = createCard('strike', 0);
    const upgraded = createCard('strike', 3);
    expect(resolveCardAction(base).damage).toBe(6);
    expect(resolveCardAction(upgraded).damage).toBe(6 + 2 * 3); // +2/уровень
  });

  it('describeCardHtml: фактические значения + зелёный прирост', () => {
    const html = describeCardHtml({ defId: 'strike', upgradeLevel: 3 }); // 6+6=12
    expect(html).toContain('12');
    expect(html).toContain('(+6)');
    expect(html).toContain('#7dd87d'); // зелёная подсветка
    // базовая карта — без прироста
    const plain = describeCardHtml({ defId: 'strike', upgradeLevel: 0 });
    expect(plain).not.toContain('(+');
    // композитная карта: урон + состояние
    const fb = describeCardHtml({ defId: 'fireball', upgradeLevel: 2 }); // 4+2=6, перегрев 3
    expect(fb).toContain('6');
    expect(fb).toContain('(+2)');
    expect(fb).toContain('Горение');
  });

  it('createCard ограничивает улучшение 5 уровнем', () => {
    expect(() => createCard('strike', 6)).toThrow();
  });

  it('syncUidCounter предотвращает коллизии после загрузки сейва', () => {
    const a = createCard('strike');
    const savedMax = [{ uid: a.uid, defId: 'strike', upgradeLevel: 0 }];
    const before = a.uid;
    syncUidCounter([...savedMax, { uid: 'c9999', defId: 'guard', upgradeLevel: 0 }]);
    const b = createCard('guard');
    expect(before).not.toBe(b.uid);
    expect(b.uid).toBe('c10000');
  });

  it('upgradePreview описывает прирост', () => {
    expect(upgradePreview('strike')).toContain('+2 урона');
    expect(upgradePreview('shadow_step')).toBe('Улучшение недоступно');
  });
});

describe('EnemyFactory: скейлинг глубины', () => {
  it('глубина 1 не меняет врага', () => {
    const s = scaleEnemy('lost_passerby', 1);
    expect(s.def.maxHp).toBe(44);
    expect(s.def.soulsDrop).toBe(60);
    expect(s.dmgBonus).toBe(0);
  });

  it('глубина 5 усиливает HP/души/угли/урон', () => {
    const s = scaleEnemy('lost_passerby', 5);
    expect(s.def.maxHp).toBe(Math.round(44 * (1 + 0.12 * 4))); // 65
    expect(s.def.soulsDrop).toBe(Math.round(60 * (1 + 0.25 * 4))); // 120
    expect(s.def.essenceChance).toBeCloseTo(0.3 + 0.04 * 4);
    expect(s.dmgBonus).toBe(2);
    // базовый реестр не мутирован
    expect(scaleEnemy('lost_passerby', 1).def.maxHp).toBe(44);
  });

  it('шанс памяти не превышает потолок 60%', () => {
    expect(scaleEnemy('lost_passerby', 50).def.essenceChance).toBeLessThanOrEqual(0.6);
  });

  it('rollEncounters: 3 РАЗНЫХ обычных врага', () => {
    const options = rollEncounters(3);
    expect(options).toHaveLength(3);
    const ids = new Set(options.map((o) => o.def.id));
    expect(ids.size).toBe(3);
    options.forEach((o) => expect(o.def.boss).toBeUndefined());
  });

  it('rollEncounters: босс на глубине, кратной bossEveryDepth (15)', () => {
    const options = rollEncounters(BALANCE.progression.bossEveryDepth);
    expect(options).toHaveLength(1);
    expect(options[0]!.def.boss).toBeDefined();
    expect(BOSS_POOL).toContain(options[0]!.def.id);
  });
});
