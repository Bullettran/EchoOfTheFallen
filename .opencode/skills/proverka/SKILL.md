---
name: proverka
description: Полная проверка проекта «Эхо павших» — типы, тесты, сборка, аудит артов/доков, E2E-клики через Playwright, скан кодировки и граблей. Use when пользователь просит «проверь проект», «прогони проверку», «полная проверка», или после крупных правок UI/данных.
---

# Проверка проекта «Эхо павших»

Полный прогон = 4 раздела. Отчёт по каждому: ✓ зелёное / ✗ найдено (с деталями). Ядро (раздел 1) обязательное после ЛЮБОЙ правки кода — остальное по требованию.

## 1. Ядро: типы + тесты + сборка

```powershell
cmd /c "pnpm typecheck 2>&1 && pnpm test 2>&1 && pnpm build 2>&1" | Out-File -FilePath "$env:TEMP\opencode\proverka.log" -Encoding utf8
Select-String -Path "$env:TEMP\opencode\proverka.log" -Pattern 'Test Files|Tests |error TS|FAIL|built in'
```

- typecheck (vue-tsc strict) — 0 ошибок.
- vitest — все тесты зелёные (сейчас 94). Тест с числом в заголовке (например `expected N to be M`) — сначала понять, сломала ли правка поведение или тест устарел.
- build (Vite) — завершился `✓ built in`. Warning про chunk >1600 kB — известный, не ошибка.

## 2. Аудит артов и доков

- `tests/art.store.test.ts` входит в ядро: падает с именем файла, если ассета нет.
- Сверка доков с данными (после переименований/новых карт!):
  - `docs/cards.md` — иена карт/классов соответствует `src/data/cards.ts` / `classes.ts`;
  - `docs/art-list.md` — id сцен/иконок соответствуют `core/assets.ts` (`SceneId`) и `NODE_META`;
  - Быстрая проверка: взять 3-4 случайных имени из data-файла и найти их в доке (Grep).
- Все `<img>` в игре имеют `naturalWidth > 0` — покрывается art-тестом; вручную только если менялся `core/assets.ts`.

## 3. E2E-клики вживую (Playwright MCP)

**Скриншоты сохранять ТОЛЬКО в `tests/screenshots/`** (папка в .gitignore; создать при отсутствии: `New-Item -ItemType Directory -Path tests\screenshots -Force`). Имя файла передавать путём: `filename: 'tests/screenshots/<имя>.png'`. В КОРЕНЬ проекта скриншоты не класть.

Dev-сервер поднимать фоном и ОБЯЗАТЕЛЬНО гасить после:

```powershell
Start-Process -FilePath "cmd" -ArgumentList "/c pnpm dev > $env:TEMP\opencode\vite.log 2>&1" -WindowStyle Hidden
# ... проверка ...
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*vite*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

Маршрут: меню → Продолжить (или Новая игра → класс) → хаб → Выйти в пустоши → карта → бой. Проверить:

1. **pointer-events (грабля №3)**: в бою `document.elementFromPoint` в центре руки и на карточке врага возвращает сам элемент, не `.hud-overlay`.
2. **Phaser-маркеры**: `canvas.dataset.bgLoaded === '1'`; консоль — 0 errors (`playwright_browser_console_messages`).
3. **Карта похода**: этажей 15; активны только `node.reachable`; тропы (`svg line`) доходят до границ узлов, не заходя внутрь (замер: концы линий вне `.node`-прямоугольников, зазор ~6px).
4. **Бой**: клик карты играет её (HP врага падает), ход врага соответствует намерению, бейдж `⚔ N · 🛡 M` совпадает с фактическим уроном.
5. **Панели**: костёр (клик по карте → выезжающая панель осмотра → улучшение двигает этаж), магазин, святыня (2 разных благословения), тлен (принять/отказаться) — открываются и закрываются, узел после этого сгорает.
6. **Алтарь**: панель «Дар класса», кнопка цены душ.

## 4. Кодировка + грабли

Скан исходников (mojibake/BOM) — после инцидента с PowerShell обязателен:

```powershell
$utf8 = [Text.Encoding]::UTF8
Get-ChildItem -Recurse -Include *.ts,*.vue,*.scss,*.md,*.cjs -File | Where-Object { $_.FullName -notmatch 'node_modules|dist|\.playwright-mcp|release' } | ForEach-Object {
  $b = [IO.File]::ReadAllBytes($_.FullName)
  $bom = ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF)
  $moji = $utf8.GetString($b) -match '[\u00D0][\u0080-\u00BF][\u00D1]?'
  if ($bom -or $moji) { "$($_.Name) BOM=$bom MOJI=$moji" }
}
```

- MOJI=True — файл битый двойной кодировкой. Починка: прочитать как UTF-8 → `GetEncoding(1251).GetBytes()` → `UTF8.GetString()` → записать через `[IO.File]::WriteAllText($f, $fixed, [Text.UTF8Encoding]::new($false))`.
- BOM без MOJI — допустимо (не трогать).
- **Запрет**: НЕ править файлы с кириллицей через `Set-Content`/`Out-File`/`Add-Content` в PowerShell 5.1 (он читает UTF-8 как ANSI и ломает кодировку). Только инструменты edit/write, либо `[IO.File]::WriteAllText` с `UTF8Encoding($false)`.

Чек-лист граблей (AGENTS.md, раздел «Грабли» + паттерны):

- внутренние id (карт/классов/состояний/ветвей/сцен) НЕ переименованы в диффе;
- имена состояний синхронны в 3 местах: `data/states.ts`, `stores/battle.ts stateName()`, `game/CardFactory.ts describeCardHtml()`;
- подсказки/имена узлов похода — только из `NODE_META` (`stores/trial.ts`);
- `import.meta.glob` — только литеральные пути;
- Phaser-сцена: отписки EventBus в `cleanup()` + SHUTDOWN/DESTROY;
- пулы из `CRAFT_POOL` читаются через `Object.values(...).flat()` (НЕ `Object.keys` — регрессия уже была).

## Отчёт

Формат ответа пользователю:

```
1. Ядро:        ✓ typecheck / 94 теста / build
2. Арты и доки: ✓/✗ (что не сошлось)
3. E2E:         ✓/✗ (маршрут, что проверено, ошибки консоли)
4. Кодировка:   ✓/✗ (список файлов)
Найдено: … / Рекомендации: …
```

Найденные проблемы чинить сразу (мелкие) или перечислить с приоритетами (крупные).
