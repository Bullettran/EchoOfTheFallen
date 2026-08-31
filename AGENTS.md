# AGENTS.md — шпаргалка для агентов

Карточная roguelike RPG (Dark Souls стиль). Phaser 4 — сцена боя, Vue 3 + Pinia — весь UI, Electron — десктоп. TypeScript strict.

## Команды (проверяй после каждого изменения кода)

```powershell
pnpm typecheck   # vue-tsc --noEmit — ОБЯЗАТЕЛЬНО зелёный
pnpm test        # vitest — 58+ тестов, все зелёные
pnpm build       # прод-сборка веб-части
pnpm electron:dev  # запуск игры (dev-сервер + Electron)
```

`pnpm install` может потребовать `pnpm approve-builds --all` (pnpm 11, список в `pnpm-workspace.yaml`).

## Карта проекта (куда что)

- `src/data/` — ТОЛЬКО конфиги (карты/состояния/враги/навыки/лор/сюжет). Без логики.
- `src/data/story/act1.ts` — граф Акта 1 (узлы/выборы/проверки из History.MD).
- `src/game/` — чистая логика. `BattleEngine` (мульти-враг, слоты, призывы), `StoryEngine` (узлы, 2d6, флаги, эффекты акта), фабрики. Не знает про Vue/DOM/Phaser. Вывод — через `src/core/EventBus.ts` (mitt). Тестируется без рендера.
- `src/stores/` — Pinia: `battle` (движок + UI-снапшот), `story` (акт: узлы/броски/награды), `meta` (профиль + автосейв), `ui` (экраны hub|map|battle|story), `art` (реестр картинок).
- `src/components/` — только отображение; действия через сторы. `StoryScreen` — экран сценария.
- `src/phaser/scenes/BattleScene.ts` — ТОЛЬКО визуальные эффекты (слушает `vfx:*`). Портреты/фон/иконки берёт из `core/assets.ts`.
- `electron/` — main + preload. Безопасность: contextIsolation, без nodeIntegration; наружу только `window.gameStorage`.
- `tests/` — vitest + jsdom; фикстуры в `tests/fixtures.ts`.
- `src/assets/images/` — весь арт; **имя файла = id сущности** (`skills/strike.jpeg`, `enemies/bone_king.jpeg`, `ui/player.jpeg`). Реестр: `src/core/assets.ts` (`import.meta.glob`, пути — ТОЛЬКО литеральные).

## Ключевые паттерны

- Новая карта/враг/состояние/узел навыка = запись в соответствующем файле `data/`. Логику не трогать. Подробнее — README, раздел «Как добавить новое».
- Все балансные числа — в `src/core/config.ts` (`BALANCE`). Не хардкодить в логике.
- Урон состояний игнорирует блок. Модификаторы: `(base + Сила) × ярость × уязвимость × ульта`.
- Ход врага пошаговый: `beginEnemyTurn() → executeEnemyStep()×N → finishEnemyTurn()` — стор дёргает шаги по таймеру ради анимаций.
- Сохранения: `meta-store` автосейв через `$subscribe`; Electron IPC `gameStorage`, в браузере — localStorage. Слот `profile`.

## Грабли (не наступать повторно)

1. **Phaser destroy ≠ shutdown**: при `game.destroy()` отписки EventBus из `shutdown()` НЕ вызываются. Чистка — в `cleanup()` + подписки на `Phaser.Scenes.Events.SHUTDOWN/DESTROY`. Уже реализовано — не ломать.
2. **`setDisplaySize` + tween scale**: твинить от фактического `scaleX` после `setDisplaySize`, иначе спрайт распухает до натурального размера текстуры.
3. **`pointer-events`** (грабля всплывала ТРИжды): `.hud-overlay` в BattleScreen — `pointer-events: none`; КАЖДОМУ интерактивному элементу внутри — явно `auto`: рука (`.hand`), `.right-bottom`, `.game-over`, `.tutorial-overlay`, **`.enemies-panel`** (выбор цели). При добавлении нового кликабельного элемента в HUD — проверь `pointer-events` и прогони `node scripts/e2e-click.cjs` (показывает `elementFromPoint` поверх карты и карточки врага).
4. **`import.meta.glob`** — только литеральные пути, шаблонные строки падают в build.
5. **Окружение**: AppLocker блокирует неподписанные нативные модули → Vite 6 (не 8), TS 5.9 (не 7). Не «обновляй» без проверки сборки.
6. **Vue-стор из не-компонентного кода** — передавать pinia: `useStore(pinia)`.
7. Тестовые враги: колода ≥ 3 разных карт, иначе револьвер сброса порождает дубликаты в доборе.

## E2E через Playwright MCP

- Маркеры готовности сцены: `canvas.dataset` → `bgLoaded`, `enemyLoaded`, `enemySize`, `playerLoaded`.
- Ассеты: все `<img>` — `naturalWidth > 0`; отсутствие — упадёт `tests/art.store.test.ts` с именем файла.
