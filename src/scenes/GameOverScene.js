import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/layout.js';
import { PALETTE } from '../config/palette.js';

/**
 * GameOverScene shows the final result and lets the player start again.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create() {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'GAME OVER', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '64px',
        color: PALETTE.danger
      })
      .setOrigin(0.5);

    this.input.once('pointerup', () => this.scene.start('GameScene'));
  }
}
