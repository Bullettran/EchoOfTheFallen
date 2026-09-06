/**
 * BattleScene — фон арены + атмосферные/боевые VFX.
 * Все бойцы — HTML-карточки (Hearthstone-раскладка): враги сверху, игрок снизу.
 * Числа урона — тоже в HTML (BattleScreen); Phaser отвечает за атмосферу:
 *   - фон: cover-fit + Ken Burns zoom + виньетка; слои дыма с параллаксом от мыши
 *   - живой свет: пульсирующее зарева очага, цветовая grading по фазе хода
 *   - амбиент: падающий пепел и всплывающие угли
 *   - события боя (EventBus vfx:*): росчерк атаки, искры урона, кольца блока,
 *     золотые искры лечения, вспышки состояний, тряска и zoom-punch камеры
 *
 * ВАЖНО (грабля №1): отписки EventBus — в cleanup(), который вешается и на
 * shutdown(), и на destroy(), и на Phaser.Scenes.Events.SHUTDOWN/DESTROY.
 */
import Phaser from 'phaser';
import { useBattleStore } from '@/stores/battle';
import { eventBus } from '@/core/EventBus';
import { sceneUrl } from '@/core/assets';
import { getCardDefinition } from '@/game/CardFactory';
import { STATES } from '@/data/states';
import type { GameEvents } from '@/core/EventBus';
import type { Handler } from 'mitt';

const BG_TEX = 'battle_bg';
const DOT_TEX = 'vfx_dot';
const SLASH_TEX = 'vfx_slash';
const VIGNETTE_TEX = 'vfx_vignette';

type VfxHandler<K extends keyof GameEvents> = Handler<GameEvents[K]>;

/** Слой параллакса: объект + базовая позиция + коэффициент смещения от мыши. */
interface ParallaxLayer {
  obj: Phaser.GameObjects.Components.Transform;
  baseX: number;
  baseY: number;
  factor: number;
}

export class BattleScene extends Phaser.Scene {
  private bound: Array<[keyof GameEvents, Handler]> = [];
  private cleaned = false;
  private bursts = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private layers: ParallaxLayer[] = [];
  /** Параллакс: текущий и целевой сдвиг от курсора (-1..1), сглаживается в update() */
  private par = { x: 0, y: 0, tx: 0, ty: 0 };
  private enemyTint: Phaser.GameObjects.Rectangle | null = null;
  private warmTint: Phaser.GameObjects.Rectangle | null = null;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0b0a0f');
    this.cleaned = false;
    this.layers = [];

    const store = useBattleStore();
    const bgUrl = sceneUrl((store.currentEnemyDefs[0]?.scene ?? 'ash_wastes_path') as never);

    // Фолбэк-градиент до загрузки арта
    this.add.graphics()
      .fillGradientStyle(0x14121c, 0x14121c, 0x060509, 0x060509, 1)
      .fillRect(0, 0, width, height)
      .setDepth(-11);

    this.makeTextures();

    if (bgUrl) {
      this.load.image(BG_TEX, bgUrl);
      this.load.once('complete', () => {
        const bg = this.add
          .image(width / 2, height / 2, BG_TEX)
          .setDepth(-10);
        // cover-fit без искажения пропорций (арт может прийти любым размером)
        const tex = bg.texture.getSourceImage();
        const cover = Math.max(width / tex.width, height / tex.height);
        bg.setScale(cover);
        // фон — самый «дальний» слой параллакса (сдвигается меньше всех)
        this.layers.push({ obj: bg, baseX: width / 2, baseY: height / 2, factor: 6 });
        // Ken Burns: очень медленный вдох/выдох масштаба — фон «дышит»
        this.tweens.add({
          targets: bg,
          scale: cover * 1.07,
          duration: 22000,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inout',
        });
        // виньетка: темнее к краям, центр чистый (текст арены читается)
        if (this.textures.exists(VIGNETTE_TEX)) {
          this.add.image(width / 2, height / 2, VIGNETTE_TEX).setDisplaySize(width, height).setDepth(-9);
        } else {
          this.add.rectangle(width / 2, height / 2, width, height, 0x060509, 0.34).setDepth(-9);
        }
        this.game.canvas.dataset.bgLoaded = '1'; // e2e-маркер
      });
      this.load.start();
    }

    this.ambientAsh();
    this.smokeLayers();
    this.hearthGlow();
    this.turnGrading();
    this.wireVfx();

    // Параллакс от курсора: сцена «оглядывается» за мышью
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.par.tx = (p.x / this.scale.width - 0.5) * 2;
      this.par.ty = (p.y / this.scale.height - 0.5) * 2;
    });

    // Грабля №1: чистим подписки при любом способе смерти сцены
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  /** Плавный параллакс слоёв + Ken Burns не мешают: сдвигаем сами слои. */
  override update(): void {
    // сглаживание к цели (независимо от FPS достаточно лёгкой экспоненты)
    this.par.x += (this.par.tx - this.par.x) * 0.06;
    this.par.y += (this.par.ty - this.par.y) * 0.06;
    for (const l of this.layers) {
      l.obj.x = l.baseX + l.factor * this.par.x;
      l.obj.y = l.baseY + l.factor * 0.6 * this.par.y;
    }
  }

  // ==================== Слои «живой» сцены ====================

  /**
   * Дым/пыль двумя планами: дальний — медленный и холодный, ближний — быстрый
   * и плотнее. Каждый клубень — мягкое пятно, дрейфует по X с оборачиванием.
   * Контейнер каждого клуба смещается параллаксом (контейнер ≠ твин объекта).
   */
  private smokeLayers(): void {
    if (!this.textures.exists(DOT_TEX)) return;
    const { width, height } = this.scale;
    const plan = (count: number, factor: number, depth: number, cfg: {
      tint: number; alpha: number; scale: [number, number]; yRange: [number, number]; dur: [number, number];
    }) => {
      for (let i = 0; i < count; i++) {
        const box = this.add.container(0, 0).setDepth(depth);
        const scale = Phaser.Math.FloatBetween(cfg.scale[0], cfg.scale[1]);
        const blob = this.add.image(0, 0, DOT_TEX)
          .setScale(scale, scale * 0.45)
          .setTint(cfg.tint)
          .setAlpha(Phaser.Math.FloatBetween(cfg.alpha * 0.7, cfg.alpha));
        box.add(blob);
        const baseX = Phaser.Math.Between(0, width);
        const baseY = Phaser.Math.Between(cfg.yRange[0], cfg.yRange[1]);
        box.setPosition(baseX, baseY);
        this.layers.push({ obj: box, baseX, baseY, factor });
        // дрейф: медленно в сторону, с выходом за край — телепорт в начало
        const dur = Phaser.Math.Between(cfg.dur[0], cfg.dur[1]);
        this.tweens.add({
          targets: blob,
          x: { from: -width * 0.4, to: width * 0.4 },
          duration: dur,
          repeat: -1,
          ease: 'sine.inout',
          onRepeat: () => {
            blob.setScale(Phaser.Math.FloatBetween(cfg.scale[0], cfg.scale[1]));
            blob.y = Phaser.Math.Between(-70, 70);
          },
        });
        // лёгкое вертикальное колыхание
        this.tweens.add({
          targets: blob,
          alpha: { from: blob.alpha * 0.6, to: blob.alpha },
          duration: Phaser.Math.Between(3000, 6000),
          yoyo: true,
          repeat: -1,
          ease: 'sine.inout',
        });
      }
    };
    // дальний план: холодная дымка
    plan(4, 12, -7, {
      tint: 0x8b93a8, alpha: 0.08, scale: [10, 16], yRange: [height * 0.25, height * 0.65], dur: [40000, 70000],
    });
    // ближний план: тёплая пыль/пепельная мгла
    plan(3, 26, -3, {
      tint: 0x9a8a78, alpha: 0.06, scale: [14, 22], yRange: [height * 0.4, height * 0.9], dur: [26000, 42000],
    });
  }

  /** Зарева очага игрока: тёплое пятно света пульсирует, как костёр. */
  private hearthGlow(): void {
    if (!this.textures.exists(DOT_TEX)) return;
    const { width, height } = this.scale;
    const glow = this.add.image(width * 0.22, height * 0.92, DOT_TEX)
      .setScale(16, 9)
      .setTint(0xff8c42)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.16)
      .setDepth(-6);
    const baseX = glow.x; const baseY = glow.y;
    this.layers.push({ obj: glow, baseX, baseY, factor: 16 });
    // мерцание костра: два твина разной длины дают живую неровность
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.11, to: 0.2 },
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    });
    this.tweens.add({
      targets: glow,
      scaleX: { from: 15, to: 17.5 },
      duration: 2100,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    });
  }

  /**
   * Цветовая grading фаз хода: ход врага — холодная красная мгла (опасность),
   * ход игрока — тёплый янтарный свет. Плавные переходы через альфу.
   */
  private turnGrading(): void {
    const { width, height } = this.scale;
    this.enemyTint = this.add.rectangle(width / 2, height / 2, width, height, 0x40101a, 0)
      .setDepth(-2);
    this.warmTint = this.add.rectangle(width / 2, height / 2, width, height, 0x663d14, 0.1)
      .setDepth(-2);
    const on = (k: 'turn:enemyStart' | 'turn:playerStart', fn: () => void): void => {
      eventBus.on(k, fn as Handler);
      this.bound.push([k, fn as Handler]);
    };
    on('turn:enemyStart', () => {
      this.tweens.add({ targets: this.enemyTint, alpha: 0.16, duration: 700, ease: 'sine.out' });
      this.tweens.add({ targets: this.warmTint, alpha: 0, duration: 700 });
    });
    on('turn:playerStart', () => {
      this.tweens.add({ targets: this.enemyTint, alpha: 0, duration: 900, ease: 'sine.out' });
      this.tweens.add({ targets: this.warmTint, alpha: 0.1, duration: 900 });
    });
  }

  // ==================== Текстуры VFX ====================

  /** Мягкая точка (частицы), росчерк-дуга и виньетка — из offscreen-canvas. */
  private makeTextures(): void {
    if (!this.textures.exists(DOT_TEX)) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.addCanvasSafe(DOT_TEX, c);
    }
    if (!this.textures.exists(SLASH_TEX)) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g = c.getContext('2d')!;
      g.translate(64, 64);
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 11;
      g.lineCap = 'round';
      g.shadowColor = 'rgba(255,255,255,0.9)';
      g.shadowBlur = 14;
      g.beginPath();
      g.ellipse(0, 0, 52, 22, -Math.PI / 5, Math.PI * 0.12, Math.PI * 0.95);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(0, 0, 40, 15, -Math.PI / 5, Math.PI * 0.18, Math.PI * 0.9);
      g.stroke();
      this.addCanvasSafe(SLASH_TEX, c);
    }
    if (!this.textures.exists(VIGNETTE_TEX)) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 288;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(256, 144, 70, 256, 144, 330);
      grad.addColorStop(0, 'rgba(6,5,9,0)');
      grad.addColorStop(0.68, 'rgba(6,5,9,0.05)');
      grad.addColorStop(1, 'rgba(6,5,9,0.48)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 288);
      this.addCanvasSafe(VIGNETTE_TEX, c);
    }
  }

  private addCanvasSafe(key: string, canvas: HTMLCanvasElement): void {
    try {
      this.textures.addCanvas(key, canvas);
    } catch {
      /* текстура уже есть или canvas-текстуры недоступны — VFX деградируют тихо */
    }
  }

  // ==================== Амбиент: пепел и угли ====================

  private ambientAsh(): void {
    if (!this.textures.exists(DOT_TEX)) return;
    const { width, height } = this.scale;
    // Медленный пепел, сыплющийся сверху
    this.add.particles(0, 0, DOT_TEX, {
      x: { min: -60, max: width + 60 },
      y: { min: -70, max: -10 },
      speedY: { min: 14, max: 34 },
      speedX: { min: -16, max: 6 },
      lifespan: { min: 9000, max: 16000 },
      scale: { start: 0.45, end: 0.22 },
      alpha: { start: 0.32, end: 0.05 },
      tint: 0xa8a094,
      frequency: 240,
    }).setDepth(-5);
    // Редкие угли, всплывающие снизу
    this.add.particles(0, 0, DOT_TEX, {
      x: { min: 80, max: width - 80 },
      y: { min: height + 10, max: height + 60 },
      speedY: { min: -42, max: -16 },
      speedX: { min: -10, max: 10 },
      lifespan: { min: 4000, max: 7500 },
      scale: { start: 0.38, end: 0.05 },
      alpha: { start: 0.8, end: 0 },
      tint: 0xff8c42,
      blendMode: Phaser.BlendModes.ADD,
      frequency: 640,
    }).setDepth(-4);
  }

  // ==================== Позиции целей (HTML-карточки → координаты canvas) ====================

  /** Центр карточки цели в координатах сцены (canvas FIT-отмасштабирован в CSS). */
  private targetPos(targetId: string): { x: number; y: number } {
    const el = document.querySelector(`[data-target-id="${targetId}"]`);
    const canvas = this.game.canvas;
    if (el && canvas) {
      const r = el.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      const sx = this.scale.width / Math.max(c.width, 1);
      const sy = this.scale.height / Math.max(c.height, 1);
      return {
        x: (r.left + r.width / 2 - c.left) * sx,
        y: (r.top + r.height * 0.4 - c.top) * sy,
      };
    }
    return targetId === 'player' ? { x: 210, y: 560 } : { x: this.scale.width / 2, y: 240 };
  }

  // ==================== Вспомогательные VFX ====================

  /** Взрыв частиц (кэш эмиттеров по цвету). radial — во все стороны, rise — вверх. */
  private burst(x: number, y: number, color: number, count: number, mode: 'radial' | 'rise' = 'radial'): void {
    if (!this.textures.exists(DOT_TEX)) return;
    const key = `${mode}_${color}`;
    let em = this.bursts.get(key);
    if (!em || !em.active) {
      em = mode === 'radial'
        ? this.add.particles(0, 0, DOT_TEX, {
            speed: { min: 70, max: 250 },
            lifespan: { min: 260, max: 560 },
            scale: { start: 0.55, end: 0 },
            alpha: { start: 0.95, end: 0 },
            tint: color,
            blendMode: Phaser.BlendModes.ADD,
            frequency: -1,
          })
        : this.add.particles(0, 0, DOT_TEX, {
            angle: { min: 250, max: 290 },
            speed: { min: 46, max: 130 },
            lifespan: { min: 520, max: 950 },
            gravityY: -40,
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.9, end: 0 },
            tint: color,
            blendMode: Phaser.BlendModes.ADD,
            frequency: -1,
          });
      em.setDepth(6);
      this.bursts.set(key, em);
    }
    em.explode(count, x, y);
  }

  /** Расходящееся кольцо (блок/состояние/лечение). */
  private ring(x: number, y: number, color: number, maxR = 44): void {
    const g = this.add.graphics().setDepth(5);
    g.lineStyle(3, color, 0.95);
    g.strokeCircle(0, 0, 28);
    g.setPosition(x, y).setScale(0.35).setAlpha(0.95);
    this.tweens.add({
      targets: g,
      scale: maxR / 28,
      alpha: 0,
      duration: 320,
      ease: 'cubic.out',
      onComplete: () => g.destroy(),
    });
  }

  /** Росчерк-дуга удара. */
  private slash(x: number, y: number, color = 0xffd9a0): void {
    if (!this.textures.exists(SLASH_TEX)) return;
    for (let i = 0; i < 2; i++) {
      const s = this.add.image(x, y, SLASH_TEX).setDepth(7);
      s.setTint(color);
      s.setRotation(Phaser.Math.FloatBetween(-0.9, 0.9) + i * 0.5);
      s.setAlpha(0.95).setScale(0.55);
      this.tweens.add({
        targets: s,
        scale: 1.3 + i * 0.25,
        alpha: 0,
        duration: i === 0 ? 190 : 260,
        delay: i * 60,
        ease: 'cubic.out',
        onComplete: () => s.destroy(),
      });
    }
  }

  /** Огненный росчерк-снаряд от игрока к цели, в конце — удар. */
  private streak(from: { x: number; y: number }, to: { x: number; y: number }, color: number): void {
    if (!this.textures.exists(DOT_TEX)) {
      this.slash(to.x, to.y);
      return;
    }
    const dot = this.add.image(from.x, from.y - 30, DOT_TEX).setDepth(7);
    dot.setTint(color).setBlendMode(Phaser.BlendModes.ADD);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    dot.setRotation(angle);
    dot.setScale(1.8, 0.55);
    this.tweens.add({
      targets: dot,
      x: to.x,
      y: to.y,
      duration: 150,
      ease: 'cubic.in',
      onComplete: () => {
        dot.destroy();
        this.slash(to.x, to.y);
        this.burst(to.x, to.y, color, 8);
      },
    });
  }

  // ==================== Подписки на события боя ====================

  private wireVfx(): void {
    const on = <K extends keyof GameEvents>(type: K, fn: VfxHandler<K>): void => {
      eventBus.on(type, fn as Handler);
      this.bound.push([type, fn as Handler]);
    };

    on('vfx:cardPlayed', ({ cardDefId, targetId }) => {
      const target = this.targetPos(targetId);
      let kind = 'skill';
      try {
        kind = getCardDefinition(cardDefId).type;
      } catch {
        /* неизвестная карта — рисуем нейтральное кольцо */
      }
      if (kind === 'attack') {
        this.streak(this.targetPos('player'), target, 0xffb066);
      } else if (kind === 'defense') {
        const p = this.targetPos('player');
        this.ring(p.x, p.y, 0x6db3ff);
        this.burst(p.x, p.y, 0x6db3ff, 7);
      } else {
        const p = this.targetPos('player');
        this.ring(p.x, p.y, 0xb98ad8, 36);
      }
    });

    on('vfx:damage', ({ targetId, amount }) => {
      const p = this.targetPos(targetId);
      const isPlayer = targetId === 'player';
      this.burst(p.x, p.y, isPlayer ? 0xff5544 : 0xffb066, Math.min(10 + amount, 26));
      this.ring(p.x, p.y, isPlayer ? 0xff5544 : 0xffc98a, isPlayer ? 52 : 40);
      if (amount >= 10) this.cameras.main.shake(110, 0.0035);
      // Тяжёлый удар по игроку: красная вспышка по краям + zoom-punch камеры
      if (isPlayer && amount >= 7) {
        const flash = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x8a1414, 0.22).setDepth(8);
        this.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });
      }
      if (amount >= 9) {
        this.cameras.main.zoomTo(1.018, 70, 'Cubic.easeOut', true, (camera) => camera.zoomTo(1, 260, 'Sine.easeOut'));
      }
    });

    on('vfx:block', ({ targetId }) => {
      const p = this.targetPos(targetId);
      this.ring(p.x, p.y, 0x6db3ff, 48);
      this.burst(p.x, p.y, 0x6db3ff, 8);
    });

    on('vfx:heal', ({ targetId }) => {
      const p = this.targetPos(targetId);
      this.ring(p.x, p.y, 0xffd77a, 40);
      this.burst(p.x, p.y, 0xffd77a, 14, 'rise');
    });

    on('vfx:state', ({ targetId, state }) => {
      const p = this.targetPos(targetId);
      const hex = parseInt(STATES[state.type].color.slice(1), 16);
      this.ring(p.x, p.y, hex, 34);
      this.burst(p.x, p.y, hex, 7);
    });

    on('vfx:enemySpawned', ({ targetId }) => {
      const p = this.targetPos(targetId);
      this.burst(p.x, p.y, 0xc05bff, 16);
    });

    on('vfx:mercy', ({ targetId }) => {
      const p = this.targetPos(targetId);
      this.ring(p.x, p.y, 0xfff2d0, 56);
      this.burst(p.x, p.y, 0xfff2d0, 10);
    });

    // Финал боя: победа — тёплый свет, поражение — тьма
    on('battle:ended', ({ result }) => {
      if (result === 'victory' || result === 'spared') {
        this.tweens.add({ targets: this.enemyTint, alpha: 0, duration: 400 });
        this.tweens.add({ targets: this.warmTint, alpha: 0.24, duration: 900 });
      } else {
        this.tweens.add({ targets: this.enemyTint, alpha: 0.42, duration: 1400, ease: 'sine.inout' });
        this.tweens.add({ targets: this.warmTint, alpha: 0, duration: 600 });
      }
    });
  }

  // ==================== Чистка (грабля №1) ====================

  /** Phaser 4: у Scene нет переопределяемых shutdown/destroy — чистка
   *  гарантируется подписками на SHUTDOWN/DESTROY в create(). */
  cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    for (const [type, fn] of this.bound) {
      eventBus.off(type, fn);
    }
    this.bound = [];
    this.bursts.clear();
    this.layers = [];
    this.enemyTint = null;
    this.warmTint = null;
  }
}
