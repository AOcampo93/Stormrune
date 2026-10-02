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
    this.load.svg('draugr', 'assets/draugr.svg');
    this.load.svg('ship', 'assets/ship.svg');
  }

  create() {
    this.scene.start('GameScene');
  }
}
