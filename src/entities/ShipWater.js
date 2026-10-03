import Phaser from 'phaser';
import { HULL, DEPTH } from '../config/layout.js';
import { SPRITES } from '../config/sprites.js';
import { firstTexture, sheetFrames } from '../systems/spriteSheets.js';
import { DESIGN_FRAMES } from './Longship.js';

/** Random small splashes against the hull, every this many ms. */
const HULL_SPLASH_MS = { min: 220, max: 600 };

/** From the hull toward the middle of the deck, along x. */
const INWARD = { port: 1, starboard: -1 };

/**
 * Waves breaking over the gunwales, from the "Bote idle" design. In every
 * rocking cycle one breaks over the port side, then one over the bow (on
 * both sides at once), then one over starboard. `y` is where it hits the
 * gunwale (design units) and `strength` how hard it breaks in each of the
 * design's 12 frames.
 */
const BREAKING_WAVES = [
  { side: 'port', y: 1240, strength: [0, 0.45, 1, 0.75, 0.4, 0, 0, 0, 0, 0, 0, 0] },
  { side: 'port', y: 980, strength: [0, 0, 0, 0, 0.4, 0.8, 0.48, 0, 0, 0, 0, 0] },
  { side: 'starboard', y: 980, strength: [0, 0, 0, 0, 0.4, 0.8, 0.48, 0, 0, 0, 0, 0] },
  { side: 'starboard', y: 1420, strength: [0, 0, 0, 0, 0, 0, 0, 0.45, 1, 0.75, 0.4, 0] }
];

/** Drops thrown into the boat per second by a wave breaking at full strength. */
const DROPS_PER_SECOND = 150;

/** Gravity pulling the drops back down (px/s²). */
const DROP_GRAVITY = 1300;

/**
 * The pool of sea water on the deck, from the design (design units): its
 * surface sits around POOL_LEVEL, bobs with the rocking and tilts the other
 * way from the boat, so the water sloshes from side to side.
 */
const POOL_LEVEL = 1560;
const POOL_BOB = 14;
const POOL_SLOSH = 9;
const POOL_TOP = { color: 0x1d3a56, alpha: 0.75 };
const POOL_BOTTOM = { color: 0x081627, alpha: 0.9 };

const lerp = (a, b, t) => a + (b - a) * t;
const along = ([[x0, y0], [x1, y1]], u) => [lerp(x0, x1, u), lerp(y0, y1, u)];
/** How far along a hull line (0 at the bow) a design y is. */
const uAt = ([[, y0], [, y1]], y) => (y - y0) / (y1 - y0);
/** The x of a hull line at a design y. */
const xAt = (line, y) => along(line, uAt(line, y))[0];

/** A color between two others, like a gradient stop. */
function mix(from, to, t) {
  const channel = (shift) => Math.round(lerp((from >> shift) & 0xff, (to >> shift) & 0xff, t));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

// The deck is a triangle between the two deck edges: its apex at the bow,
// widening by DECK_SPREAD design units on each side per unit down.
const [[DECK_X, DECK_APEX_Y], [DECK_LEFT_X, DECK_BOTTOM_Y]] = HULL.deckEdge.port;
const DECK_SPREAD = (DECK_X - DECK_LEFT_X) / (DECK_BOTTOM_Y - DECK_APEX_Y);
const onDeck = (x, y) => y >= DECK_APEX_Y && Math.abs(x - DECK_X) <= (y - DECK_APEX_Y) * DECK_SPREAD;

/**
 * The sea washing over and against the longship, drawn with the boat
 * design's own wave frames and with code.
 *
 * - Breaking waves: three times per rocking cycle (port side, bow,
 *   starboard) a wave breaks over the gunwale. The design's frames show the
 *   sheet of water and its mist, and drops fly into the boat as particles.
 * - Water on the deck: a pool sloshing around Thor's feet.
 * - Small splashes keep bursting where the hull meets the sea.
 */
export class ShipWater {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('./Longship.js').Longship} longship
   */
  constructor(scene, longship) {
    this.longship = longship;
    this.elapsed = 0;
    this.nextHullSplash = 0;
    /** Waves that have broken over the gunwales so far (for "?debug" checks). */
    this.wavesAboard = 0;

    // Water on the deck is part of the boat, so it rocks with it.
    this.deckWater = scene.add.graphics();
    longship.addToDeck(this.deckWater);

    // The design's breaking waves, one frame per design frame.
    const { originX, originY } = SPRITES['boat-waves'];
    this.waveFrames = sheetFrames(scene.anims, 'boat-waves');
    this.waveSprite = scene.add.sprite(0, 0, firstTexture('boat-waves')).setOrigin(originX, originY);
    longship.addOverBoat(this.waveSprite);
    this.shownFrame = -1;

    // Each wave throws its drops from its own emitter, aimed into the boat.
    this.waves = BREAKING_WAVES.map((wave) => {
      const drops = scene.add.particles(0, 0, 'spark', dropConfig(wave, SPRITES.boat.scale));
      longship.addOverBoat(drops);
      return {
        ...wave,
        drops,
        size: designSize(wave),
        gunwaleX: xAt(HULL.gunwale[wave.side], wave.y),
        pendingDrops: 0
      };
    });

    // Droplets bursting straight up against the hull.
    this.hullSpray = scene.add.particles(0, 0, 'spark', {
      emitting: false,
      speed: { min: 90, max: 230 },
      angle: { min: -115, max: -65 },
      lifespan: { min: 450, max: 900 },
      gravityY: 950,
      scale: { start: 0.9, end: 0.3 },
      alpha: { start: 0.95, end: 0 },
      tint: [0xffffff, 0xd9f2ff, 0xa8dcff]
    });
    // A soft cloud of mist with some of them.
    this.mist = scene.add.particles(0, 0, 'puff', {
      emitting: false,
      speed: { min: 20, max: 80 },
      angle: { min: -130, max: -50 },
      lifespan: { min: 600, max: 1100 },
      scale: { start: 1.2, end: 3.2 },
      alpha: { start: 0.45, end: 0 },
      tint: 0xdff3ff
    });
    this.hullSpray.setDepth(DEPTH.shipWater);
    this.mist.setDepth(DEPTH.shipWater);
  }

  update(delta) {
    this.elapsed += delta;
    this.breakWaves();
    this.throwDrops(delta);
    this.splashAgainstHull();

    this.drawPool();
  }

  /** Shows the design's breaking waves for the boat's current pose. */
  breakWaves() {
    const frame = this.longship.designFrame;
    if (frame === this.shownFrame) {
      return;
    }
    this.shownFrame = frame;
    const { key, frame: index } = this.waveFrames[frame];
    this.waveSprite.setTexture(key, index);

    const previous = (frame + DESIGN_FRAMES - 1) % DESIGN_FRAMES;
    this.wavesAboard += this.waves.filter((wave) => wave.strength[frame] > 0 && wave.strength[previous] === 0).length;
  }

  /**
   * While a wave's frames are showing, its drops keep flying into the boat,
   * more the harder it breaks. They leave from anywhere along the top of the
   * hull where it hits, mostly just outside it, like the design's sheet of
   * water.
   */
  throwDrops(delta) {
    const frame = this.longship.designFrame;
    for (const wave of this.waves) {
      wave.pendingDrops += (DROPS_PER_SECOND * wave.strength[frame] * delta) / 1000;
      for (; wave.pendingDrops >= 1; wave.pendingDrops -= 1) {
        const across = Phaser.Math.FloatBetween(-60, 10) * wave.size; // design units, + is inward
        const point = this.longship.toLocal(
          wave.gunwaleX + INWARD[wave.side] * across,
          wave.y + Phaser.Math.FloatBetween(-10, 10) * wave.size
        );
        wave.drops.emitParticleAt(point.x, point.y, 1);
      }
    }
  }

  /** Small splashes bursting up against the hull every so often. */
  splashAgainstHull() {
    if (this.elapsed < this.nextHullSplash) {
      return;
    }
    this.nextHullSplash = this.elapsed + HULL_SPLASH_MS.min + Math.random() * (HULL_SPLASH_MS.max - HULL_SPLASH_MS.min);

    // Somewhere on screen along the hull's outer edge, where it meets the sea.
    const side = Math.random() < 0.5 ? 'port' : 'starboard';
    const u = 0.3 + Math.random() * 0.42;
    const { x, y } = this.longship.toWorld(...along(HULL.hullBottom[side], u));
    this.hullSpray.explode(4 + Math.floor(Math.random() * 6), x, y);
    if (Math.random() < 0.4) {
      this.mist.explode(1, x, y);
    }
  }

  /**
   * The pool on the deck, from the design: dark water filling the deck from
   * its surface down, a rough bright edge, glints and spreading ripples.
   * Everything is in design units, turned into the container's space.
   */
  drawPool() {
    const g = this.deckWater;
    g.clear();
    const local = (x, y) => this.longship.toLocal(x, y);
    const phase = this.longship.phase;
    const level = POOL_LEVEL - POOL_BOB * Math.sin(phase + 0.6);
    const slope = Math.tan(Phaser.Math.DegToRad(-this.longship.tiltDegrees * POOL_SLOSH)) * 0.6;
    const surface = (x) => level + (x - DECK_X) * slope + 6 * Math.sin(x * 0.012 + phase * 2);

    // The water's surface across the deck; where it is higher than the
    // deck's edge, the pool reaches that edge.
    const steps = 48;
    const left = DECK_LEFT_X;
    const width = 2 * (DECK_X - DECK_LEFT_X);
    const columns = Array.from({ length: steps + 1 }, (_, i) => {
      const x = left + (width * i) / steps;
      const deckEdgeY = DECK_APEX_Y + Math.abs(x - DECK_X) / DECK_SPREAD;
      return { x, y: Math.max(surface(x), deckEdgeY), wet: surface(x) >= deckEdgeY };
    });

    // The body, with the design's gradient from its surface to the deck's end.
    const top = Math.min(...columns.map((c) => surface(c.x)));
    const shade = (y) => {
      const t = Phaser.Math.Clamp((y - top) / (DECK_BOTTOM_Y - top), 0, 1);
      return { color: mix(POOL_TOP.color, POOL_BOTTOM.color, t), alpha: lerp(POOL_TOP.alpha, POOL_BOTTOM.alpha, t) };
    };
    const bottom = shade(DECK_BOTTOM_Y);
    for (let i = 0; i < steps; i++) {
      const c0 = columns[i];
      const c1 = columns[i + 1];
      if (c0.y >= DECK_BOTTOM_Y && c1.y >= DECK_BOTTOM_Y) {
        continue;
      }
      const s0 = shade(c0.y);
      const s1 = shade(c1.y);
      const a0 = local(c0.x, c0.y);
      const a1 = local(c1.x, c1.y);
      const b0 = local(c0.x, DECK_BOTTOM_Y);
      const b1 = local(c1.x, DECK_BOTTOM_Y);
      g.fillGradientStyle(s0.color, s1.color, bottom.color, bottom.color, s0.alpha, s1.alpha, bottom.alpha, bottom.alpha);
      g.fillTriangle(a0.x, a0.y, a1.x, a1.y, b0.x, b0.y);
      g.fillGradientStyle(bottom.color, bottom.color, s1.color, s1.color, bottom.alpha, bottom.alpha, s1.alpha, s1.alpha);
      g.fillTriangle(b1.x, b1.y, b0.x, b0.y, a1.x, a1.y);
    }

    // Glints drifting across the water below the surface.
    g.lineStyle(1, 0x4c6c97, 0.45);
    for (let j = 0; j < 7; j++) {
      const y = level + 60 + j * 60 + 10 * Math.sin(phase + j);
      const halfWidth = 120 + j * 40;
      const x = DECK_X + 220 * Math.sin(j * 2.1 + phase);
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(x - halfWidth, y),
        new Phaser.Math.Vector2(x, y - 6),
        new Phaser.Math.Vector2(x + halfWidth, y + 2)
      );
      this.strokeWet(curve.getPoints(10), surface, local);
    }

    // Rings spreading out on the water, fading as they grow.
    for (let j = 0; j < 3; j++) {
      const grow = (phase / (Math.PI * 2) + j / 3) % 1;
      const radius = 40 + grow * 160;
      const center = local(DECK_X + (j - 1) * 260, level + 200 + j * 90);
      g.lineStyle(1, 0x5f7da7, 0.4 * (1 - grow));
      g.strokeEllipse(center.x, center.y, 2 * radius * SPRITES.boat.scale, 0.5 * radius * SPRITES.boat.scale);
    }

    // The bright, ragged edge where the surface meets the deck.
    const edge = columns.filter((c) => c.wet).map((c) => ({ x: c.x, y: c.y + 4 * Math.sin(c.x * 0.21) + 3 * Math.sin(c.x * 0.53 + 1) }));
    g.lineStyle(1.3, 0x7c96ba, 0.55);
    g.strokePoints(edge.map((p) => local(p.x, p.y)));
  }

  /** Strokes the parts of a line (design units) that lie in the pool. */
  strokeWet(points, surface, local) {
    let run = [];
    for (const point of [...points, null]) {
      if (point && onDeck(point.x, point.y) && point.y > surface(point.x)) {
        run.push(local(point.x, point.y));
      } else {
        if (run.length > 1) this.deckWater.strokePoints(run);
        run = [];
      }
    }
  }
}

/**
 * How big the design draws a wave breaking at this point of the hull:
 * nearer the stern (larger y) is nearer the viewer, so bigger.
 */
function designSize(wave) {
  return 0.7 + (wave.y - 900) / 600;
}

/**
 * Drops thrown into the boat by one breaking wave, sized from the design:
 * nearer the stern the waves are bigger, so the drops fly higher and
 * farther, and look bigger. Speeds are worked out so a drop peaks at the
 * height of the design's sheet of water and lands within its reach.
 */
function dropConfig(wave, scale) {
  const size = designSize(wave);
  const peak = Math.max(...wave.strength);
  const height = (180 + 260 * peak) * size * scale; // px
  const reach = (220 + 160 * peak) * size * scale;
  const rise = (fraction) => Math.sqrt(2 * DROP_GRAVITY * height * fraction);
  const flight = (2 * rise(0.85)) / DROP_GRAVITY; // seconds up and back down
  const inward = INWARD[wave.side];
  const across = [(0.4 * reach) / flight, (1.5 * reach) / flight].map((speed) => speed * inward);
  return {
    emitting: false,
    speedX: { min: Math.min(...across), max: Math.max(...across) },
    speedY: { min: -rise(1.1), max: -rise(0.6) },
    gravityY: DROP_GRAVITY,
    lifespan: { min: flight * 800, max: flight * 1200 },
    // Each drop gets its own size, then shrinks as it flies.
    scale: {
      onEmit: (drop) => (drop.dropScale = 0.8 * size * Phaser.Math.FloatBetween(0.35, 1)),
      onUpdate: (drop, key, t) => drop.dropScale * (1 - 0.6 * t)
    },
    alpha: { start: 0.95, end: 0, ease: 'Quad.easeIn' },
    tint: [0xffffff, 0xd9f2ff, 0xa8dcff]
  };
}
