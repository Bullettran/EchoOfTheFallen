// Портабл-сборка без electron-builder (его стадия rename блокируется
// Application Control). Кладём готовый Electron из node_modules + наш код
// в resources/app — Electron подхватывает папку как приложение без asar.
// Запуск: node scripts/make-portable.cjs   (после pnpm build && compile:electron)
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'release', 'EchoesOfTheFallen-win64');

// Источник рантайма: dist из node_modules (если postinstall распаковал)
// либо zip из кеша electron (лежит в Cache/<hash>/electron-v*.zip).
const ELECTRON_DIST = path.join(ROOT, 'node_modules/electron/dist');
const findElectronZip = () => {
  const cacheDir = path.join(process.env.LOCALAPPDATA || '', 'electron', 'Cache');
  if (!fs.existsSync(cacheDir)) return null;
  const acc = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/electron-v[\d.]+-win32-x64\.zip$/i.test(f.name)) acc.push(p);
    }
  };
  walk(cacheDir);
  acc.sort();
  return acc.at(-1) ?? null;
};

// 1. Каркас
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 2. Рантайм Electron (exe/dll/locales/resources.pak)
console.log('Разворачиваю рантайм Electron...');
const electronZip = findElectronZip();
if (fs.existsSync(ELECTRON_DIST)) {
  execSync(`robocopy "${ELECTRON_DIST}" "${OUT}" /E /NFL /NDL /NJH /NJS /NP`, { stdio: 'ignore' });
} else if (electronZip) {
  // Распаковка сразу в целевую папку — без стадии rename (её арестовывает
  // Application Control). tar понимает zip.
  console.log('  из кеша:', path.basename(electronZip));
  execSync(`tar -xf "${electronZip}" -C "${OUT}"`, { stdio: 'inherit' });
} else {
  throw new Error('Нет ни node_modules/electron/dist, ни electron-*.zip в кеше');
}

// 3. Переименовать exe в имя игры (если не арестован политикой — обычно ок)
const exe = path.join(OUT, 'electron.exe');
const gameExe = path.join(OUT, 'Echoes of the Fallen.exe');
if (fs.existsSync(exe)) fs.renameSync(exe, gameExe);

// 4. resources/default_app.asar не нужен — кладём своё приложение папкой app/
const defaultAsar = path.join(OUT, 'resources', 'default_app.asar');
if (fs.existsSync(defaultAsar)) fs.rmSync(defaultAsar);
const appDir = path.join(OUT, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });

// 5. Наш код: веб-сборка + main/preload + мини-package.json
console.log('Копирую приложение...');
fs.cpSync(path.join(ROOT, 'dist'), path.join(appDir, 'dist'), { recursive: true });
fs.cpSync(path.join(ROOT, 'dist-electron'), path.join(appDir, 'dist-electron'), { recursive: true });
fs.writeFileSync(
  path.join(appDir, 'package.json'),
  JSON.stringify(
    {
      name: 'echoes-of-the-fallen',
      productName: 'Echoes of the Fallen',
      version: '0.1.0',
      main: 'dist-electron/main.js',
    },
    null,
    2,
  ),
);

// 6. Zip для раздачи
console.log('Пакую zip...');
const zip = path.join(ROOT, 'release', 'EchoesOfTheFallen-win64.zip');
if (fs.existsSync(zip)) fs.rmSync(zip);
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${OUT}' -DestinationPath '${zip}' -Force"`,
  { stdio: 'ignore' },
);

const size = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1);
console.log(`Готово: ${OUT} (${size(path.join(OUT, 'Echoes of the Fallen.exe'))} MB exe)`);
console.log(`Архив: ${zip} (${size(zip)} MB)`);
