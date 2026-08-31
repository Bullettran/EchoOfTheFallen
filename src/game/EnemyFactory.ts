/**
 * EnemyFactory: масштабирует определения врагов под глубину похода
 * и генерирует варианты для экрана выбора боя.
 *
 * Скейлинг НЕ мутирует базовый реестр — на выходе копия EnemyDefinition
 * + плоский бонус урона, который движок применяет к картам врага.
 */
import { BALANCE } from '@/core/config';
import { ENEMIES, NORMAL_ENEMY_POOL, BOSS_POOL } from '@/data/enemies';
import type { EnemyDefinition } from '@/types';

export interface ScaledEnemy {
  def: EnemyDefinition;
  /** Плоский +урон к каждой атаке врага */
  dmgBonus: number;
  /** Глубина, под которую масштабирован враг */
  depth: number;
}

export function getEnemyDefinition(defId: string): EnemyDefinition {
  const def = ENEMIES[defId];
  if (!def) throw new Error(`Unknown enemy: ${defId}`);
  return def;
}

/** Создать врага, усиленного глубиной (depth >= 1). */
export function scaleEnemy(defId: string, depth: number): ScaledEnemy {
  const base = getEnemyDefinition(defId);
  const g = Math.max(0, depth - 1);
  const p = BALANCE.progression;
  const def: EnemyDefinition = {
    ...base,
    maxHp: Math.round(base.maxHp * (1 + p.hpGrowthPerDepth * g)),
    level: base.level + g,
    soulsDrop: Math.round(base.soulsDrop * (1 + p.soulsGrowthPerDepth * g)),
    essenceChance: Math.min(base.essenceChance + p.essenceGrowthPerDepth * g, 0.6),
  };
  return {
    def,
    dmgBonus: Math.floor(g * p.dmgBonusPerDepth),
    depth,
  };
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Сгенерировать выбор противников для глубины:
 * глубина, кратная bossEveryDepth → один босс; иначе 3 разных обычных врага.
 */
export function rollEncounters(depth: number): ScaledEnemy[] {
  const isBossDepth = depth % BALANCE.progression.bossEveryDepth === 0;
  if (isBossDepth) {
    return [scaleEnemy(pickRandom(BOSS_POOL), depth)];
  }
  const pool = [...NORMAL_ENEMY_POOL];
  const result: ScaledEnemy[] = [];
  const count = Math.min(3, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const defId = pool.splice(idx, 1)[0]!;
    result.push(scaleEnemy(defId, depth));
  }
  return result;
}

/** Короткая подсказка о стиле ИИ для UI выбора врага. */
export const AI_STYLE_HINTS: Record<EnemyDefinition['aiStyle'], string> = {
  aggressive: 'Бьёт сильнейшим, не заботясь о защите',
  defensive: 'Копит блок и лечится',
  tactical: 'Добивает раненых, копит силы против здоровых',
  balanced: 'Непредсказуем: и блок, и урон',
};
