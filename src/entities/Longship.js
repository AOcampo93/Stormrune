import Phaser from 'phaser';
import { SPRITES, BOAT_ANCHOR } from '../config/sprites.js';
import { SHIP_X, SHIP_ANCHOR_Y, DEPTH } from '../config/layout.js';
import { firstTexture } from '../systems/spriteSheets.js';

// The rocking motion comes from the "Bote idle" design: a 12-frame loop at
// 6 fps (2 s) that tilts the boat around Thor's spot on the deck, bobs it up
// and down and squashes it very slightly. It is played at 1.5x the design's
// amplitude ("amplitud" 1.5), so the storm visibly tosses the boat.
const ROCK_PERIOD_MS = 2000;
const AMPLITUDE = 1.5;
const TILT_DEGREES = 1.2 * AMPLITUDE;
const BOB_DESIGN_UNITS = 9 * AMPLITUDE;
const SQUASH = 0.006 * AMPLITUDE;

/** The boat design's frames per rocking cycle. */
export const DESIGN_FRAMES = 12;

/**
 * The longship, seen from the stern as it faces the draugar.
 *
 * It is a Phaser Container whose origin is the spot on the deck where Thor
 * stands. Everything on board is a child of the container, so the rocking
 * applied to it moves Thor and the water on deck exactly like the boat.
 * The motion is recreated here every frame, which is smoother than the
 * design's 12 separate frames.
 *
 * The design is exported in layers so water can go in between. From the
 * bottom up:
 *   the boat itself,
 *   water on the deck floor        (addToDeck),
 *   the bench nearest Thor, which stands out of that water,
 *   the boat lit by lightning      (lightUp),
 *   waves breaking over the sides  (addOverBoat),
 *   the crew                       (carry).
 */
export class Longship {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.elapsed = 0;
    /** Where the boat is in its rocking cycle, in radians (it keeps growing). */
    this.phase = 0;
    this.container = scene.add.container(SHIP_X, SHIP_ANCHOR_Y).setDepth(DEPTH.ship);
    this.crew = [];

    this.boat = this.addLayer('boat');
    this.bench = this.addLayer('boat-bench');
    this.lightning = this.addLayer('boat-lightning').setAlpha(0);
  }

  /** One of the boat's exported layers, drawn at the boat's scale. */
  addLayer(key) {
    const { originX, originY, scale } = SPRITES[key];
    const layer = this.scene.add
      .image(0, 0, firstTexture(key))
      .setOrigin(originX, originY)
      .setScale(SPRITES.boat.scale / scale);
    this.container.add(layer);
    return layer;
  }

  /** Puts a crew member on the deck, at Thor's spot, above everything else. */
  carry(gameObject) {
    this.crew.push(gameObject);
    this.container.add(gameObject);
  }

  /** Puts something on the deck floor: over the boat, under its benches. */
  addToDeck(gameObject) {
    this.container.addAt(gameObject, this.container.getIndex(this.bench));
  }

  /** Puts something over the whole boat, under the crew. */
  addOverBoat(gameObject) {
    const index = this.crew.length > 0 ? this.container.getIndex(this.crew[0]) : this.container.length;
    this.container.addAt(gameObject, index);
  }

  /** A lightning flash lights the boat up, flickers and fades. */
  lightUp() {
    this.scene.tweens.killTweensOf(this.lightning);
    this.lightning.setAlpha(1);
    this.scene.tweens.chain({
      targets: this.lightning,
      tweens: [
        { alpha: 0.35, duration: 90 },
        { alpha: 0.8, duration: 60 },
        { alpha: 0, duration: 380, ease: 'Quad.easeOut' }
      ]
    });
  }

  /**
   * Where a point of the boat design is on screen right now, rocking
   * included. Design units are those of the "Bote idle" design.
   */
  toWorld(designX, designY) {
    const { x, y, rotation, scaleY } = this.container;
    const localX = (designX - BOAT_ANCHOR[0]) * SPRITES.boat.scale;
    const localY = (designY - BOAT_ANCHOR[1]) * SPRITES.boat.scale * scaleY;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return { x: x + localX * cos - localY * sin, y: y + localX * sin + localY * cos };
  }

  /** A point of the boat design in the container's own space (origin at Thor's spot). */
  toLocal(designX, designY) {
    return {
      x: (designX - BOAT_ANCHOR[0]) * SPRITES.boat.scale,
      y: (designY - BOAT_ANCHOR[1]) * SPRITES.boat.scale
    };
  }

  /** The design frame (0-11) that matches the boat's current pose. */
  get designFrame() {
    return Math.round((this.phase / (Math.PI * 2)) * DESIGN_FRAMES) % DESIGN_FRAMES;
  }

  /** The boat's tilt in degrees, like the design's rotate(). */
  get tiltDegrees() {
    return TILT_DEGREES * Math.sin(this.phase);
  }

  update(delta) {
    this.elapsed += delta;
    this.phase = (this.elapsed / ROCK_PERIOD_MS) * Math.PI * 2;

    // Same order as the design's SVG transform: squash, tilt around the
    // anchor, then bob. A container applies scale, then rotation, then its
    // position, around its own origin, which is the anchor.
    this.container.scaleY = 1 + SQUASH * Math.sin(this.phase + Math.PI / 3);
    this.container.rotation = Phaser.Math.DegToRad(this.tiltDegrees);
    this.container.y = SHIP_ANCHOR_Y + BOB_DESIGN_UNITS * SPRITES.boat.scale * Math.cos(this.phase);
  }
}
