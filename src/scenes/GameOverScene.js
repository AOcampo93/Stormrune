import Phaser from 'phaser';
import { MenuScreen } from '../ui/MenuScreen.js';

/**
 * A finger or mouse button may still be down from the last stroke when this
 * scene appears. Ignoring input briefly keeps that release from pressing
 * "Play Again" by accident.
 */
const INPUT_DELAY_MS = 700;

/**
 * GameOverScene shows the final score and the level reached. It starts a
 * fresh game on request (Enter), or goes back to How to Play (Escape). All
 * game state lives in GameScene.init(), so starting GameScene again is a
 * full, clean reset.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  /** @param {{score: number, level: number}} data Passed by GameScene. */
  init(data) {
    this.finalScore = data.score ?? 0;
    this.finalLevel = data.level ?? 1;
  }

  create() {
    new MenuScreen(this, {
      backdrop: 'screen:game-over',
      html: `
        <div class="game-over">
          <div class="runic">ᚷᚨᛗᛖ ᛟᚹᛖᚱ</div>
          <h1 class="game-over-title">The draugar<br />took the ship</h1>
          <div class="divider"><span class="line"></span><span class="rune">ᛟ</span><span class="line"></span></div>
          <div class="final-score">
            <span class="score-label">Score</span>
            <span class="score-value">${this.finalScore}</span>
          </div>
          <div class="level-reached">You reached level ${this.finalLevel}</div>
          <div class="buttons">
            <button class="button button-secondary" data-action="how-to-play">How to Play</button>
            <button class="button button-primary" data-action="play-again">Play Again</button>
          </div>
        </div>`,
      actions: {
        'play-again': () => this.scene.start('GameScene'),
        'how-to-play': () => this.scene.start('HowToPlayScene')
      },
      keys: { ENTER: 'play-again', SPACE: 'play-again', ESC: 'how-to-play' },
      inputDelayMs: INPUT_DELAY_MS
    });
  }
}
