import Phaser from 'phaser';
import { COLOR } from '../config/palette.js';
import { HORIZON_Y, SHIP_ANCHOR_Y, DEPTH } from '../config/layout.js';
import { SPRITES } from '../config/sprites.js';
import { fitRuneToBox } from '../systems/runeTemplates.js';
import { sheetFrames, firstTexture } from '../systems/spriteSheets.js';

/** Time (ms) a draugr needs to walk from the horizon to the ship at speed 1. */
export const BASE_APPROACH_MS = 14000;

/** Never smaller than this, so a draugr rising on the horizon is still visible. */
const MIN_SCALE = 0.1;

/** Lightning aims at the chest: this far above the waterline, in design units. */
const CHEST_HEIGHT = 220;

/** A frame hitch (or a resume after a pause) never advances more than this. */
const MAX_STEP_MS = 50;

/** Rune queue panel layout, in pixels. Constant size so it is always readable. */
const GLYPH_SIZE = 26;
const GLYPH_GAP = 12;
const PANEL_PADDING = 10;
const PANEL_GAP_ABOVE_HEAD = 14;

/**
 * A draugr: an undead warrior that rises from the waves and wades, waist-deep,
 * toward the longship. Above its head floats its rune queue; each matching
 * rune the player draws removes the first rune, and an empty queue destroys
 * it (it is struck, burns and crumbles into the sea).
 *
 * Depth is faked: the lower on the screen a draugr is, the nearer it is, so
 * its size follows its height on screen (scaleAt) and nearer draugar draw on
 * top. It walks in a straight line from the horizon to the point on the
 * hull's edge where it climbs aboard. The sprite is anchored at its
 * waterline, which is the point that walks along the sea's surface.
 *
 * This is a plain class that owns two Phaser objects (the body sprite and the
 * rune panel) rather than a Phaser GameObject subclass. The panel lives on
 * a higher depth layer than every body, so queues stay readable even when
 * draugar overlap. GameScene calls update() every frame.
 */
export class Draugr {
  /**
   * Registers the walk and death animations with Phaser's global animation
   * manager. Called once, after the sprite sheets have loaded (BootScene).
   */
  static createAnimations(anims) {
    if (!anims.exists('draugr:walk')) {
      anims.create({ key: 'draugr:walk', frames: sheetFrames(anims, 'draugr-walk'), frameRate: 8, repeat: -1 });
      anims.create({ key: 'draugr:death', frames: sheetFrames(anims, 'draugr-death'), frameRate: 10 });
    }
  }

  /**
   * @param {Phaser.Scene} scene
   * @param {{startX: number, board: {x: number, y: number}, runeQueue: string[], speed: number}} options
   *   startX: spawn position on the horizon, board: where it climbs aboard,
   *   runeQueue: rune ids to defeat it, speed: the level's speed multiplier.
   */
  constructor(scene, { startX, board, runeQueue, speed }) {
    this.scene = scene;
    this.runeQueue = [...runeQueue];

    this.startX = startX;
    this.board = board;
    this.approachMs = BASE_APPROACH_MS / speed;

    /** 0 on the horizon, 1 at the ship. */
    this.progress = 0;
    /** Where its waterline is on the sea, before the cosmetic offsets. */
    this.groundY = HORIZON_Y;
    /** Time alive (ms), drives the wading bob. */
    this.age = 0;
    /** Starts below the surface and tweens to 0: rising out of the waves. */
    this.riseOffset = 60;

    const walk = SPRITES['draugr-walk'];
    this.body = scene.add.sprite(startX, HORIZON_Y, firstTexture('draugr-walk'));
    this.body.setOrigin(walk.originX, walk.originY).setAlpha(0);
    // Start each one somewhere in its stride, so a crowd doesn't move in step.
    this.body.play({ key: 'draugr:walk', startFrame: Phaser.Math.Between(0, walk.frames - 1) });
    this.panel = scene.add.graphics();
    this.drawPanel();

    // Only offsets and alpha are tweened; update() stays the one place that
    // positions the body, so the tween and the walk never fight each other.
    scene.tweens.add({ targets: this, riseOffset: 0, duration: 800, ease: 'Quad.easeOut' });
    scene.tweens.add({ targets: this.body, alpha: 1, duration: 500 });

    this.update(0);
  }

  /** The rune that has to be drawn next to hurt this draugr. */
  get nextRune() {
    return this.runeQueue[0];
  }

  /** True once it has reached the hull and climbs aboard. */
  get hasReachedShip() {
    return this.progress >= 1;
  }

  /** Where lightning should strike: the chest. */
  get hitPoint() {
    return { x: this.body.x, y: this.body.y - CHEST_HEIGHT * SPRITES['draugr-walk'].scale * this.body.scaleY };
  }

  /** Advances the walk toward the ship. */
  update(delta) {
    const step = Math.min(delta, MAX_STEP_MS);
    this.progress = Math.min(1, this.progress + step / this.approachMs);
    this.age += step;

    // Things far away seem to crawl and things up close seem to rush, so
    // blend linear motion with a quadratic ease-in to sell the depth.
    const t = 0.5 * this.progress + 0.5 * this.progress * this.progress;

    this.groundY = Phaser.Math.Linear(HORIZON_Y, this.board.y, t);
    const x = Phaser.Math.Linear(this.startX, this.board.x, t);
    const scale = scaleAt(this.groundY);

    // Cosmetic offsets, scaled with the body: the rise out of the water
    // and a gentle bob on the swell (the walk animation does the rest).
    const bob = Math.sin(this.age / 260) * 2 * scale;
    const y = this.groundY + (this.riseOffset + bob) * scale;

    this.body.setPosition(x, y).setScale(scale);
    this.body.setDepth(DEPTH.enemies + this.groundY);

    // The panel floats just above the top of the sprite (its raised claws).
    const top = y - this.body.originY * this.body.displayHeight;
    this.panel.setPosition(x, top - PANEL_GAP_ABOVE_HEAD);
    this.panel.setDepth(DEPTH.runePanels + this.groundY * 0.1);
  }

  /**
   * Removes the first rune of the queue.
   * @returns {boolean} True if that was the last rune (the draugr is defeated).
   */
  removeFirstRune() {
    this.runeQueue.shift();
    this.drawPanel();
    return this.runeQueue.length === 0;
  }

  /** A short white flash when lightning hits. */
  flash() {
    this.body.setTint(COLOR.white).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(90, () => {
      if (this.body.active) {
        this.body.clearTint();
      }
    });
  }

  /** Defeated: struck, it burns, crumbles and sinks; then the sprite is freed. */
  die() {
    this.panel.destroy();
    // The death sheet is cropped differently: re-anchor at the waterline first.
    const death = SPRITES['draugr-death'];
    this.body.setOrigin(death.originX, death.originY);
    this.body.play('draugr:death');
    this.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.body.destroy());
  }

  /** Removes the draugr immediately (e.g. when it boards the ship). */
  destroy() {
    this.panel.destroy();
    this.body.destroy();
  }

  /**
   * Draws the rune queue as glyphs in a rounded panel. The panel's origin is
   * its bottom center, so update() can simply place it above the head.
   * Only called when the queue changes, not every frame.
   */
  drawPanel() {
    const g = this.panel;
    g.clear();

    const count = this.runeQueue.length;
    if (count === 0) {
      return;
    }

    const width = count * GLYPH_SIZE + (count - 1) * GLYPH_GAP + PANEL_PADDING * 2;
    const height = GLYPH_SIZE + PANEL_PADDING * 2;

    g.fillStyle(COLOR.silhouette, 0.8);
    g.fillRoundedRect(-width / 2, -height, width, height, 10);
    g.lineStyle(2, COLOR.glow, 0.5);
    g.strokeRoundedRect(-width / 2, -height, width, height, 10);

    this.runeQueue.forEach((rune, index) => {
      const centerX = -width / 2 + PANEL_PADDING + GLYPH_SIZE / 2 + index * (GLYPH_SIZE + GLYPH_GAP);
      const centerY = -height / 2;
      const points = fitRuneToBox(rune, GLYPH_SIZE).map((p) => ({ x: centerX + p.x, y: centerY + p.y }));

      if (index === 0) {
        // The rune to draw next glows; the rest wait, dimmed.
        g.lineStyle(9, COLOR.glow, 0.25);
        g.strokePoints(points);
        g.lineStyle(4, COLOR.glow, 1);
      } else {
        g.lineStyle(3, COLOR.white, 0.45);
      }
      g.strokePoints(points);
    });
  }
}

/**
 * Perspective: on a flat sea, something twice as far away sits half as far
 * below the horizon and looks half as big. So a draugr's size is simply its
 * distance below the horizon, relative to Thor's (whose sprites share the
 * same design scale): level with Thor's feet, a draugr is Thor's size.
 */
function scaleAt(y) {
  return Math.max(MIN_SCALE, (y - HORIZON_Y) / (SHIP_ANCHOR_Y - HORIZON_Y));
}
