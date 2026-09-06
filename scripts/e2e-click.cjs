// Диагностика боя: поднимает vite, открывает бой, проверяет кликабельность
// карт и границы элементов. Запуск: node scripts/e2e-click.cjs
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (url, timeoutMs = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const ok = await fetch(url);
      if (ok.ok) return true;
    } catch { /* нет ещё */ }
    await wait(500);
  }
  return false;
};

(async () => {
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    cwd: process.cwd(), stdio: 'ignore', detached: false,
  });
  try {
    const up = await waitFor('http://localhost:5173/');
    if (!up) throw new Error('vite не поднялся');

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(1500);

    // BGM на стартовом экране
    const bgInfo = await page.evaluate(() => {
      const audios = [...document.querySelectorAll('audio')].filter((a) => a.loop);
      return audios.map((a) => ({ src: (a.src || '').split('/').pop().slice(0, 40), volume: a.volume, paused: a.paused }));
    });
    console.log('BGM на меню:', JSON.stringify(bgInfo));

    // Чистый профиль: меню → «Начать игру» (+подтверждение) → хаб
    await page.locator('.menu .btn:has-text("Начать игру")').click();
    await page.waitForTimeout(300);
    const confirmBtn = page.locator('.menu .btn:has-text("с нуля")');
    if (await confirmBtn.count() > 0) await confirmBtn.click();
    await page.waitForTimeout(800);
    // Испытания → первый бой
    await page.locator('button.embark').click();
    await page.waitForTimeout(600);
    await page.locator('button:has-text("Сразиться")').first().click();
    await page.waitForTimeout(2500);

    // Туториал: прожать
    const tutVisible = async () => (await page.locator('.tutorial-overlay').count()) > 0;
    if (await tutVisible()) {
      console.log('ТУТОРИАЛ: показался');
      await page.locator('.tutorial-panel .btn').last().click();
      await page.waitForTimeout(250);
      await page.locator('.tutorial-overlay').click({ position: { x: 100, y: 100 } });
      await page.waitForTimeout(250);
      console.log('после клика по подложке:', await tutVisible() ? 'НЕ ЗАКРЫЛСЯ ✗' : 'закрылся ✓');
    } else {
      console.log('ТУТОРИАЛ: не показан (уже пройден)');
    }

    // Рамки карт
    const fits = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.hand .card')];
      return cards.map((c) => {
        const type = c.querySelector('.type');
        const r = c.getBoundingClientRect();
        return { fits: type ? type.getBoundingClientRect().bottom - r.top <= r.height : true };
      });
    });
    console.log('РАМКИ КАРТ:', fits.every((f) => f.fits) ? 'все помещаются ✓' : 'ВЫЛЕЗАЮТ ✗');

    // BGM в бою
    const bgBattle = await page.evaluate(() => {
      const audios = [...document.querySelectorAll('audio')].filter((a) => a.loop);
      return audios.map((a) => ({ src: (a.src || '').split('/').pop().slice(0, 40), volume: a.volume, paused: a.paused }));
    });
    console.log('BGM в бою:', JSON.stringify(bgBattle));

    // Диагностика кликабельности и границ
    const diag = await page.evaluate(() => {
      const card = document.querySelector('.hand .card');
      const foe = document.querySelector('.foe-card');
      const point = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { top: hit ? hit.tagName + '.' + String(hit.className).split(' ')[0] : 'null' };
      };
      return {
        handCard: card ? point(card) : 'нет карт',
        foeCard: foe ? point(foe) : 'нет карточек врагов',
      };
    });
    console.log('КЛИКАБЕЛЬНОСТЬ:', JSON.stringify(diag));

    // Аудит границ
    const audit = await page.evaluate(() => {
      const bad = [];
      const style = document.createElement('style');
      style.textContent = '.tooltip,.chip-tip{opacity:1 !important}';
      document.head.appendChild(style);
      const check = (sel, name) => {
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          if (r.left < -2 || r.right > innerWidth + 2 || r.top < -2 || r.bottom > innerHeight + 2) {
            bad.push(`${name}: [${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}]`);
          }
        }
      };
      check('.tooltip', 'тултип-карты');
      check('.chip-tip', 'чип');
      check('.hand .card', 'карта');
      check('.foe-card', 'карточка-врага');
      check('.hero-card', 'карточка-игрока');
      check('.float-num', 'число');
      style.remove();
      return bad;
    });
    console.log(audit.length === 0 ? 'АУДИТ ГРАНИЦ: всё в пределах экрана ✓' : 'ВЫХОДЫ ЗА ГРАНИЦЫ:\n' + audit.join('\n'));

    // Клик по карте
    const before = await page.locator('.hand .card').count();
    await page.locator('.hand .card').first().click();
    await page.waitForTimeout(400);
    const after = await page.locator('.hand .card').count();
    console.log(`КЛИК: карт ${before} → ${after}`);
    console.log(after < before ? 'РЕЗУЛЬТАТ: карта сыгралась ✓' : 'РЕЗУЛЬТАТ: КЛИК НЕ СРАБОТАЛ ✗');

    await page.screenshot({ path: 'e2e-battle.png' });
    await browser.close();
  } finally {
    vite.kill();
  }
  process.exit(0);
})().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(1); });
