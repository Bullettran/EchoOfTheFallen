// Генерация артов через бесплатный Pollinations API (FLUX, без ключей).
// Источники промптов:
//   - artPrompt-поля в data/cards.ts и data/enemies.ts (только строки '...')
//   - реестры ниже: SCENES / CONDITIONS / UI (у них нет data-файлов с промптами)
// Запуск:
//   node scripts/gen-art.cjs            — докачать отсутствующие
//   node scripts/gen-art.cjs --dry      — только показать, чего не хватает
//   node scripts/gen-art.cjs --force    — перегенерировать все
//   node scripts/gen-art.cjs --only=a,b — только указанные id
//   node scripts/gen-art.cjs --dirs=scenes,ui — только указанные папки
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
// Базовый стиль «Пепел и угли»: палитра, свет, качество.
const STYLE =
  'dark fantasy souls-like, world of ash after the great fire, embers drifting in the air, ' +
  'falling grey ash, muted charcoal and bone palette with ember orange and pale gold accents, ' +
  'gothic ruins, volumetric god rays through smoke, dramatic cinematic lighting, ' +
  'dark souls and elden ring aesthetic, oil painting texture, weathered grim atmosphere, ' +
  'photorealistic game concept art, ultra detailed, sharp focus, high contrast, ' +
  'no text, no watermark, no border';

// Кадрирование по типу арта: один стиль — разные «кадры» и свет.
const DIR_STYLE = {
  // Враг: персонажная карточка, читаемый силуэт, явная схема света
  enemies:
    'single character full body three-quarter pose filling 60 percent of frame, centered, ' +
    'warm ember rim light from left and cold pale moonlight from right, plain dark smoky background with drifting ash particles, ' +
    'iconic readable silhouette, game enemy card art',
  // Скилл: квадратная карточка-реликвия, предмет/момент по центру
  skills:
    'square composition, centered subject filling 65 percent of frame, ' +
    'dark souls item and spell concept art, single dramatic light source, heavy shadows, ' +
    'one vivid ember accent color, dark neutral background, crisp edges, game ability card art',
  // Сцена: широкий кадр со слоями глубины — резкий, без дымовой «каши»
  scenes:
    'wide establishing shot with layered foreground midground background, cinematic composition, ' +
    'crisp detailed textures, clear silhouettes, high contrast, modest atmospheric haze only in far background, no characters',
  // Иконка: читаемость в малом размере
  conditions: 'bold centered icon, simple shapes, dark background, readable at small size',
  // UI: чистый ассет
  ui: 'clean game asset, dark background',
};

// Токены персонажей: одинаковые описания героев во всех кадрах (консистентность).
const HERO = {
  courier: 'lean hooded ashen wanderer in tattered travel cloak over scavenged leather armor, half-masked ashen face, worn longsword',
  welder: 'tall ash knight in cracked heavy plate armor with scorched tabard, ember glow through visor slits, massive tower shield',
  companion: 'gaunt fire priest in burnt vestments, hooded, censer staff trailing warm golden light',
};

// ---------- Реестры без data-источника ----------

/** Сцены: [id, промпт]. Широкий кадр 1280×720, без персонажей. */
const SCENES = [
  ['station', 'hidden sanctuary hearth inside a ruined chapel: great bonfire altar of stacked swords, blacksmith anvil, racks of salvaged relics glowing faintly, warm firelight against cold ash-blue night, gothic stone arches, interior wide shot'],
  ['menu_bg', 'lone hooded ashen figure seen from behind standing on a ridge of grey ash dunes, overlooking vast burned wasteland with distant ruined cathedral spires under a dim crimson sky, embers rising, epic cinematic hero shot, rule of thirds composition'],
  ['ash_wastes_path', 'narrow winding path through charcoal wasteland, blackened dead trees, drifts of grey ash like snow, faint ember cracks in the ground, distant smoke columns, moody overcast light'],
  ['ash_tract', 'old burned trade road littered with rusted cart wrecks and scattered bones, ash drifting like snowfall, broken milestones, low dirty sun through haze'],
  ['ruined_cathedral', 'collapsed gothic cathedral square, shattered stained glass glowing faintly, dry fountain full of ash, toppled statues of faceless saints, god rays through holes in the vault'],
  ['catacombs', 'ancient ossuary tunnel with walls of stacked skulls and bones, pale candles in niches, wet stone floor reflecting dim light, darkness swallowing the distance'],
  ['shattered_rampart', 'broken fortress rampart among jagged merlons and banners burnt to rags, vast ash wasteland stretching to horizon below, cold wind, heavy grey clouds'],
  ['burned_village', 'burned-out village of charred timber houses, one chimney still smoking, collapsed well, ash-covered lane, eerie stillness at dusk'],
  ['throne_room', 'colossal throne hall of fused ash and melted swords, towering throne on a mound of cinders, slow rivers of glowing embers across the floor, pale soul-lights drifting upward, boss arena'],
];
const SCENE_STYLE = 'no characters, wide establishing shot, atmospheric perspective';

/** Иконки состояний: [id, промпт]. Квадрат 512×512. */
const CONDITIONS = [
  ['burn', 'small open flame burning on charred cloth, glowing ember orange, game status icon, centered, dark background'],
  ['poison', 'greenish rot and decay spreading across cracked bone, sickly spores, game status icon, centered, dark background'],
  ['bleed', 'dark red blood dripping from a torn wound, single droplet falling, game status icon, centered, dark background'],
  ['blessing', 'warm golden grace light descending as a soft shaft, gentle holy glow, positive game status icon, centered, dark background'],
  ['fury', 'writhing red-orange flame aura flaring around a clenched gauntlet, aggressive energy, game status icon, centered, dark background'],
  ['vulnerable', 'cracked broken breastplate with a gaping hole, armor shattered, game status icon, centered, dark background'],
  ['heal_ban', 'extinguished candle with a thin smoke wisp beside a cracked saint icon, silence, game status icon, centered, dark background'],
];

/** UI-элементы: [id, промпт, width, height]. */
const UI = [
  ['player', `${HERO.courier}, alert standing pose, character design full body, dark studio background, warm ember rim light, concept art`, 1024, 1024],
  ['class_welder', `${HERO.welder}, powerful standing pose, character design full body, dark studio background, ember glow accents, concept art`, 1024, 1024],
  ['class_companion', `${HERO.companion}, gentle caring pose, character design full body, dark studio background, warm golden glow, concept art`, 1024, 1024],
  ['soul_icon', 'wispy pale blue-white soul flame floating above an offering bowl, flat game currency icon, centered, dark background', 512, 512],
  ['essence_icon', 'single glowing ember coal with warm inner light and faint sparks, flat game currency icon, centered, dark background', 512, 512],
  ['orb_full', 'glowing ember orange stamina flame orb, full charge, warm rim, game UI icon, centered, dark background', 512, 512],
  ['orb_empty', 'empty cold iron orb socket, dark metal ring, dim, no glow, game UI icon, centered, dark background', 512, 512],
  ['card_frame', 'vertical gothic card frame border of dark forged iron, empty clean dark window in center, dark bottom third for text, subtle ember-lit rivets and thorn ornaments, game ui template', 832, 1216],
  ['panel_frame', 'rounded dark iron UI panel frame with gothic ornaments, empty inside, rivets, subtle ember edge glow, game ui template, dark background', 1024, 1024],
];

// ---------- Парсинг artPrompt из data-реестров ----------

/** Распарсить блоки верхнего уровня с artPrompt из TS-реестра. */
function parseArtEntries(relFile) {
  const src = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
  const out = [];
  const re = /\n {2}([\w_]+): \{([\s\S]*?)\n {2}\},/g;
  let m;
  while ((m = re.exec(src))) {
    const ap = /artPrompt:\s*'([^']+)'/.exec(m[2]);
    if (ap) out.push({ id: m[1], prompt: ap[1] });
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate(id, prompt, outFile, width, height, attempt = 1) {
  const seed = Math.floor(Math.random() * 1e9);
  const url =
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(`${prompt}, ${STYLE}`) +
    `?width=${width}&height=${height}&nologo=true&model=flux&seed=${seed}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(150000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10_000) throw new Error(`подозрительно мал (${buf.length} байт)`);
    fs.writeFileSync(outFile, buf);
    return true;
  } catch (e) {
    if (attempt < 3) {
      console.log(`  ! ${id}: ${e.message}, повтор ${attempt + 1}/3`);
      await sleep(4000);
      return generate(id, prompt, outFile, width, height, attempt + 1);
    }
    console.log(`  ✗ ${id}: не сгенерирован (${e.message})`);
    return false;
  }
}

(async () => {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const force = args.includes('--force');
  const onlyArg = args.find((a) => a.startsWith('--only=') || a === '--only');
  const only = onlyArg
    ? onlyArg.startsWith('--only=')
      ? onlyArg.slice(7).split(',').map((s) => s.trim())
      : args[args.indexOf('--only') + 1].split(',').map((s) => s.trim())
    : null;
  const dirsArg = args.find((a) => a.startsWith('--dirs='));
  const dirs = dirsArg ? dirsArg.slice(7).split(',').map((s) => s.trim()) : null;

  const targets = [
    ...parseArtEntries('src/data/enemies.ts').map((e) => ({ ...e, dir: 'enemies', w: 1024, h: 1024 })),
    ...parseArtEntries('src/data/cards.ts').map((e) => ({ ...e, dir: 'skills', w: 1024, h: 1024 })),
    ...SCENES.map(([id, prompt]) => ({ id, prompt, dir: 'scenes', w: 1280, h: 720 })),
    ...CONDITIONS.map(([id, prompt]) => ({ id, prompt, dir: 'conditions', w: 512, h: 512 })),
    ...UI.map(([id, prompt, w, h]) => ({ id, prompt, dir: 'ui', w, h })),
  ];

  const queue = targets.filter((t) => {
    if (only && !only.includes(t.id)) return false;
    if (dirs && !dirs.includes(t.dir)) return false;
    const exists = fs.existsSync(path.join(ROOT, 'src/assets/images', t.dir, `${t.id}.jpeg`));
    return force || !exists;
  });

  console.log(`Промптов в реестрах: ${targets.length}; к генерации: ${queue.length}`);
  if (queue.length) {
    console.log(queue.map((q) => `  ${q.dir}/${q.id} (${q.w}x${q.h})`).join('\n'));
  }
  if (dry) return;

  let ok = 0;
  for (const t of queue) {
    const outFile = path.join(ROOT, 'src/assets/images', t.dir, `${t.id}.jpeg`);
    process.stdout.write(`→ ${t.id} ... `);
    const frame = DIR_STYLE[t.dir] ?? '';
    const prompt = frame ? `${t.prompt}, ${frame}` : t.prompt;
    const done = await generate(t.id, prompt, outFile, t.w, t.h);
    console.log(done ? `${(fs.statSync(outFile).size / 1024).toFixed(0)} KB` : 'FAILED');
    if (done) ok += 1;
    await sleep(1500); // мягкий rate-limit
  }
  console.log(`Готово: ${ok}/${queue.length}`);
  process.exit(ok === queue.length ? 0 : 1);
})();
