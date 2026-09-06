/**
 * Типы рогалик-режима «Испытания»:
 * карта-граф узлов (StS-лайк): этажи с узлами и рёбрами-тропами,
 * походная колода, сохранение HP между боями.
 */

export type TrialNodeType =
  | 'battle'
  | 'elite'
  | 'event'
  | 'campfire'
  | 'shop'
  | 'boss'
  | 'shrine'
  | 'curse';

export interface TrialNode {
  id: string;
  type: TrialNodeType;
  /** Отображаемое название */
  label: string;
  icon: string;
  /** Выполнен ли узел */
  cleared: boolean;
  /** Данные узла (defId врага / id события) */
  data?: string;
  /** Позиция в ряду этажа (0 = самый левый) — для отрисовки троп */
  lane: number;
}

export interface TrialFloor {
  /** Номер этажа (1-based) */
  floor: number;
  /** Узлы этажа (2–4 на выбор; боссовый — один) */
  nodes: TrialNode[];
  /** Рёбра-тропы в СЛЕДУЮЩИЙ этаж: [индекс узла этого этажа, индекс узла следующего] */
  edges: Array<[number, number]>;
}

export interface TrialState {
  /** Походная колода (временная — сгорает при смерти/выходе) */
  deck: import('@/types').CardInstance[];
  /** HP похода (сохраняется между боями) */
  hp: number;
  maxHp: number;
  /** Текущий этаж (где происходит выбор узла) */
  floor: number;
  /** Карта этажей (вся генерируется сразу) */
  floors: TrialFloor[];
  /** Активен ли поход */
  active: boolean;
  /** Глубина (для скейлинга врагов) */
  depth: number;
}
