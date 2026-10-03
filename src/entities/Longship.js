import Phaser from 'phaser';
import { SPRITES } from '../config/sprites.js';
import { SHIP_X, SHIP_ANCHOR_Y, DEPTH } from '../config/layout.js';
import { firstTexture } from '../systems/spriteSheets.js';

// The rocking motion comes straight from the "Bote idle" design: a 12-frame
// loop at 6 fps (2 s) that tilts the boat around Thor's spot on the deck,
// bobs it up and down and squashes it very slightly.
const ROCK_PERIOD_MS = 2000;
const TILT_DEGREES = 1.2;
const BOB_DESIGN_UNITS = 9;
const SQUASH = 0.006;

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
    this.container.add(scene.add.image(0, 0, firstTexture('boat')).setOrigin(originX, originY));
  }

  /** Puts a game object on the deck, at Thor's spot; it rocks with the boat. */
  carry(gameObject) {
    this.container.add(gameObject);
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
