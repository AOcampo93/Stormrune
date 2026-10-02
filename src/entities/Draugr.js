import Phaser from 'phaser';
import { COLOR } from '../config/palette.js';
import { HORIZON_Y, SHIP_LINE_Y, SHIP_X, DEPTH } from '../config/layout.js';
import { fitRuneToBox } from '../systems/runeTemplates.js';

/** Time (ms) a draugr needs to walk from the horizon to the ship at speed 1. */
export const BASE_APPROACH_MS = 14000;

/** Size on the horizon and at the ship; the change in scale fakes depth. */
const FAR_SCALE = 0.25;
const NEAR_SCALE = 1;

/** Fraction of the horizontal gap to the ship a draugr closes on its way. */
const DRIFT_TO_SHIP = 0.25;

/** A frame hitch (or a resume after a pause) never advances more than this. */
const MAX_STEP_MS = 50;

/** Rune queue panel layout, in pixels. Constant size so it is always readable. */
const GLYPH_SIZE = 26;
const GLYPH_GAP = 12;
const PANEL_PADDING = 10;
const PANEL_GAP_ABOVE_HEAD = 14;

/**
 * A draugr: an undead warrior that rises from the waves and wades toward the
 * longship. Above its head floats its rune queue; each matching rune the
 * player draws removes the first rune, and an empty queue destroys it.
 *
 * Depth is faked: as the draugr approaches, it moves down the screen and
 * grows from FAR_SCALE to NEAR_SCALE, and nearer draugar draw on top.
 *
 * This is a plain class that owns two Phaser objects (the body image and the
 * rune panel) rather than a Phaser GameObject subclass. The panel lives on
 * a higher depth layer than every body, so queues stay readable even when
 * draugar overlap. GameScene calls update() every frame.
 */
export class Draugr {
  /**
   * @param {Phaser.Scene} scene
   * @param {{x: number, runeQueue: string[], speed: number}} options
   *   x: spawn position on the horizon, runeQueue: rune ids to defeat it,
   *   speed: the level's speed multiplier.
   */
  constructor(scene, { x, runeQueue, speed }) {
    this.scene = scene;
    this.runeQueue = [...runeQueue];

    this.startX = x;
    this.endX = x + (SHIP_X - x) * DRIFT_TO_SHIP;
    this.approachMs = BASE_APPROACH_MS / speed;

    /** 0 on the horizon, 1 at the ship. */
    this.progress = 0;
    /** Where its feet are on the water, before the cosmetic offsets. */
    this.groundY = HORIZON_Y;
    /** Time alive (ms), drives the wading bob. */
    this.age = 0;
    /** Starts below the surface and tweens to 0: rising out of the waves. */
    this.riseOffset = 60;

    this.body = scene.add.image(x, HORIZON_Y, 'draugr').setOrigin(0.5, 1).setAlpha(0);
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

  /** True once its feet have reached the ship's line. */
  get hasReachedShip() {
    return this.groundY >= SHIP_LINE_Y;
  }

  /** Where lightning should strike: the middle of the body. */
  get hitPoint() {
    return { x: this.body.x, y: this.body.y - this.body.displayHeight * 0.55 };
  }

  /** Advances the walk toward the ship. */
  update(delta) {
    const step = Math.min(delta, MAX_STEP_MS);
    this.progress = Math.min(1, this.progress + step / this.approachMs);
    this.age += step;

    // Things far away seem to crawl and things up close seem to rush, so
    // blend linear motion with a quadratic ease-in to sell the depth.
    const t = 0.5 * this.progress + 0.5 * this.progress * this.progress;

    const scale = Phaser.Math.Linear(FAR_SCALE, NEAR_SCALE, t);
    this.groundY = Phaser.Math.Linear(HORIZON_Y, SHIP_LINE_Y, t);

    // Cosmetic offsets, scaled with the body: the rise out of the water
    // and a gentle bob as it wades through the waves.
    const bob = Math.sin(this.age / 260) * 4 * scale;
    const x = Phaser.Math.Linear(this.startX, this.endX, t);
    const y = this.groundY + (this.riseOffset + bob) * scale;

    this.body.setPosition(x, y).setScale(scale);
    this.body.setDepth(DEPTH.enemies + this.groundY);

    this.panel.setPosition(x, y - this.body.displayHeight - PANEL_GAP_ABOVE_HEAD);
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

  /** Defeated: swell and fade away, then free the objects. */
  die() {
    this.panel.destroy();
    this.scene.tweens.add({
      targets: this.body,
      scale: this.body.scale * 1.25,
      alpha: 0,
      duration: 280,
      ease: 'Quad.easeOut',
      onComplete: () => this.body.destroy()
    });
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
