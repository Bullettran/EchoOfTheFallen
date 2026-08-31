// Генерация артов через бесплатный Pollinations API (FLUX, без ключей).
// Источники промптов: artPrompt-поля в data/cards.ts и data/enemies.ts.
// Запуск:
//   node scripts/gen-art.cjs            — докачать отсутствующие
//   node scripts/gen-art.cjs --dry      — только показать, чего не хватает
//   node scripts/gen-art.cjs --force    — перегенерировать все
//   node scripts/gen-art.cjs --only=a,b — только указанные id
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STYLE =
  'dark fantasy, dark souls inspired, muted ashen palette, deep shadows, ' +
  'dramatic rim lighting, painterly digital art, no text, no watermark, no border';

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

async function generate(id, prompt, outFile, attempt = 1) {
  const seed = Math.floor(Math.random() * 1e9);
  const url =
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(`${prompt}, ${STYLE}`) +
    `?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
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
      return generate(id, prompt, outFile, attempt + 1);
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

  const targets = [
    ...parseArtEntries('src/data/enemies.ts').map((e) => ({ ...e, dir: 'enemies' })),
    ...parseArtEntries('src/data/cards.ts').map((e) => ({ ...e, dir: 'skills' })),
  ];

  const queue = targets.filter((t) => {
    if (only && !only.includes(t.id)) return false;
    const exists = fs.existsSync(path.join(ROOT, 'src/assets/images', t.dir, `${t.id}.jpeg`));
    return force || !exists;
  });

  console.log(`Промптов в реестрах: ${targets.length}; к генерации: ${queue.length}`);
  if (queue.length) {
    console.log(queue.map((q) => `  ${q.dir}/${q.id}`).join('\n'));
  }
  if (dry) return;

  let ok = 0;
  for (const t of queue) {
    const outFile = path.join(ROOT, 'src/assets/images', t.dir, `${t.id}.jpeg`);
    process.stdout.write(`→ ${t.id} ... `);
    const done = await generate(t.id, t.prompt, outFile);
    console.log(done ? `${(fs.statSync(outFile).size / 1024).toFixed(0)} KB` : 'FAILED');
    if (done) ok += 1;
    await sleep(1500); // мягкий rate-limit
  }
  console.log(`Готово: ${ok}/${queue.length}`);
  process.exit(ok === queue.length ? 0 : 1);
})();
