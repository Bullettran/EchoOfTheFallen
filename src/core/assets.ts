/**
 * Единый реестр изображений. Файлы лежат в src/assets/images и бандлятся
 * Vite'ом через import.meta.glob — работает и в dev, и в prod без правок.
 *
 * Папки (соглашение об именах: имя файла = id сущности):
 *   skills/     — арты карт (strike.jpeg, guard.jpeg...)
 *   enemies/    — портреты врагов (bone_king.jpeg...)
 *   scenes/     — фоны сцен (station.jpeg, ash_wastes_path.jpeg...)
 *   conditions/ — иконки состояний (burn.jpeg, poison.jpeg...)
 *   ui/         — интерфейс (orb_full, cursor, soul_icon, panel_frame...)
 */

// import.meta.glob требует ЛИТЕРАЛЬНЫЙ путь — шаблонные строки запрещены,
// поэтому четыре явных вызова вместо обёртки.
const cards = indexById(
  import.meta.glob('../assets/images/skills/*.{png,jpg,jpeg,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
);
const enemies = indexById(
  import.meta.glob('../assets/images/enemies/*.{png,jpg,jpeg,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
);
const scenes = indexById(
  import.meta.glob('../assets/images/scenes/*.{png,jpg,jpeg,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
);
const conditions = indexById(
  import.meta.glob('../assets/images/conditions/*.{png,jpg,jpeg,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
);
const ui = indexById(
  import.meta.glob('../assets/images/ui/*.{png,jpg,jpeg,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
);

/** Из «../assets/images/skills/strike.jpeg» → { strike: url }. */
function indexById(modules: Record<string, string>): Record<string, string> {
  const byId: Record<string, string> = {};
  for (const [path, url] of Object.entries(modules)) {
    const id = path.split('/').pop()!.replace(/\.(png|jpe?g|webp)$/i, '');
    byId[id] = url;
  }
  return byId;
}

/** Арт карты (по defId) или null — компонент рисует заглушку. */
export function cardArtUrl(defId: string): string | null {
  return cards[defId] ?? null;
}

/** Портреты врагов (по defId) или null. */
export function enemyPortraitUrl(defId: string): string | null {
  return enemies[defId] ?? ENEMY_ART_FALLBACK[defId] ?? null;
}

/**
 * Сценарные враги без собственных артов: подставляем тематически близкие
 * из нарисованных. Когда появится оригинал — приоритет у точного имени файла.
 */
const ENEMY_ART_FALLBACK: Record<string, string | undefined> = {}; // заполняется ниже после glob

function initFallbacks(): void {
  void initFallbacks; // точка расширения для будущих сценариев без артов
}
initFallbacks();

/** Иконка состояния (по StateType) или null — fallback на emoji из STATES. */
export function conditionIconUrl(type: string): string | null {
  return conditions[type] ?? null;
}

/** Идентификаторы сцен боя/Последнего очага (= имена файлов без расширения). */
export type SceneId =
  | 'station'
  | 'menu_bg'
  | 'ash_wastes_path'
  | 'ash_tract'
  | 'ruined_cathedral'
  | 'catacombs'
  | 'shattered_rampart'
  | 'burned_village'
  | 'throne_room';

/** Фон сцены. station/menu_bg — Последний очаг и главное меню, остальные — арены боя. */
export function sceneUrl(scene: SceneId): string | null {
  return scenes[scene] ?? null;
}

/** UI-элемент по имени файла: 'orb_full', 'soul_icon', 'cursor', 'cursor-hover'... */
export function uiUrl(name: string): string | null {
  return ui[name] ?? null;
}

/**
 * Портрет игрока: файл assets/images/ui/player.png|jpeg
 * (или player_portrait.*). Если файла нет — null, Phaser рисует силуэт.
 */
export function playerPortraitUrl(): string | null {
  return ui['player'] ?? ui['player_portrait'] ?? null;
}
