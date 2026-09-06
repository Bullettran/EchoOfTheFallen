# Echoes of the Fallen — «Эхо павших»

Souls-like карточный roguelike deckbuilder в духе Slay the Spire: мир сгорел в Великом Пожаре, боги и люди обратились в пепел. Игрок — Пепельный (сосуд, наполняющийся душами павших героев), выбирает класс (Странник/Рыцарь/Жрец — `src/data/classes.ts`: стартовая колода + стартовые уровни Алтаря), ходит в походы по узлам (схватка/лютый враг/находка/костёр/торговец/босс), собирает карты-«эхо» — реликвии павших героев, в которых осталась их душа, — и тратит души на прокачку у Алтаря в Последнем очаге. Цель — пройти Угольные пустоши к трону Короля-Пепла и Механизму запуска нового мира. Каталог карт — `docs/cards.md` (хранятся в TS-реестре `src/data/cards.ts`, не в JSON; в сейвах — только ссылки `{uid, defId, upgradeLevel}`).

---

## Быстрый старт

Требования: **Node 18+**, **pnpm** (`npm i -g pnpm`), Windows 10/11.

```powershell
pnpm install          # зависимости
pnpm dev              # игра в браузере (http://localhost:5173)
pnpm electron:dev     # игра в Electron + DevTools (основной режим)
pnpm test             # юнит-тесты (vitest)
pnpm typecheck        # проверка типов (vue-tsc, strict)
pnpm build            # продакшн-сборка веб-части → dist/
pnpm electron:build   # Windows .exe (NSIS) → release/
```

### Особенности окружения (важно)

- **Application Control / AppLocker** на машине блокирует неподписанные нативные бинарники. Из-за этого:
  - Vite зафиксирован на **6.x** (rolldown из Vite 8 блокируется);
  - TypeScript на **5.9** (vue-tsc не поддерживает TS 7);
  - при `pnpm install` может понадобиться `pnpm approve-builds --all` (pnpm 11 не запускает постинсталлы без одобрения; одобренные пакеты перечислены в `pnpm-workspace.yaml`).
- Playwright-браузер для MCP-тестирования: Chromium из playwright скопирован в `%LOCALAPPDATA%\Google\Chrome\Application\` (Chrome-канал MCP).

---

## Технологии

| Слой | Технология |
|---|---|
| Боевая сцена (canvas) | Phaser 4 |
| Интерфейс (HUD, хаб, меню) | Vue 3 + Pinia |
| Сборка | Vite 6 |
| Язык | TypeScript (strict, `noUncheckedIndexedAccess`) |
| Десктоп | Electron (contextIsolation, sandbox) |
| Тесты | Vitest + jsdom |
| Шрифт | EB Garamond (@fontsource, бандлится локально) |

---

## Архитектура

### Слои и поток данных

```
data/          →  game/           →  stores/         →  UI (Vue)     +  phaser/
(конфиги:         (BattleEngine,     (battle, trial,    (компоненты)     (BattleScene:
 карты, состояния, CardFactory,      meta, ui, art)                      только VFX)
 враги, навыки,    EnemyAI,
 лор)              EnemyFactory)
```

Правила слоёв:

1. **`data/` — только данные.** Никакой логики, никаких импортов движка. Новая сущность = новая запись в реестре.
2. **`game/` — чистая логика.** Не знает про Vue, DOM, Phaser. Общается с миром только через типизированный `EventBus` (mitt). Поэтому тестируется без рендера.
3. **`stores/` — реактивные обёртки.** `battle` владеет движком и делает UI-снапшоты после каждого действия (`sync()`). `meta` — мета-прогресс и персистентность. `ui` — навигация экранов. `art` — файловый реестр изображений.
4. **`components/` — только отображение.** Действия — через сторы, никаких обращений к движку напрямую.
5. **`phaser/` — только визуальные эффекты.** Сцена слушает события `vfx:*` EventBus и не принимает решений. Вся логика боя — в движке.

### EventBus — мост Vue ↔ Phaser

`src/core/EventBus.ts` — типизированная шина (Observer). Phaser-сцена подписывается на `vfx:damage`, `vfx:block`, `vfx:heal`, `vfx:state`, `battle:started` (всплывающие числа, тряска, иконки). Vue-стор триггерит игровые события и читает снапшоты.

> ⚠️ Грабли, уже однажды случившиеся: при `game.destroy()` у Phaser-сцены вызывается `destroy`, а **не** `shutdown`. Отписки от EventBus должны висеть в обоих методах + на `Phaser.Scenes.Events.SHUTDOWN/DESTROY` (см. `BattleScene.cleanup()`), иначе мёртвая сцена ломает следующий бой.

### Протокол хода (пошаговый, ради анимаций)

```
beginPlayerTurn() → [playCard() × N] → endPlayerTurn()
→ beginEnemyTurn()      — возвращает EnemyStep[] (план по ИИ)
→ executeEnemyStep() ×N — стор дёргает по таймеру (750мс) для анимаций
→ finishEnemyTurn()     — тик состояний врага → новый ход игрока
```

План врага формируется **до** его хода и показывается игроку как «Намерение» — полностью (все карты: урон/блок/состояния), а не только первое действие.

### Навигация экранов

`ui-store.screen`: `menu → class_select (при новой игре) → hub (Последний очаг) → trial (карта похода) → battle → trial | hub`. App.vue рендерит экран по этому полю (без vue-router — экранов мало).

### Походный режим (`stores/trial.ts`)

Рогалик-луп в духе Slay the Spire: **карта-граф на 15 этажей** генерируется целиком (2–4 узла на этаж: схватка / лютый враг / находка / костёр / торговец / **святыня** (выбор благословения на поход) / **тлен** (проклятие + награда), 14-й — отдых, 15-й — босс). Узлы соединены тропами-рёбрами: выбирать можно только соседей от последнего пройденного узла; пройденный путь подсвечен. Походная колода — копия активной, HP переносится между узлами. Торговец и события дают карты только на ран; награды (души/угли) — навсегда. Смерть или выход — поход сгорает.

---

## Игровые системы

### Карты (`data/cards.ts`)

`CardDefinition` — неизменяемый шаблон (id, тип, стоимость, действие `action`, теги, редкость, `upgradePerLevel`). `CardInstance` (uid, defId, upgradeLevel) — конкретная карта в коллекции/колоде.

- Исполнение универсально для всех карт: `BattleEngine.resolveAction()` — урон → блок → лечение → состояние → добор.
- Улучшения Кузни: итог = база + `upgradePerLevel × уровень` (`CardFactory.resolveCardAction`), максимум 5.
- Арт карты: файл `src/assets/images/skills/<id>.jpeg` — подхватывается автоматически по имени.

### Состояния (`data/states.ts`)

Реестр `STATES: Record<StateType, StateDefinition>`. У каждого — хуки `onTurnEnd` (тик DoT/HoT в конце хода **носителя**), `onHolderAttack` (кровотечение), `onRemove`, `describe` (тултип) и `merge` (правило слияния при повторном наложении).

Реализованы: горение, гниль (стаки убывают), кровотечение (HP за каждую атаку носителя), милость (HoT), ярость (урон +50%, блок −50%), пробитая броня (+50% получаемого урона), порча (запрет исцеления).

Урон состояний **игнорирует блок**; модификаторы применяются в порядке: `(base + бонусы Сервоприводов) × перегрузка × оголённые цепи × множитель ульты`.

### Дерево навыков (`data/skills.ts`)

5 ветвей × 10 уровней. Узел 5 — спецнавык, 10 — ульта. Эффекты узлов — декларативные `Partial<CombatStats>`; чистая функция `computeCombatStats(skills)` агрегирует их в один объект, который `BattleEngine` применяет в конкретных точках (бонус урона, старт-блок, регенерация, «Неукротимость» — выживание с 1 HP раз в бой, и т.д.).

### Враги и боссы (`data/enemies.ts`, `game/EnemyAI.ts`, `game/EnemyFactory.ts`)

- `EnemyDefinition`: HP, колода (id карт), стиль ИИ, дроп, `scene` (фон арены), `boss` (фазы/ритуал).
- ИИ — чистые функции по стилю: `aggressive` (сильнейшая атака), `defensive` (блок/лечение), `tactical` (добивает раненых), `balanced` (случайно).
- Босс: `phases` (порог HP% + эффекты входа) и `ritual` (автоэффект каждые N ходов, напр. «Поглощение душ» Короля-Пепла +8 HP). Проверка фазы срабатывает мгновенно при пробитии порога.
- `scaleEnemy(defId, depth)` масштабирует врага под глубину (+12% HP, +25% душ, +4% углей, +1 урон за 2 глубины). Пулы: `NORMAL_ENEMY_POOL`, `ELITE_ENEMY_POOL`, `BOSS_POOL`.

### Прогрессия похода

`meta.progress.depth`: победа → +1, смерть → сброс в 1. Метапрогресс Последнего очага (души, навыки, коллекция) при смерти **сохраняется**.

### Мета-прогресс (`stores/meta.ts`)

Профиль: души, угли, коллекция карт, активная колода (uid), 3 пресета, уровни ветвей, статистика, открытые фрагменты лора. Внутренние ключи `souls`/`essences` сохранены ради совместимости сейвов.

Зоны Последнего очага (`components/hub/`):

| Зона | Что делает |
|---|---|
| Кузня | Улучшение карт 0–5 ур. (цена 100×уровень, души) |
| Алтарь | Дар класса (уникальная пассивка, 0–10) + дерево навыков (5 ветвей × 10) |
| Горнило | Крафт: 150 душ + 1 уголёк → выбор из 3 вариантов по типу |
| Реликварий | Колода 10–30 карт, 3 пресета |
| Зал Эха | Статистика + 13 фрагментов лора (открываются прогрессом) |

### Сохранения

Electron: IPC `gameStorage.save/load` → JSON в `%APPDATA%/echoes-of-the-fallen/saves/profile.json`. Браузер: fallback на `localStorage`. Автосейв — подписка `$subscribe` на любое изменение стора. При загрузке `CardFactory.syncUidCounter()` предотвращает коллизии uid.

---

## Ассеты

Все изображения — `src/assets/images/`, реестр — `src/core/assets.ts` (`import.meta.glob`, Vite бандлит и в dev, и в prod). **Имя файла = id сущности.**

| Папка | Содержимое | Кто использует |
|---|---|---|
| `skills/` | арты карт `<defId>.jpeg` | рука боя, плитки Последнего очага, Кузня |
| `enemies/` | портреты врагов `<defId>.jpeg` | HUD, Phaser-сцена |
| `scenes/` | фоны `station / menu_bg / ash_wastes_path / ash_tract / ruined_cathedral / catacombs / shattered_rampart / burned_village / throne_room` | арена боя (Phaser), Последний очаг, главное меню |
| `conditions/` | иконки состояний `<StateType>.jpeg` | чипы HUD, иконки в Phaser |
| `ui/` | `orb_full/empty`, `soul_icon` (душа), `essence_icon` (уголёк), `card_frame`, `panel_frame`, `cursor`, `cursor-hover`, `player` (странник), `class_welder` (рыцарь), `class_companion` (жрец) | HUD, Последний очаг, карты |

Нюансы:

- **`card_frame`** — рамка карты (512×768, светлая шапка сверху ~18%, тёмный низ). Компоненты кладут арт в «окно» под шапкой, текст — на тёмный низ. При замене файла проверяйте эти зоны.
- **Курсоры** автоматически уменьшаются до 24px через canvas (`core/cursor.ts`).
- Нет ассета → автоматический fallback (процедурные заглушки, силуэт игрока, emoji состояний) — игра не ломается.
- Тест `tests/art.store.test.ts` падает с точным именем, если какого-то ожидаемого файла не хватает.
- Сейчас в папках лежат **серые плейсхолдеры с id на картинке** — заменяйте файлы 1:1 по имени, код не трогается. Промпты для генерации — в `artPrompt` у каждой сущности в `data/`.

---

## Electron и безопасность

- `electron/main.ts` — окно, IPC сохранений. `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- `electron/preload.ts` — единственный мост: `contextBridge` открывает только `gameStorage` (save/load по слоту с валидацией имени).
- Dev: грузит `VITE_DEV_SERVER_URL`; prod: `dist/index.html` (поэтому `base: './'` в vite.config).
- Компиляция: `pnpm compile:electron` → `dist-electron/` (CommonJS, отдельный tsconfig).
- Сборка .exe: `electron-builder` (конфиг `build` в package.json, NSIS).

---

## Тесты

`pnpm test` (vitest, окружение jsdom — нужны `window`/`localStorage` для сторов).

| Файл | Покрытие |
|---|---|
| `BattleEngine.damage.test.ts` | формулы урона/блока/лечения, модификаторы, бонус глубины |
| `BattleEngine.states.test.ts` | тики DoT/HoT, merge стаков, кровотечение, длительности |
| `BattleEngine.boss.test.ts` | фазы, ритуал, Несокрушимость, смерть/победа, цикл колоды |
| `Factories.test.ts` | улучшения карт, uid, скейлинг глубины, генерация встреч |
| `skills.test.ts` | агрегатор дерева навыков |
| `meta.store.test.ts` | экономика, Кузня, Алтарь, колода, пресеты, крафт |
| `art.store.test.ts` | наличие всех ассетов, реестр |
| `playtest.sim.test.ts` | бот-плейтест: обычные враги, элита, Король-Пепел |

Фикстуры — `tests/fixtures.ts` (`makeEngine`, `dummyEnemy` с колодой из 3 разных карт — важно для добора врага).

E2E-ручки: в `BattleScene` есть маркеры `canvas.dataset` (`bgLoaded`, `enemyLoaded`, `enemySize`, `playerLoaded`) для проверки через Playwright MCP.

---

## Как добавить новое (расширяемость)

**Карту:** запись в `data/cards.ts` (+ `artPrompt` при желании, файл `skills/<id>.jpeg`). Для крафта — id в `CRAFT_POOL`.

**Состояние:** тип в `StateType` (`types/index.ts`) + объект в `STATES` + иконка `conditions/<type>.jpeg`. Движок подхватит сам; если состояние пассивное (модификатор) — точка применения в `BattleEngine`/`CombatStats`.

**Врага:** запись в `ENEMIES` (колода — id карт с префиксом `enemy_`/`boss_`, тоже в `cards.ts`), при обычном — добавить в `NORMAL_ENEMY_POOL`, элитном — в `ELITE_ENEMY_POOL`. Боссу — `boss.phases`/`boss.ritual`.

**Узел навыка:** узел в нужной ветви `BRANCHES` с эффектами `Partial<CombatStats>`. Если эффект новый — поле в `CombatStats` + точка применения в движке.

**Ассет:** файл с именем = id в соответствующую папку `src/assets/images/`. Больше ничего.

**Сцену боя:** файл в `scenes/` + тип в `SceneId` (`core/assets.ts`) + `scene:` у нужных врагов.

---

## Баланс

Все «магические числа» — в `src/core/config.ts` (`BALANCE`): статы игрока, модификаторы боя, экономика хаба (цены кузницы/крафта, лимиты колоды), прогрессия глубины. Балансные правки — только там, без изменения логики.

Опорные значения: игрок-странник 70 HP / 3 энергии / 5 карт в ход; обычный враг 36–53 HP, дроп 55–80 душ; Король-Пепел 85 HP, 250 душ; ветвь Алтаря целиком ≈ 1400 душ.

---

## Каталоги

```
├── electron/            # main + preload (tsc → dist-electron/)
├── src/
│   ├── assets/
│   │   ├── images/      # ВЕСЬ арт (см. раздел «Ассеты»)
│   │   └── styles/      # дизайн-система (CSS-переменные, .btn)
│   ├── components/      # Vue: бой (BattleScreen, HandView, панели), Последний очаг (5 зон),
│   │                    # TrialMapScreen (карта похода), CardTile
│   ├── core/            # EventBus, config (баланс), assets (реестр), cursor
│   ├── data/            # cards, states, enemies, skills, lore — ЧИСТЫЕ ДАННЫЕ
│   ├── game/            # BattleEngine, CardFactory, EnemyAI, EnemyFactory
│   ├── phaser/          # PhaserGame.vue + scenes/BattleScene (только VFX)
│   ├── stores/          # battle, trial, meta, ui, art (Pinia)
│   └── types/           # игровые типы + типы window API Electron
├── tests/               # vitest (+ fixtures.ts)
├── index.html           # точка входа (+ favicon)
└── vite.config.ts       # Vite + vitest (alias @ → src)
```
