// Загрузка CC0-звуков Kenney: находит zip на странице ассета, скачивает,
// распаковывает (tar) и раскладывает подходящие файлы в src/assets/audio/sfx/.
// Лицензия всех паков Kenney — CC0 (public domain), скачивание штатное.
// Запуск: node scripts/gen-sfx.cjs [--force]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src/assets/audio/sfx');
const SLUGS = ['interface-sounds', 'impact-sounds', 'rpg-audio', 'music-jingles'];

/** Какой игровой звук из какого пака и по каким маскам имён искать. */
const WANTED = [
  { out: 'click', from: 'interface-sounds', masks: ['*click*select*', '*click*001*', '*click*'] },
  { out: 'card', from: 'interface-sounds', masks: ['*paper*', '*flip*', '*swipe*', '*click*002*', '*click*'] },
  { out: 'dice', from: 'interface-sounds', masks: ['*switch*', '*tick*', '*click*003*', '*click*'] },
  { out: 'hit', from: 'impact-sounds', masks: ['*hit*hard*', '*hit*plate*', '*punch*', '*hit*'] },
  { out: 'block', from: 'impact-sounds', masks: ['*shield*', '*clang*', '*impactMetal_heavy*', '*armor*'] },
  { out: 'death', from: 'impact-sounds', masks: ['*impactGlass_heavy*000*', '*impactGlass_heavy*', '*break*'] },
  { out: 'heal', from: 'impact-sounds', masks: ['*impactBell_light*', '*impactBell_heavy_003*', '*impactBell*'] },
  { out: 'victory', from: 'music-jingles', masks: ['*jingles_PIZZI00*', '*jingles_PIZZI*', '*jingles_SAX00*'] },
  { out: 'defeat', from: 'music-jingles', masks: ['*jingles_NES00*', '*jingles_NES01*', '*jingles_NES*'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const force = process.argv.includes('--force');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Найти zip-ссылки и скачать паки во временные папки
  const packs = new Map(); // slug -> папка с распакованными файлами
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kenney-sfx-'));
  for (const slug of SLUGS) {
    const outZip = path.join(tmpBase, `${slug}.zip`);
    const outDir = path.join(tmpBase, slug);
    if (fs.existsSync(outDir)) {
      packs.set(slug, outDir);
      continue;
    }
    process.stdout.write(`→ ${slug}: страница... `);
    const res = await fetch(`https://kenney.nl/assets/${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();
    const link = /href='(https:\/\/kenney\.nl\/media\/pages\/assets\/[^']+\.zip)'/.exec(html)?.[1];
    if (!link) {
      console.log('ссылка не найдена, пропуск');
      continue;
    }
    process.stdout.write('zip... ');
    const zres = await fetch(link, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!zres.ok) throw new Error(`HTTP ${zres.status}`);
    fs.writeFileSync(outZip, Buffer.from(await zres.arrayBuffer()));
    fs.mkdirSync(outDir, { recursive: true });
    execFileSync('tar', ['-xf', outZip, '-C', outDir], { stdio: 'ignore' });
    packs.set(slug, outDir);
    console.log('ok');
    await sleep(1200);
  }

  // 2. Собрать список аудиофайлов каждого пака
  const listAudio = (dir) => {
    const acc = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(ogg|wav|mp3)$/i.test(f.name)) acc.push(p);
      }
    };
    walk(dir);
    return acc;
  };
  const audioByPack = new Map();
  for (const [slug, dir] of packs) audioByPack.set(slug, listAudio(dir));

  // 3. Подобрать файлы по маскам
  const matchMask = (name, mask) => {
    const re = new RegExp('^' + mask.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
    return re.test(name);
  };

  let copied = 0;
  for (const w of WANTED) {
    const outFile = path.join(OUT_DIR, `${w.out}.ogg`);
    if (!force && fs.existsSync(outFile)) {
      console.log(`= ${w.out}: уже есть`);
      continue;
    }
    const files = audioByPack.get(w.from) ?? [];
    let found = null;
    for (const mask of w.masks) {
      found = files.find((f) => matchMask(path.basename(f), mask));
      if (found) break;
    }
    if (!found) {
      console.log(`✗ ${w.out}: не найден в паке ${w.from} (${files.length} файлов)`);
      continue;
    }
    fs.copyFileSync(found, outFile);
    console.log(`✓ ${w.out} ← ${path.basename(found)} [${w.from}]`);
    copied += 1;
  }
  console.log(`Готово: скопировано ${copied}`);
  fs.rmSync(tmpBase, { recursive: true, force: true });
})();
