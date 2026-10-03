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

/** The MENU button in the top-left corner. */
const MENU_BUTTON = { width: 116, height: 44 };

const TEXT_STYLE = {
  fontFamily: FONT.display,
  fontStyle: '700',
  color: PALETTE.white,
  stroke: PALETTE.silhouette,
  strokeThickness: 6
};

/**
 * The heads-up display, drawn entirely with code and simple shapes:
 *   top-left   - a MENU button, then one hammer per life (glowing = left,
 *                dim = lost)
 *   top-center - score
 *   top-right  - level number, in the menu screens' glowing blue, and a
 *                full-screen button (on iPhone it explains Add to Home Screen)
 * Everything stays SAFE_MARGIN px away from the screen edges, clear of the
 * notches and rounded corners of phones held in landscape.
 */
export class Hud {
  /**
   * @param {Phaser.Scene} scene
   * @param {{lives: number, score: number, level: number}} initial
   * @param {{onMenu: () => void, onFullscreenHelp: () => void}} buttons What the MENU
   *   button does, and the full-screen button where the browser can't go full screen.
   */
  constructor(scene, { lives, score, level }, { onMenu, onFullscreenHelp }) {
    this.scene = scene;

    this.createMenuButton(onMenu);

    // The hammer textures are painted in BootScene (createHammerTextures).
    const firstLifeX = SAFE_MARGIN + MENU_BUTTON.width + 38;
    this.lifeIcons = Array.from({ length: lives }, (_, i) =>
      scene.add.image(firstLifeX + i * LIFE_SPACING, SAFE_MARGIN + 20, 'hammer').setDepth(DEPTH.hud)
    );

    this.scoreText = scene.add
      .text(GAME_WIDTH / 2, SAFE_MARGIN, '', { ...TEXT_STYLE, fontSize: '40px' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.hud);

    // The level sign sits left of the full-screen button, if there is one.
    let levelRight = GAME_WIDTH - SAFE_MARGIN;
    if (fullscreen.offered) {
      this.createFullscreenButton(GAME_WIDTH - SAFE_MARGIN - FULLSCREEN_ICON / 2, SAFE_MARGIN + 20, onFullscreenHelp);
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
   * A MENU pill that leaves the game for the menu without ending it. Like
   * every HUD button, a press on it never starts a stroke (StrokeInput
   * ignores presses on interactive objects).
   */
  createMenuButton(onMenu) {
    const { width, height } = MENU_BUTTON;
    const x = SAFE_MARGIN + width / 2;
    const y = SAFE_MARGIN + 20;

    const frame = this.scene.add.graphics().setPosition(x, y).setDepth(DEPTH.hud);
    frame.fillStyle(COLOR.silhouette, 0.75);
    frame.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    frame.lineStyle(2, COLOR.frost, 0.8);
    frame.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);

    this.scene.add
      .text(x, y, 'MENU', {
        fontFamily: FONT.display,
        fontStyle: '700',
        fontSize: '22px',
        color: PALETTE.frost,
        padding: { x: 10, y: 10 } // room for the glow
      })
      .setShadow(0, 0, PALETTE.frostGlow, 10, false, true)
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    this.scene.add
      .zone(x, y, width + 16, height + 16)
      .setDepth(DEPTH.hud)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onMenu);
  }

  /**
   * Corner brackets that enter or leave full screen. Its tap area is bigger
   * than the icon, for fingers. Where the browser can't go full screen
   * (iPhone), it calls `onHelp` instead.
   */
  createFullscreenButton(x, y, onHelp) {
    const icon = this.scene.add.graphics().setPosition(x, y).setDepth(DEPTH.hud);
    const draw = () => drawFullscreenIcon(icon, fullscreen.active);
    draw();

    this.scene.add
      .zone(x, y, FULLSCREEN_HIT, FULLSCREEN_HIT)
      .setDepth(DEPTH.hud)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => (fullscreen.available ? fullscreen.toggle() : onHelp()));

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
