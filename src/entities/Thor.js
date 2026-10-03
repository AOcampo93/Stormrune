import Phaser from 'phaser';
import { SPRITES } from '../config/sprites.js';
import { sheetFrames, firstTexture } from '../systems/spriteSheets.js';

/**
 * Thor's animations. Each rune has its own attack:
 *   Isa    (│) -> raising the hammer
 *   Sowilo (Z) -> two-handed invocation, lightning all around him
 *   Tiwaz  (^) -> leap and spin
 * The attack sheets start just before the strike (see the frame ranges in
 * scripts/export-sprites.mjs) and play fast, so Thor's lightning flares at
 * about the same moment as the bolts that hit the draugar.
 */
const ANIMATIONS = {
  idle: { sheet: 'thor-idle', frameRate: 8, repeat: -1 },
  isa: { sheet: 'thor-raise', frameRate: 16 },
  sowilo: { sheet: 'thor-atk2', frameRate: 16 },
  tiwaz: { sheet: 'thor-atk3', frameRate: 16 },
  hurt: { sheet: 'thor-hurt', frameRate: 12 },
  death: { sheet: 'thor-death', frameRate: 8 }
};

const animationKey = (name) => `thor:${name}`;

/**
 * Thor, the hero on the longship's deck. A small state machine on top of a
 * Phaser Sprite: idle by default, an attack whenever a rune is cast, a
 * stagger when a draugr boards, and a final fall when the game is lost.
 *
 * The sprite is placed inside the Longship's container, so it rocks with the
 * boat without any extra code here.
 */
export class Thor {
  /**
   * Registers the animations with Phaser's global animation manager.
   * Called once, after the sprite sheets have loaded (BootScene).
   */
  static createAnimations(anims) {
    for (const [name, { sheet, frameRate, repeat = 0 }] of Object.entries(ANIMATIONS)) {
      if (!anims.exists(animationKey(name))) {
        anims.create({
          key: animationKey(name),
          frames: sheetFrames(anims, sheet),
          frameRate,
          repeat
        });
      }
    }
  }

  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.isDead = false;
    this.current = null;
    this.onDeathComplete = null;

    this.sprite = scene.add.sprite(0, 0, firstTexture(ANIMATIONS.idle.sheet));
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.handleComplete, this);
    this.play('idle');
  }

  /** Strikes with the attack that belongs to this rune. */
  attack(runeId) {
    if (!this.isDead) {
      this.play(runeId);
    }
  }

  /** Staggers after a draugr boards the ship. */
  hurt() {
    if (!this.isDead) {
      this.play('hurt');
    }
  }

  /** Falls for good; `onComplete` runs when the animation ends. */
  die(onComplete) {
    this.isDead = true;
    this.onDeathComplete = onComplete;
    this.play('death');
  }

  play(name) {
    // Every sheet is cropped differently, so each one carries its own anchor
    // (Thor's feet). Setting the origin first keeps the feet in place when
    // the new animation swaps in a frame of a different size.
    const { originX, originY } = SPRITES[ANIMATIONS[name].sheet];
    this.sprite.setOrigin(originX, originY);
    this.sprite.play(animationKey(name));
    this.current = name;
  }

  /** Fired only when an animation finishes on its own (not when replaced). */
  handleComplete(animation) {
    if (animation.key === animationKey('death')) {
      this.onDeathComplete?.();
    } else if (!this.isDead) {
      this.play('idle');
    }
  }
}
