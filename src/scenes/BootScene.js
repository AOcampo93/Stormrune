import Phaser from 'phaser';

/**
 * BootScene loads the SVG art and builds the small textures that are cheaper
 * to generate with code than to ship as files. It then hands over to the game.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Relative paths, so the game also works when served from a sub-folder.
    // Each SVG declares its own width and height, which Phaser rasterizes at.
    this.load.svg('sky', 'assets/sky.svg');
    this.load.svg('sea-back', 'assets/sea-back.svg');
    this.load.svg('sea-front', 'assets/sea-front.svg');
    this.load.svg('draugr', 'assets/draugr.svg');
    this.load.svg('ship', 'assets/ship.svg');
  }

  create() {
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
