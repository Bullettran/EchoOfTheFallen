// Фоновые сцены Акта 2 «Пепельный город» (Pollinations, FLUX)
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve(__dirname, '../src/assets/images/scenes');
const STYLE = 'dark fantasy, dark souls inspired, muted ashen color palette, deep shadows, atmospheric perspective, wide establishing shot, painterly digital art, no text, no watermark, no characters';

const SCENES = [
  ['ash_city', 'vast ruined city covered in thick grey ash, crumbled buildings, empty streets, distant black palace silhouette on horizon, overcast sky, wind carrying ash, desolate apocalyptic atmosphere'],
  ['ash_market', 'dead marketplace square in ash-covered ruined city, burnt wooden stalls and market stalls, scattered debris, cobblestones buried under grey ash, haunting silence, abandoned'],
  ['fire_temple', 'interior of ancient temple with thousand candles burning without flame, floating white lights, gothic stone columns, burnt priest altar in center, ethereal glow, solemn atmosphere'],
  ['mage_tower', 'interior top of ruined mage tower, spiral staircase, glowing magical runes on walls, floating arcane symbols, destroyed stone room with holographic projection, mystical blue light'],
  ['king_palace', 'throne room of fallen king, enormous hall of black stone, empty ornate throne, cracked marble floor, faded royal banners, oppressive darkness, single beam of pale light on throne'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const [id, prompt] of SCENES) {
    const out = path.join(OUT, `${id}.jpeg`);
    if (fs.existsSync(out)) { console.log('= ' + id); continue; }
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ', ' + STYLE)}?width=1280&height=720&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1e9)}`;
    for (let a = 1; a <= 3; a++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 15000) throw new Error('small');
        fs.writeFileSync(out, buf);
        console.log(`✓ ${id} (${(buf.length / 1024).toFixed(0)} KB)`);
        break;
      } catch (e) {
        if (a === 3) console.log(`✗ ${id}: ${e.message}`);
        else await sleep(6000);
      }
    }
    await sleep(2000);
  }
})();
