import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, DEPTH } from '../config/layout.js';

/**
 * Where in the rocking cycle (0..1) each side of the stern slaps down into
 * the sea: the boat leans starboard-down a quarter of the way in, and
 * port-down three quarters of the way in.
 */
const SLAP_AT = { starboard: 0.22, port: 0.78 };

/** Not every slap throws spray at the camera. */
const SPLASH_CHANCE = 0.5;

/** Splashes at least this strong (0.5..1) also leave drops on the lens. */
const LENS_DROPS_FROM = 0.7;

/** Lens drops stay below this line, clear of the draugar and their runes. */
const LENS_DROPS_TOP = 530;

/** Lens drops keep at least this far apart (px), center to center. */
const LENS_DROPS_GAP = 50;

const SIDES = ['port', 'starboard'];

/** From the side of the screen toward its middle, along x. */
const INWARD = { port: 1, starboard: -1 };

const WATER_TINTS = [0xf2faff, 0xd6edff, 0xb3daff];
const BLUR_TINTS = [0xcfe8ff, 0xa9d4ff, 0x8fc4f5];

/**
 * Sea spray right in front of the camera. When the stern slaps down into
 * the sea on one side, spray shoots up from that bottom corner of the
 * screen, arcs inward and falls back:
 *   - a haze swells over the corner and slowly clears,
 *   - a mass of water bursts right at the lens: huge blurred drops and a
 *     dense core of droplets,
 *   - big out-of-focus drops, fine droplets and streaks fly up and fall back,
 *   - the stronger splashes leave drops on the lens, which slide down and
 *     dry off.
 */
export class CameraSpray {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('./Longship.js').Longship} longship
   */
  constructor(scene, longship) {
    this.scene = scene;
    this.longship = longship;
    this.lastCycle = 0;
    /** Splashes so far (for "?debug" checks). */
    this.splashes = 0;

    this.corners = {};
    for (const side of SIDES) {
      const inward = INWARD[side];
      this.corners[side] = {
        x: side === 'port' ? 0 : GAME_WIDTH,
        haze: scene.add.image(side === 'port' ? 60 : GAME_WIDTH - 60, GAME_HEIGHT - 40, 'spray-haze').setScale(8).setAlpha(0),
        atLens: scene.add.particles(0, 0, 'spray-blob', atLensConfig(inward)),
        core: scene.add.particles(0, 0, 'spray-droplet', coreConfig(inward)),
        blurred: scene.add.particles(0, 0, 'spray-blob', blurredConfig(inward)),
        streaks: scene.add.particles(0, 0, 'spray-streak', streakConfig(inward)),
        droplets: scene.add.particles(0, 0, 'spray-droplet', dropletConfig(inward))
      };
    }
    this.lensDrops = scene.add.particles(0, 0, 'lens-drop', lensDropConfig());

    for (const corner of Object.values(this.corners)) {
      const { haze, atLens, core, blurred, streaks, droplets } = corner;
      [haze, atLens, core, blurred, streaks, droplets].forEach((o) => o.setDepth(DEPTH.lens));
    }
    this.lensDrops.setDepth(DEPTH.lens);
  }

  update() {
    const cycle = (this.longship.phase / (Math.PI * 2)) % 1;
    for (const [side, at] of Object.entries(SLAP_AT)) {
      if (passed(this.lastCycle, cycle, at) && Math.random() < SPLASH_CHANCE) {
        this.splash(side, Phaser.Math.FloatBetween(0.5, 1));
      }
    }
    this.lastCycle = cycle;
  }

  /** Spray shooting up from one bottom corner; `strength` is 0.5..1. */
  splash(side, strength) {
    this.splashes += 1;
    const corner = this.corners[side];
    // A point this far in from the corner, along the bottom of the screen.
    const inFrom = (min, max) => corner.x + INWARD[side] * Phaser.Math.Between(min, max);
    const below = () => Phaser.Math.Between(GAME_HEIGHT + 10, GAME_HEIGHT + 50);

    this.scene.tweens.killTweensOf(corner.haze);
    this.scene.tweens.chain({
      targets: corner.haze,
      tweens: [
        { alpha: 0.26 * strength, duration: 80 },
        { alpha: 0, duration: 800, ease: 'Quad.easeOut' }
      ]
    });

    for (let i = Phaser.Math.Between(1, 3); i > 0; i--) {
      corner.atLens.emitParticleAt(inFrom(60, 140), Phaser.Math.Between(600, 700), 1);
    }
    for (let i = Math.round(32 * strength); i > 0; i--) {
      corner.core.emitParticleAt(inFrom(0, 130), Phaser.Math.Between(GAME_HEIGHT - 20, GAME_HEIGHT + 30), 1);
    }
    for (let i = Math.round(8 * strength); i > 0; i--) {
      corner.blurred.emitParticleAt(inFrom(-30, 120), below(), 1);
    }
    for (let i = Math.round(30 * strength); i > 0; i--) {
      corner.streaks.emitParticleAt(inFrom(-30, 120), below(), 1);
    }
    for (let i = Math.round(110 * strength); i > 0; i--) {
      corner.droplets.emitParticleAt(inFrom(-30, 120), below(), 1);
    }

    if (strength >= LENS_DROPS_FROM) {
      for (let i = Phaser.Math.Between(2, 5); i > 0; i--) {
        const spot = this.freeLensSpot(() => ({
          x: inFrom(30, 360),
          y: Phaser.Math.Between(LENS_DROPS_TOP, GAME_HEIGHT - 20)
        }));
        if (spot) {
          this.lensDrops.emitParticleAt(spot.x, spot.y, 1);
        }
      }
    }
  }

  /** A spot for a new lens drop that doesn't touch the others, if one turns up. */
  freeLensSpot(randomSpot) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const spot = randomSpot();
      const clear = this.lensDrops.alive.every((drop) => Math.hypot(drop.x - spot.x, drop.y - spot.y) >= LENS_DROPS_GAP);
      if (clear) {
        return spot;
      }
    }
    return null;
  }
}

/** Whether the cycle went past `at` since the last frame (it wraps at 1). */
function passed(previous, now, at) {
  return previous <= now ? previous < at && at <= now : at > previous || at <= now;
}

/** Up and inward from the corner, then gravity brings it back down. */
function flight(inward, speedX, speedY, gravityY) {
  const across = [speedX.min * inward, speedX.max * inward];
  return {
    emitting: false,
    // Spread over a moment, so the burst doesn't start as one bright clump.
    delay: { min: 0, max: 120 },
    speedX: { min: Math.min(...across), max: Math.max(...across) },
    speedY,
    gravityY
  };
}

/** How fast a drop is flying (px/s). */
const speed = (drop) => Math.hypot(drop.velocityX, drop.velocityY);

/** The angle (degrees) that points a texture's top along a drop's flight. */
const alongFlight = (drop) => Phaser.Math.RadToDeg(Math.atan2(drop.velocityY, drop.velocityX)) + 90;

/** The nearest drops, right at the lens: huge, blurred, gone in a moment. */
function atLensConfig(inward) {
  return {
    emitting: false,
    speedX: inward > 0 ? { min: -60, max: 120 } : { min: -120, max: 60 },
    speedY: { min: -120, max: -30 },
    lifespan: { min: 260, max: 420 },
    // Each one gets its own size and swells a little as it passes.
    scale: {
      onEmit: (drop) => (drop.baseScale = Phaser.Math.FloatBetween(2.5, 4.5)),
      onUpdate: (drop, key, t) => drop.baseScale * (1 + 0.15 * t)
    },
    alpha: { start: 0.22, end: 0 },
    tint: BLUR_TINTS
  };
}

/** The dense heart of the splash, right at the corner: short and quick. */
function coreConfig(inward) {
  return {
    ...flight(inward, { min: 20, max: 220 }, { min: -520, max: -200 }, 1600),
    delay: { min: 0, max: 60 },
    lifespan: { min: 250, max: 500 },
    scale: { min: 0.5, max: 1.6 },
    alpha: { start: 0.6, end: 0, ease: 'Quad.easeIn' },
    tint: WATER_TINTS
  };
}

/** Big drops flying past, too close to be in focus. */
function blurredConfig(inward) {
  return {
    ...flight(inward, { min: 40, max: 360 }, { min: -1050, max: -600 }, 1500),
    lifespan: { min: 800, max: 1200 },
    scale: { min: 0.8, max: 2.2 },
    alpha: { start: 0.28, end: 0, ease: 'Quad.easeIn' },
    tint: BLUR_TINTS
  };
}

/**
 * Fast droplets, blurred into streaks along their flight: the faster they
 * go, the longer and brighter they are, so they shrink to dots as they
 * slow down at the top of their arc.
 */
function streakConfig(inward) {
  return {
    ...flight(inward, { min: 60, max: 480 }, { min: -1050, max: -600 }, 1600),
    lifespan: { min: 500, max: 900 },
    rotate: { onEmit: () => 0, onUpdate: alongFlight },
    scaleX: { min: 0.8, max: 1.1 },
    scaleY: { onEmit: () => 0.6, onUpdate: (drop) => Phaser.Math.Clamp(speed(drop) / 1100, 0.2, 0.9) },
    alpha: {
      onEmit: () => 0.9,
      onUpdate: (drop, key, t) => Phaser.Math.Clamp(speed(drop) / 900, 0.15, 0.9) * (1 - t * t)
    },
    tint: WATER_TINTS
  };
}

/**
 * Fine droplets: mostly tiny, a few bigger, some half see-through. Fast
 * ones stretch along their flight; the bigger ones fade sooner.
 */
function dropletConfig(inward) {
  return {
    ...flight(inward, { min: 60, max: 480 }, { min: -1000, max: -500 }, 1600),
    lifespan: { min: 800, max: 1300 },
    rotate: { onEmit: () => 0, onUpdate: alongFlight },
    // Each droplet gets its own size and brightness, then shrinks and fades.
    scaleX: {
      onEmit: (drop) => (drop.baseScale = 0.4 + 1.2 * Math.random() ** 2),
      onUpdate: (drop, key, t) => drop.baseScale * (1 - 0.4 * t)
    },
    scaleY: {
      onEmit: (drop) => drop.baseScale,
      onUpdate: (drop, key, t) => drop.baseScale * (1 - 0.4 * t) * (1 + 0.8 * Math.min(1, speed(drop) / 1000))
    },
    alpha: {
      onEmit: (drop) => (drop.baseAlpha = Phaser.Math.FloatBetween(0.45, 1)),
      onUpdate: (drop, key, t) => drop.baseAlpha * (1 - t ** (drop.baseScale > 1 ? 1 : 2))
    },
    tint: WATER_TINTS
  };
}

/**
 * Drops left on the lens: they land one by one, slide down slowly,
 * stretching a little, and dry off.
 */
function lensDropConfig() {
  return {
    emitting: false,
    delay: { min: 60, max: 250 },
    speedY: { min: 6, max: 24 },
    gravityY: 20,
    lifespan: { min: 1300, max: 2400 },
    scaleX: {
      onEmit: (drop) => {
        drop.tallness = Phaser.Math.FloatBetween(1, 1.2);
        return (drop.baseScale = Phaser.Math.FloatBetween(0.35, 1.1));
      }
    },
    scaleY: {
      onEmit: (drop) => drop.baseScale * drop.tallness,
      onUpdate: (drop, key, t) => drop.baseScale * drop.tallness * (1 + 0.15 * t)
    },
    // Invisible until it lands, a quick fade in, then it dries off.
    alpha: {
      onEmit: () => 0,
      onUpdate: (drop, key, t) => 0.9 * Math.min(1, t / 0.04) * (1 - t ** 3)
    }
  };
}
