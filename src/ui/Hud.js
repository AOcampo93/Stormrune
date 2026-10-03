import { PALETTE, FONT } from '../config/palette.js';
import { GAME_WIDTH, SAFE_MARGIN, DEPTH } from '../config/layout.js';

/** Horizontal distance between life icons. */
const LIFE_SPACING = 46;

/** Room around the level sign for its glow, in px. */
const GLOW_PADDING = 18;

const TEXT_STYLE = {
  fontFamily: FONT.display,
  fontStyle: '700',
  color: PALETTE.white,
  stroke: PALETTE.silhouette,
  strokeThickness: 6
};

/**
 * The heads-up display, drawn entirely with code and simple shapes:
 *   top-left   - one hammer per life (glowing = left, dim = lost)
 *   top-center - score
 *   top-right  - level number, in the menu screens' glowing blue
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

    // The hammer textures are painted in BootScene (createHammerTextures).
    this.lifeIcons = Array.from({ length: lives }, (_, i) =>
      scene.add.image(SAFE_MARGIN + 16 + i * LIFE_SPACING, SAFE_MARGIN + 20, 'hammer').setDepth(DEPTH.hud)
    );

    this.scoreText = scene.add
      .text(GAME_WIDTH / 2, SAFE_MARGIN, '', { ...TEXT_STYLE, fontSize: '40px' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.hud);

    // The padding leaves room for the glow (it would be cut off at the
    // text's edges), so the text is placed that much further out.
    this.levelText = scene.add
      .text(GAME_WIDTH - SAFE_MARGIN + GLOW_PADDING, SAFE_MARGIN + 4 - GLOW_PADDING, '', {
        ...TEXT_STYLE,
        fontSize: '28px',
        color: PALETTE.frost,
        padding: { x: GLOW_PADDING, y: GLOW_PADDING }
      })
      .setShadow(0, 0, PALETTE.frostGlow, 14, true, true)
      .setOrigin(1, 0)
      .setDepth(DEPTH.hud);

    this.setLives(lives);
    this.setScore(score);
    this.setLevel(level);
  }

  setLives(lives) {
    this.lifeIcons.forEach((icon, index) => icon.setTexture(index < lives ? 'hammer' : 'hammer-lost'));
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
