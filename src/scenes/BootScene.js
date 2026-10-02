import Phaser from 'phaser';

/**
 * BootScene loads the SVG art and builds the small textures that are cheaper
 * to generate with code than to ship as files. It then hands over to the game.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.scene.start('GameScene');
  }
}
