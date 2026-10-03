import Phaser from 'phaser';
import { COLOR } from '../config/palette.js';
import { DEPTH } from '../config/layout.js';

/** Only record a new point once the pointer has moved this far (px). */
const MIN_POINT_GAP = 8;

/** Hard cap on the points kept for one stroke. */
const MAX_POINTS = 150;

/** How long a released stroke takes to fade away (ms). */
const FADE_MS = 300;

/**
 * A finger that has drawn less than this (px) is resting rather than
 * drawing, like a thumb on the edge of a phone held in landscape. Another
 * finger that touches down takes the stroke over from it.
 */
const RESTING_PATH = 24;

/**
 * StrokeInput turns pointer input (mouse or touch) into strokes: lists of
 * {x, y} points in game coordinates. While the player draws it renders a
 * glowing trail. When the pointer lifts, it hands the finished stroke to a
 * callback (the scene runs the rune recognizer on it) and fades the trail out.
 *
 * Phaser reports mouse and touch through the same pointer events, so one code
 * path serves desktop and mobile.
 */
export class StrokeInput {
  /**
   * @param {Phaser.Scene} scene The scene to capture input in.
   * @param {(points: {x: number, y: number}[]) => void} onStroke Called with every finished stroke.
   */
  constructor(scene, onStroke) {
    this.scene = scene;
    this.onStroke = onStroke;
    this.enabled = true;

    /** The pointer currently drawing, or null. Only one stroke at a time. */
    this.pointer = null;

    /** Points of the stroke being drawn right now. */
    this.points = [];

    /** Released strokes that are still fading out: { points, alpha }. */
    this.fading = [];

    // A single Graphics object draws every visible stroke. A Phaser 4 glow
    // filter on a Graphics object renders through a full-screen buffer, so we
    // keep exactly one and hide it whenever there is nothing to draw.
    this.trail = scene.add.graphics().setDepth(DEPTH.trail).setVisible(false);

    // Filters only exist under WebGL; with the Canvas renderer `filters` stays
    // null and the layered lines in drawStroke() still read as a glow.
    this.trail.enableFilters();
    this.trail.filters?.internal.addGlow(COLOR.glow, 3, 0, 1, false, 10, 10);

    const input = scene.input;
    input.on(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
    // A release over the canvas fires POINTER_UP, a release anywhere else
    // fires POINTER_UP_OUTSIDE (never both), so a stroke must end on either.
    input.on(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handleUp, this);

    // A stroke interrupted by a pause, or by the page losing focus, could
    // otherwise miss its release event. Drop it instead of recognizing it.
    scene.events.on(Phaser.Scenes.Events.PAUSE, this.cancel, this);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.cancel, this);
    scene.game.events.on(Phaser.Core.Events.HIDDEN, this.cancel, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Turns stroke capture on or off (e.g. off once the game is over). */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.cancel();
    }
  }

  /**
   * @param {Phaser.Input.Pointer} pointer
   * @param {Phaser.GameObjects.GameObject[]} over Interactive objects under it (buttons).
   */
  handleDown(pointer, over) {
    // A press on a button (such as the full-screen toggle) is not a stroke.
    if (!this.enabled || over.length > 0) {
      return;
    }

    if (this.pointer) {
      // Another finger is really drawing: ignore this one.
      if (this.pointer !== pointer && this.pointer.isDown && this.pathLength() >= RESTING_PATH) {
        return;
      }
      // Otherwise the first finger is only resting on the screen, or we
      // never heard its stroke end (the system cancelled the touch). Throw
      // that stroke away and start over with this finger.
      this.cancel();
    }

    this.pointer = pointer;
    this.points = [{ x: pointer.x, y: pointer.y }];
    this.redraw();
  }

  handleMove(pointer) {
    if (pointer !== this.pointer || this.points.length >= MAX_POINTS) {
      return;
    }

    // Skipping tiny movements keeps strokes light; the recognizer resamples
    // every stroke to a fixed number of evenly spaced points anyway.
    const last = this.points[this.points.length - 1];
    if (Math.hypot(pointer.x - last.x, pointer.y - last.y) > MIN_POINT_GAP) {
      this.points.push({ x: pointer.x, y: pointer.y });
      this.redraw();
    }
  }

  handleUp(pointer) {
    if (pointer !== this.pointer) {
      return;
    }

    // Always keep the release position, even if it is closer than the
    // minimum gap, so a quick flick does not lose its final segment.
    const last = this.points[this.points.length - 1];
    if (this.points.length < MAX_POINTS && (pointer.x !== last.x || pointer.y !== last.y)) {
      this.points.push({ x: pointer.x, y: pointer.y });
    }

    const stroke = this.points;
    this.pointer = null;
    this.points = [];
    this.fadeOut(stroke);
    this.onStroke(stroke);
  }

  /** How far the stroke in progress has traveled so far (px). */
  pathLength() {
    let length = 0;
    for (let i = 1; i < this.points.length; i++) {
      length += Math.hypot(this.points[i].x - this.points[i - 1].x, this.points[i].y - this.points[i - 1].y);
    }
    return length;
  }

  /** Abandons the stroke in progress (if any) without recognizing it. */
  cancel() {
    if (!this.pointer) {
      return;
    }

    const stroke = this.points;
    this.pointer = null;
    this.points = [];
    this.fadeOut(stroke);
  }

  /** Keeps a released stroke on screen briefly while its alpha tweens to 0. */
  fadeOut(points) {
    const stroke = { points, alpha: 1 };
    this.fading.push(stroke);

    this.scene.tweens.add({
      targets: stroke,
      alpha: 0,
      duration: FADE_MS,
      ease: 'Quad.easeIn',
      onUpdate: () => this.redraw(),
      onComplete: () => {
        this.fading = this.fading.filter((s) => s !== stroke);
        this.redraw();
      }
    });
  }

  /** Clears the trail and draws the fading strokes plus the live one. */
  redraw() {
    this.trail.clear();

    for (const stroke of this.fading) {
      this.drawStroke(stroke.points, stroke.alpha);
    }
    if (this.pointer) {
      this.drawStroke(this.points, 1);
    }

    // Nothing to show means no draw call and no glow pass at all.
    this.trail.setVisible(this.pointer !== null || this.fading.length > 0);
  }

  /** One stroke as three layered lines: a soft halo, a cyan body, a white core. */
  drawStroke(points, alpha) {
    const g = this.trail;

    if (points.length < 2) {
      // A stroke that has not moved yet is shown as a small spark.
      g.fillStyle(COLOR.white, alpha);
      g.fillCircle(points[0].x, points[0].y, 4);
      return;
    }

    g.lineStyle(16, COLOR.glow, 0.15 * alpha);
    g.strokePoints(points);
    g.lineStyle(7, COLOR.glow, 0.8 * alpha);
    g.strokePoints(points);
    g.lineStyle(2.5, COLOR.white, alpha);
    g.strokePoints(points);
  }

  /** Detaches every listener. Runs automatically when the scene shuts down. */
  destroy() {
    const input = this.scene.input;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handleUp, this);

    this.scene.events.off(Phaser.Scenes.Events.PAUSE, this.cancel, this);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.cancel, this);
    this.scene.game.events.off(Phaser.Core.Events.HIDDEN, this.cancel, this);
  }
}
