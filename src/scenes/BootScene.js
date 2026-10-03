import Phaser from 'phaser';
import { Thor } from '../entities/Thor.js';
import { Draugr } from '../entities/Draugr.js';
import { loadSpriteSheets, sheetFrames } from '../systems/spriteSheets.js';

/** The menu screens' artwork, exported from their designs. */
const SCREEN_BACKDROPS = ['how-to-play', 'about', 'game-over'];

/**
 * The web fonts the screens and the HUD use (bundled in main.js). The game
 * waits for them so the first screen doesn't flash in a fallback font.
 */
const FONTS = [
  ['400 20px Cinzel'],
  ['700 20px Cinzel'],
  ['900 20px Cinzel'],
  ['400 20px "Alegreya Sans"'],
  ['500 20px "Alegreya Sans"'],
  ['400 20px "Noto Sans Runic"', 'ᚠ']
];

/** Don't hold the game back longer than this if a font is slow to arrive. */
const FONT_WAIT_MS = 3000;

/**
 * BootScene loads the sprite sheets exported from the designs in art/designs
 * (the sea, the longship, Thor and the draugar) and the menu screens'
 * artwork, registers the animations and builds the small textures that are
 * cheaper to generate with code than to ship as files. Once the fonts are
 * ready it opens the How to Play screen.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Relative paths inside, so the game also works from a sub-folder.
    loadSpriteSheets(this.load);
    for (const key of SCREEN_BACKDROPS) {
      this.load.image(`screen:${key}`, `assets/screens/${key}.webp`);
    }
  }

  create() {
    Thor.createAnimations(this.anims);
    Draugr.createAnimations(this.anims);
    // The stormy sea loops at the design's 10 fps.
    if (!this.anims.exists('sea:loop')) {
      this.anims.create({ key: 'sea:loop', frames: sheetFrames(this.anims, 'sea'), frameRate: 10, repeat: -1 });
    }

    this.createParticleTextures();
    this.createLensTextures();
    this.createHammerTextures();
    this.createVignetteTexture();

    const fonts = Promise.all(FONTS.map(([font, text]) => document.fonts.load(font, text)));
    const timeout = new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS));
    Promise.race([fonts, timeout])
      .catch(() => {}) // a missing font only means a fallback typeface
      .then(() => this.scene.start('HowToPlayScene'));
  }

  /**
   * Water right in front of the camera (see CameraSpray). These need
   * gradients, so they are painted on canvases:
   *   'spray-blob'    - a drop flying past the lens, out of focus,
   *   'spray-haze'    - a soft cloud of mist,
   *   'spray-droplet' - a small drop in focus: a tight bright core,
   *   'spray-streak'  - a fast drop blurred along its flight, bright at the
   *                     head (top) and clear at the tail,
   *   'lens-drop'     - a drop that landed on the lens.
   */
  createLensTextures() {
    const paint = (key, width, height, draw) => {
      const texture = this.textures.createCanvas(key, width, height);
      draw(texture.context, width, height);
      texture.refresh();
    };
    const radial = (ctx, size, stops) => {
      const r = size / 2;
      const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
      stops.forEach(([offset, alpha]) => gradient.addColorStop(offset, `rgba(255, 255, 255, ${alpha})`));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    };

    // A blurred drop: an even disc, a little brighter toward its soft rim.
    paint('spray-blob', 64, 64, (ctx) => radial(ctx, 64, [[0, 0.35], [0.72, 0.5], [0.86, 0.3], [1, 0]]));
    paint('spray-haze', 64, 64, (ctx) => radial(ctx, 64, [[0, 0.5], [0.5, 0.25], [1, 0]]));
    paint('spray-droplet', 10, 10, (ctx) => radial(ctx, 10, [[0, 1], [0.45, 0.9], [0.7, 0.25], [1, 0]]));

    paint('spray-streak', 6, 36, (ctx, width, height) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.7)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(1.5, 0, width - 3, height);
    });

    // A drop on the glass is nearly clear: the scene shows through, darker
    // toward its rim. Light bends into a soft crescent along the bottom,
    // brightest in the middle, and a small soft highlight sits near the top.
    paint('lens-drop', 48, 48, (ctx, size) => {
      const r = size / 2;
      const radius = r - 4;
      const body = ctx.createRadialGradient(r, r, 0, r, r, radius);
      body.addColorStop(0, 'rgba(200, 225, 245, 0.03)');
      body.addColorStop(0.7, 'rgba(10, 20, 35, 0.06)');
      body.addColorStop(1, 'rgba(5, 12, 24, 0.3)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(r, r, radius, 0, Math.PI * 2);
      ctx.fill();

      const crescent = ctx.createLinearGradient(r - radius, 0, r + radius, 0);
      crescent.addColorStop(0, 'rgba(235, 247, 255, 0)');
      crescent.addColorStop(0.5, 'rgba(235, 247, 255, 0.6)');
      crescent.addColorStop(1, 'rgba(235, 247, 255, 0)');
      ctx.strokeStyle = crescent;
      for (const [lineWidth, alpha] of [[4, 0.35], [1.5, 1]]) {
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(r, r, radius - 2, Math.PI * 0.18, Math.PI * 0.82);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(r - radius * 0.38, r - radius * 0.45);
      ctx.scale(1.6, 1);
      const glint = ctx.createRadialGradient(0, 0, 0, 0, 0, 3);
      glint.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glint;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  /**
   * The HUD's lives, drawn like the hammers on the How to Play screen:
   * 'hammer' is a life left, glowing blue, and 'hammer-lost' a dim grey one.
   * The glow is a canvas shadow, so it is painted once instead of every frame.
   */
  createHammerTextures() {
    const SIZE = 64; // texture side
    const ICON = 0.7; // the design's 60-unit icon, scaled to fit with room for the glow
    const hammers = {
      hammer: { head: '#6fd8ee', cheeks: '#a9ecf8', handle: '#4a3426', alpha: 1, glow: 'rgba(95, 220, 245, 0.8)' },
      'hammer-lost': { head: '#6a7d92', cheeks: '#8597ab', handle: '#4a5262', alpha: 0.5, glow: null }
    };
    for (const [key, look] of Object.entries(hammers)) {
      const texture = this.textures.createCanvas(key, SIZE, SIZE);
      const ctx = texture.context;
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.rotate(-40 * (Math.PI / 180));
      ctx.scale(ICON, ICON);
      ctx.translate(-30, -30);
      ctx.globalAlpha = look.alpha;
      if (look.glow) {
        ctx.shadowColor = look.glow;
        ctx.shadowBlur = 10;
      }
      // A rounded rectangle, traced by hand (older Safari lacks roundRect).
      const block = (x, y, width, height, radius, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.fill();
      };
      block(27, 30, 6, 24, 2, look.handle);
      block(12, 10, 36, 20, 3, look.head);
      block(9, 8, 6, 24, 2, look.cheeks);
      block(45, 8, 6, 24, 2, look.cheeks);
      texture.refresh();
    }
  }

  /**
   * A full-screen red vignette (clear in the middle, red at the edges),
   * flashed when a draugr boards the ship. Graphics cannot draw radial
   * gradients into a texture, so this one is painted on a canvas.
   */
  createVignetteTexture() {
    const { width, height } = this.scale;
    const texture = this.textures.createCanvas('vignette', width, height);
    const ctx = texture.context;

    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, height * 0.35,
      width / 2, height / 2, width * 0.62
    );
    gradient.addColorStop(0, 'rgba(229, 57, 53, 0)');
    gradient.addColorStop(1, 'rgba(229, 57, 53, 0.85)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Upload the finished drawing to the GPU (required under WebGL).
    texture.refresh();
  }

  /**
   * Particle textures are tiny white shapes; each emitter tints them.
   * They are drawn once with a Graphics object, baked into textures with
   * generateTexture(), and the Graphics is thrown away.
   */
  createParticleTextures() {
    const g = this.make.graphics({}, false);

    // 'spark': a bright dot with a soft edge (lightning hits, deaths).
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(6, 6, 6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 3);
    g.generateTexture('spark', 12, 12);
    g.clear();

    // 'puff': a soft, round wisp of smoke (failed casts).
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(10, 10, 10);
    g.fillStyle(0xffffff, 0.45);
    g.fillCircle(10, 10, 6);
    g.generateTexture('puff', 20, 20);
    g.clear();

    // 'raindrop': a thin vertical streak.
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 18);
    g.generateTexture('raindrop', 2, 18);

    g.destroy();
  }
}
