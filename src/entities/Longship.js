import Phaser from 'phaser';
import { SPRITES, BOAT_ANCHOR } from '../config/sprites.js';
import { SHIP_X, SHIP_ANCHOR_Y, DEPTH } from '../config/layout.js';
import { firstTexture } from '../systems/spriteSheets.js';

// The rocking motion comes from the "Bote idle" design: a 12-frame loop at
// 6 fps (2 s) that tilts the boat around Thor's spot on the deck, bobs it up
// and down and squashes it very slightly. It is played at 1.5x the design's
// amplitude ("amplitud" 1.5), enough for the gunwales to dip into the waves.
const ROCK_PERIOD_MS = 2000;
const AMPLITUDE = 1.5;
const TILT_DEGREES = 1.2 * AMPLITUDE;
const BOB_DESIGN_UNITS = 9 * AMPLITUDE;
const SQUASH = 0.006 * AMPLITUDE;

/**
 * The longship, seen from the stern as it faces the draugar.
 *
 * It is a Phaser Container whose origin is the spot on the deck where Thor
 * stands. The boat image and Thor are both children of the container, so the
 * rocking applied to the container moves Thor exactly like the deck under his
 * feet. The boat is a single still image; the motion is recreated here every
 * frame, which is smoother than the design's 12 separate frames.
 */
export class Longship {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.elapsed = 0;
    this.container = scene.add.container(SHIP_X, SHIP_ANCHOR_Y).setDepth(DEPTH.ship);

    const { originX, originY } = SPRITES.boat;
    this.boat = scene.add.image(0, 0, firstTexture('boat')).setOrigin(originX, originY);
    this.container.add(this.boat);
  }

  /** Puts a game object on the deck, at Thor's spot; it rocks with the boat. */
  carry(gameObject) {
    this.container.add(gameObject);
  }

  /** Puts a game object on the deck surface itself: over the boat, under the crew. */
  addToDeck(gameObject) {
    this.container.addAt(gameObject, 1);
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

  /** Where a point of the boat design is on screen when the boat is at rest. */
  toWorldAtRest(designX, designY) {
    return {
      x: SHIP_X + (designX - BOAT_ANCHOR[0]) * SPRITES.boat.scale,
      y: SHIP_ANCHOR_Y + (designY - BOAT_ANCHOR[1]) * SPRITES.boat.scale
    };
  }

  update(delta) {
    this.elapsed += delta;
    const phase = (this.elapsed / ROCK_PERIOD_MS) * Math.PI * 2;

    // Same order as the design's SVG transform: squash, tilt around the
    // anchor, then bob. A container applies scale, then rotation, then its
    // position, around its own origin, which is the anchor.
    this.container.scaleY = 1 + SQUASH * Math.sin(phase + Math.PI / 3);
    this.container.rotation = Phaser.Math.DegToRad(TILT_DEGREES * Math.sin(phase));
    this.container.y = SHIP_ANCHOR_Y + BOB_DESIGN_UNITS * SPRITES.boat.scale * Math.cos(phase);
  }
}
