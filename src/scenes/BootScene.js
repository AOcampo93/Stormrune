import Phaser from 'phaser';
import { Thor } from '../entities/Thor.js';
import { Draugr } from '../entities/Draugr.js';
import { loadSpriteSheets, sheetFrames } from '../systems/spriteSheets.js';

/**
 * BootScene loads the sprite sheets exported from the designs in art/designs
 * (the sea, the longship, Thor and the draugar), registers their animations
 * and builds the small textures that are cheaper to generate with code than
 * to ship as files. It then hands over to the game.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Relative paths inside, so the game also works from a sub-folder.
    loadSpriteSheets(this.load);
  }

  create() {
    Thor.createAnimations(this.anims);
    Draugr.createAnimations(this.anims);
    // The stormy sea loops at the design's 10 fps.
    if (!this.anims.exists('sea:loop')) {
      this.anims.create({ key: 'sea:loop', frames: sheetFrames(this.anims, 'sea'), frameRate: 10, repeat: -1 });
    }

    this.createParticleTextures();
    this.createVignetteTexture();
    this.scene.start('GameScene');
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
