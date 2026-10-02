import { PALETTE, COLOR } from '../config/palette.js';
import { GAME_WIDTH, SAFE_MARGIN, DEPTH } from '../config/layout.js';

/** Horizontal distance between life icons. */
const LIFE_SPACING = 44;

const TEXT_STYLE = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  color: PALETTE.white,
  stroke: PALETTE.silhouette,
  strokeThickness: 6
};

/**
 * The heads-up display, drawn entirely with code and simple shapes:
 *   top-left   - one hammer per life (filled = left, dimmed outline = lost)
 *   top-center - score
 *   top-right  - level number
 * Everything stays SAFE_MARGIN px away from the screen edges, clear of the
 * notches and rounded corners of phones held in landscape.
 */
export class Hud {
  /**
   * @param {Phaser.Scene} scene
   * @param {{lives: number, score: number, level: number}} initial
   */
  constructor(scene, { lives, score, level }) {
    this.scene = scene;

    this.lifeIcons = Array.from({ length: lives }, (_, i) =>
      scene.add
        .graphics()
        .setPosition(SAFE_MARGIN + 16 + i * LIFE_SPACING, SAFE_MARGIN + 20)
        .setDepth(DEPTH.hud)
    );

    this.scoreText = scene.add
      .text(GAME_WIDTH / 2, SAFE_MARGIN, '', { ...TEXT_STYLE, fontSize: '40px' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.hud);

    this.levelText = scene.add
      .text(GAME_WIDTH - SAFE_MARGIN, SAFE_MARGIN + 4, '', { ...TEXT_STYLE, fontSize: '28px', color: PALETTE.accent })
      .setOrigin(1, 0)
      .setDepth(DEPTH.hud);

    this.setLives(lives);
    this.setScore(score);
    this.setLevel(level);
  }

  setLives(lives) {
    this.lifeIcons.forEach((icon, index) => drawHammer(icon, index < lives));
  }

  setScore(score) {
    this.scoreText.setText(String(score));

    // A small "pop" so the eye notices points coming in.
    this.scene.tweens.killTweensOf(this.scoreText);
    this.scoreText.setScale(1.25);
    this.scene.tweens.add({ targets: this.scoreText, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  setLevel(level) {
    this.levelText.setText(`LEVEL ${level}`);
  }
}

/**
 * A simple war hammer centered on (0, 0), about 36 px tall: a wide head
 * on a short handle. A lost life is drawn as a faint outline instead.
 */
function drawHammer(g, filled) {
  g.clear();

  if (filled) {
    g.fillStyle(COLOR.accent, 1);
    g.fillRoundedRect(-15, -18, 30, 13, 3); // head
    g.fillRect(-3, -6, 6, 20); // handle
    g.fillRoundedRect(-5, 13, 10, 5, 2); // pommel
    g.lineStyle(2, COLOR.silhouette, 0.9);
    g.strokeRoundedRect(-15, -18, 30, 13, 3);
  } else {
    g.lineStyle(2, COLOR.white, 0.3);
    g.strokeRoundedRect(-15, -18, 30, 13, 3);
    g.strokeRect(-3, -5, 6, 18);
  }
}
