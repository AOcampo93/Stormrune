import Phaser from 'phaser';
import { PALETTE, COLOR, FONT } from '../config/palette.js';
import { GAME_WIDTH, SAFE_MARGIN, DEPTH } from '../config/layout.js';
import { fullscreen } from './fullscreen.js';

/** Horizontal distance between life icons. */
const LIFE_SPACING = 46;

/** Room around the level sign for its glow, in px. */
const GLOW_PADDING = 18;

/** The full-screen button: icon size, and its larger area for fingers. */
const FULLSCREEN_ICON = 30;
const FULLSCREEN_HIT = 56;

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
 *   top-right  - level number, in the menu screens' glowing blue, and a
 *                full-screen button where the browser supports it
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

    // The level sign sits left of the full-screen button, if there is one.
    let levelRight = GAME_WIDTH - SAFE_MARGIN;
    if (fullscreen.available) {
      this.createFullscreenButton(GAME_WIDTH - SAFE_MARGIN - FULLSCREEN_ICON / 2, SAFE_MARGIN + 20);
      levelRight -= FULLSCREEN_ICON + 22;
    }

    // The padding leaves room for the glow (it would be cut off at the
    // text's edges), so the text is placed that much further out.
    this.levelText = scene.add
      .text(levelRight + GLOW_PADDING, SAFE_MARGIN + 4 - GLOW_PADDING, '', {
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

  /**
   * Corner brackets that enter or leave full screen. Its tap area is bigger
   * than the icon, for fingers, and a press there never starts a stroke
   * (StrokeInput ignores presses on interactive objects).
   */
  createFullscreenButton(x, y) {
    const icon = this.scene.add.graphics().setPosition(x, y).setDepth(DEPTH.hud);
    const draw = () => drawFullscreenIcon(icon, fullscreen.active);
    draw();

    this.scene.add
      .zone(x, y, FULLSCREEN_HIT, FULLSCREEN_HIT)
      .setDepth(DEPTH.hud)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => fullscreen.toggle());

    const stopWatching = fullscreen.onChange(draw);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stopWatching);
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

/**
 * Four corner brackets centered on (0, 0): pointing out to enter full
 * screen, pointing in to leave it. A dark outline keeps them visible over
 * the bright sky and lightning.
 */
function drawFullscreenIcon(g, active) {
  const half = FULLSCREEN_ICON / 2;
  const arm = 10;
  g.clear();
  for (const [width, color, alpha] of [[7, COLOR.silhouette, 0.85], [8, COLOR.frostGlow, 0.25], [3.5, COLOR.frost, 1]]) {
    g.lineStyle(width, color, alpha);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      // The bracket's corner: at the icon's corner, or pulled in toward the middle.
      const cx = sx * (active ? half - arm : half);
      const cy = sy * (active ? half - arm : half);
      const toward = active ? 1 : -1; // arms point out from an inner corner, in from an outer one
      g.beginPath();
      g.moveTo(cx + toward * sx * arm, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + toward * sy * arm);
      g.strokePath();
    }
  }
}
