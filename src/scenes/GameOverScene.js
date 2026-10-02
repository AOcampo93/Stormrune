import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/layout.js';
import { PALETTE, COLOR } from '../config/palette.js';

/**
 * A finger or mouse button may still be down from the last stroke when this
 * scene appears. Ignoring input briefly keeps that release from pressing
 * "Play again" by accident.
 */
const INPUT_DELAY_MS = 700;

const BUTTON_WIDTH = 280;
const BUTTON_HEIGHT = 72;

/**
 * GameOverScene shows the final score and the level reached, and starts a
 * fresh game on request. All game state lives in GameScene.init(), so
 * starting GameScene again is a full, clean reset.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  /** @param {{score: number, level: number}} data Passed by GameScene. */
  init(data) {
    this.finalScore = data.score ?? 0;
    this.finalLevel = data.level ?? 1;
    this.canRestart = false;
  }

  create() {
    const centerX = GAME_WIDTH / 2;
    const serif = 'Georgia, "Times New Roman", serif';

    this.cameras.main.fadeIn(500);

    this.add
      .text(centerX, 170, 'THE DRAUGAR TOOK THE SHIP', { fontFamily: serif, fontSize: '54px', color: PALETTE.danger })
      .setOrigin(0.5);

    this.add
      .text(centerX, 290, `Score ${this.finalScore}`, { fontFamily: serif, fontSize: '64px', color: PALETTE.white })
      .setOrigin(0.5);

    this.add
      .text(centerX, 365, `You reached level ${this.finalLevel}`, { fontFamily: serif, fontSize: '30px', color: PALETTE.accent })
      .setOrigin(0.5);

    this.createButton(centerX, GAME_HEIGHT - 190);

    // Keyboard players can restart too.
    this.input.keyboard?.on('keydown-ENTER', () => this.restart());
    this.input.keyboard?.on('keydown-SPACE', () => this.restart());

    this.time.delayedCall(INPUT_DELAY_MS, () => {
      this.canRestart = true;
      this.button.setAlpha(1);
    });
  }

  /** A rounded "PLAY AGAIN" button drawn with Graphics, plus a hit zone. */
  createButton(x, y) {
    const background = this.add.graphics();
    const drawBackground = (highlighted) => {
      background.clear();
      background.fillStyle(highlighted ? COLOR.glow : COLOR.silhouette, highlighted ? 0.25 : 0.9);
      background.fillRoundedRect(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT, 16);
      background.lineStyle(3, COLOR.glow, 1);
      background.strokeRoundedRect(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT, 16);
    };
    drawBackground(false);

    const label = this.add
      .text(0, 0, 'PLAY AGAIN', { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '32px', color: PALETTE.white })
      .setOrigin(0.5);

    this.button = this.add.container(x, y, [background, label]).setAlpha(0.4);

    const zone = this.add.zone(x, y, BUTTON_WIDTH, BUTTON_HEIGHT).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => drawBackground(true));
    zone.on('pointerout', () => drawBackground(false));
    zone.on('pointerup', () => this.restart());
  }

  restart() {
    if (!this.canRestart) {
      return;
    }
    this.canRestart = false;
    this.scene.start('GameScene');
  }
}
