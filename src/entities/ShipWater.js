import { HULL, DEPTH } from '../config/layout.js';

/**
 * How high the sea reaches up the outside of the hull when the boat is at
 * rest, measured across the hull's side: 0 is the gunwale (top edge), 1 is
 * where the design's hull ends. Lower numbers mean a higher sea.
 */
const REST_LEVEL = 0.6;

/** How strongly a side dipping (or rising) as the boat rocks moves the water on it. */
const DIP_GAIN = 4;

/** Waves run along the hull in step with the background sea's 1.6 s loop. */
const WAVE_PERIOD_MS = 1600;

/** Water this close to the gunwale washes over it into the boat. */
const OVERFLOW_LEVEL = 0.15;

/** A side can't take on water again sooner than this (ms). */
const OVERFLOW_COOLDOWN_MS = 650;

/** Random small splashes against the hull, every this many ms. */
const HULL_SPLASH_MS = { min: 220, max: 600 };

/** Water on the deck drains back out at this rate (volume per ms). */
const DRAIN_PER_MS = 0.0005;


/** Points sampled along each side of the hull. */
const SAMPLES = 32;

const SIDES = ['port', 'starboard'];

/** From the hull toward the middle of the deck, along screen x. */
const INWARD = { port: 1, starboard: -1 };

/**
 * The water against the hull, from its surface down: a lighter, slightly
 * see-through surface, dark water below, then a fade into the background
 * sea past the hull's edge so there is no hard seam. `v` is measured like
 * the levels above (0 at the gunwale, 1 at the design's hull edge); the
 * first two bands follow the water's surface.
 */
const DEPTH_BANDS = [
  { v: 0, color: 0x23506f, alpha: 0.8 }, // the surface
  { v: 0.2, color: 0x0f2740, alpha: 0.94 }, // just below it
  { v: 1, color: 0x0a1729, alpha: 0.94 }, // the hull's edge
  { v: 1.2, color: 0x0a1729, alpha: 0 } // faded into the sea
];

const FOAM = 0xe6f6ff;
const DECK_WATER = 0xa6dcff;

const lerp = (a, b, t) => a + (b - a) * t;
const along = ([[x0, y0], [x1, y1]], u) => [lerp(x0, x1, u), lerp(y0, y1, u)];

/**
 * The stormy sea against the longship, drawn with code over the boat image.
 *
 * - The sea level: water covers the lower part of the hull's outer sides
 *   (and the bottoms of the shields hanging there), with foam where it meets
 *   the wood. The sea stays level while the boat rocks, so the side that
 *   dips sinks deeper into it.
 * - Waves over the gunwale: when the water comes close enough to a side's
 *   top edge, a wave washes over it, throwing spray into the boat.
 * - Water on the deck: what came aboard sloshes toward the low side and
 *   slowly drains away.
 * - Small splashes keep bursting against the hull at random.
 */
export class ShipWater {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('./Longship.js').Longship} longship
   */
  constructor(scene, longship) {
    this.longship = longship;
    this.elapsed = 0;

    // The sea against the hull lives in screen space: the sea doesn't rock.
    this.hullWater = scene.add.graphics().setDepth(DEPTH.shipWater);

    // Water on the deck is part of the boat, so it rocks with it.
    this.deckWater = scene.add.graphics();
    longship.addToDeck(this.deckWater);

    /** How much water lies on each side of the deck (0..1). */
    this.volume = { port: 0.1, starboard: 0.1 };
    this.lastOverflow = { port: -Infinity, starboard: -Infinity };
    this.nextHullSplash = 0;
    /** Waves that have washed aboard so far (for "?debug" checks). */
    this.wavesAboard = 0;

    // Spray thrown over the gunwale, aimed into the boat on each side.
    this.overflowSpray = {
      port: scene.add.particles(0, 0, 'spark', sprayConfig({ min: -85, max: -30 }, { min: 200, max: 430 }, 1.35)),
      starboard: scene.add.particles(0, 0, 'spark', sprayConfig({ min: -150, max: -95 }, { min: 200, max: 430 }, 1.35))
    };
    // Foam pouring over the gunwale and sliding onto the deck, per side.
    this.spillFoam = {
      port: scene.add.particles(0, 0, 'puff', foamConfig({ min: -35, max: 15 })),
      starboard: scene.add.particles(0, 0, 'puff', foamConfig({ min: 165, max: 215 }))
    };
    // Droplets bursting straight up against the hull.
    this.hullSpray = scene.add.particles(0, 0, 'spark', sprayConfig({ min: -115, max: -65 }, { min: 90, max: 230 }));
    // A soft cloud of mist with every splash.
    this.mist = scene.add.particles(0, 0, 'puff', {
      emitting: false,
      speed: { min: 20, max: 80 },
      angle: { min: -130, max: -50 },
      lifespan: { min: 600, max: 1100 },
      scale: { start: 1.2, end: 3.2 },
      alpha: { start: 0.45, end: 0 },
      tint: 0xdff3ff
    });
    const emitters = [this.overflowSpray.port, this.overflowSpray.starboard, this.spillFoam.port, this.spillFoam.starboard];
    for (const emitter of [...emitters, this.hullSpray, this.mist]) {
      emitter.setDepth(DEPTH.shipWater + 1);
    }
  }

  update(delta) {
    this.elapsed += delta;
    this.hullWater.clear();

    for (const side of SIDES) {
      const waterline = this.waterlineAlong(side);
      this.drawSea(waterline);
      this.checkOverflow(side, waterline);
    }

    this.splashAgainstHull();
    this.drawDeckWater(delta);
  }

  /**
   * Where the sea meets one side of the hull right now, sampled from the bow
   * down past the stern. Each sample keeps the current gunwale and hull-edge
   * points, so any depth across the side can be placed with at(v).
   */
  waterlineAlong(side) {
    const time = this.elapsed / WAVE_PERIOD_MS;
    const samples = [];

    for (let i = 0; i <= SAMPLES; i++) {
      const u = i / SAMPLES; // 0 at the bow, 1 well below the stern
      const gunwale = this.longship.toWorld(...along(HULL.gunwale[side], u));
      const hullEdge = this.longship.toWorld(...along(HULL.hullBottom[side], u));
      const gunwaleAtRest = this.longship.toWorldAtRest(...along(HULL.gunwale[side], u));
      const hullEdgeAtRest = this.longship.toWorldAtRest(...along(HULL.hullBottom[side], u));

      // How far this part of the side has dipped below its resting place,
      // compared with how wide the hull's side is here (perspective).
      const sideWidth = Math.hypot(hullEdgeAtRest.x - gunwaleAtRest.x, hullEdgeAtRest.y - gunwaleAtRest.y) || 1;
      const dip = (gunwale.y - gunwaleAtRest.y) / sideWidth;

      // Two waves of different length run along the hull, in step with the sea.
      const wave =
        0.08 * Math.sin(Math.PI * 2 * (3.2 * u - time)) +
        0.04 * Math.sin(Math.PI * 2 * (7.5 * u + time * 1.8) + (side === 'port' ? 0 : 2));

      const level = REST_LEVEL - dip * DIP_GAIN + wave;
      const at = (v) => ({ x: lerp(gunwale.x, hullEdge.x, v), y: lerp(gunwale.y, hullEdge.y, v) });
      samples.push({ u, level, surface: Math.max(0, level), at, gunwale, sideWidth });
    }
    return samples;
  }

  /** The water body as gradient bands, then the foam on its surface. */
  drawSea(waterline) {
    const g = this.hullWater;

    // Where a band edge sits at a sample: the first edges follow the surface.
    const edgeV = (band, sample) =>
      band.v >= 1 ? band.v : Math.min(0.97, sample.surface + band.v * (1 - sample.surface));

    for (let b = 0; b < DEPTH_BANDS.length - 1; b++) {
      const top = DEPTH_BANDS[b];
      const bottom = DEPTH_BANDS[b + 1];
      for (let i = 0; i < waterline.length - 1; i++) {
        const s0 = waterline[i];
        const s1 = waterline[i + 1];
        const a0 = s0.at(edgeV(top, s0));
        const a1 = s1.at(edgeV(top, s1));
        const b0 = s0.at(edgeV(bottom, s0));
        const b1 = s1.at(edgeV(bottom, s1));
        // Each quad as two triangles; per-vertex colors make the gradient.
        g.fillGradientStyle(top.color, top.color, bottom.color, bottom.color, top.alpha, top.alpha, bottom.alpha, bottom.alpha);
        g.fillTriangle(a0.x, a0.y, a1.x, a1.y, b0.x, b0.y);
        g.fillGradientStyle(bottom.color, bottom.color, top.color, top.color, bottom.alpha, bottom.alpha, top.alpha, top.alpha);
        g.fillTriangle(b1.x, b1.y, b0.x, b0.y, a1.x, a1.y);
      }
    }

    // Toward the bow the hull's side narrows to a few pixels, where foam would
    // just outline the gunwale; it fades in as the side widens.
    const presence = (s) => Math.min(1, Math.max(0, (s.sideWidth - 12) / 40));

    // Faint streaks under the surface, drifting with the waves.
    for (const [offset, alpha] of [[0.07, 0.22], [0.16, 0.12]]) {
      for (let i = 0; i < waterline.length - 1; i++) {
        const s0 = waterline[i];
        const s1 = waterline[i + 1];
        const drift = (s, k) => Math.min(0.97, s.surface + offset + 0.02 * Math.sin(this.elapsed / 260 + k * 0.9));
        const p0 = s0.at(drift(s0, i));
        const p1 = s1.at(drift(s1, i + 1));
        g.lineStyle(1.5, FOAM, alpha * presence(s0));
        g.lineBetween(p0.x, p0.y, p1.x, p1.y);
      }
    }

    // Foam where the sea meets the wood: uneven thickness, plus bubbles.
    for (let i = 0; i < waterline.length - 1; i++) {
      const p0 = waterline[i].at(waterline[i].surface);
      const p1 = waterline[i + 1].at(waterline[i + 1].surface);
      g.lineStyle(2 + 1.6 * (0.5 + 0.5 * Math.sin(this.elapsed / 200 + i * 1.3)), FOAM, 0.85 * presence(waterline[i]));
      g.lineBetween(p0.x, p0.y, p1.x, p1.y);
    }
    waterline.forEach((s, i) => {
      if (i % 2 === 0 && presence(s) > 0) {
        g.fillStyle(FOAM, 0.7 * presence(s));
        const top = s.at(s.surface);
        const wobble = Math.sin(this.elapsed / 180 + i * 1.7);
        g.fillCircle(top.x + wobble * 3, top.y + 2 + wobble, 1.2 + (s.sideWidth / 60) * (0.6 + 0.4 * wobble));
      }
    });
  }

  /** A wave reaching the gunwale washes over it: spray into the boat. */
  checkOverflow(side, waterline) {
    // Only the stretch of hull that is on screen and near enough to matter.
    const visible = waterline.filter(({ u }) => u > 0.3 && u < 0.9);
    const lowest = visible.reduce((a, b) => (b.level < a.level ? b : a));
    if (lowest.level > OVERFLOW_LEVEL || this.elapsed - this.lastOverflow[side] < OVERFLOW_COOLDOWN_MS) {
      return;
    }
    this.lastOverflow[side] = this.elapsed;
    this.wavesAboard += 1;

    // The deeper the gunwale dips, the bigger the wave that comes aboard.
    const strength = Math.min(1, (OVERFLOW_LEVEL - lowest.level) / 0.25 + 0.3);
    const { x, y } = lowest.gunwale;
    this.overflowSpray[side].explode(Math.round(22 + 30 * strength), x, y);
    this.mist.explode(4 + Math.round(3 * strength), x + INWARD[side] * 12, y - 8);

    // A sheet of foam pours over a stretch of the gunwale around that point.
    const reach = 0.05 + 0.05 * strength;
    for (let k = 0; k <= 6; k++) {
      const point = this.longship.toWorld(...along(HULL.gunwale[side], lowest.u - reach + (2 * reach * k) / 6));
      this.spillFoam[side].explode(2, point.x, point.y);
    }
    this.volume[side] = Math.min(1, this.volume[side] + 0.45 * strength);
  }

  /** Small splashes bursting up against the hull every so often. */
  splashAgainstHull() {
    if (this.elapsed < this.nextHullSplash) {
      return;
    }
    this.nextHullSplash = this.elapsed + HULL_SPLASH_MS.min + Math.random() * (HULL_SPLASH_MS.max - HULL_SPLASH_MS.min);

    const side = Math.random() < 0.5 ? 'port' : 'starboard';
    const u = 0.35 + Math.random() * 0.55;
    const [gx, gy] = along(HULL.gunwale[side], u);
    const [bx, by] = along(HULL.hullBottom[side], u);
    // Somewhere around the water's edge on that part of the hull.
    const v = REST_LEVEL + (Math.random() - 0.5) * 0.2;
    const { x, y } = this.longship.toWorld(lerp(gx, bx, v), lerp(gy, by, v));
    this.hullSpray.explode(4 + Math.floor(Math.random() * 6), x, y);
    if (Math.random() < 0.4) {
      this.mist.explode(1, x, y);
    }
  }

  /**
   * Water on the deck, along the foot of each side's inner wall. It flows
   * toward whichever side is lower and drains away slowly.
   */
  drawDeckWater(delta) {
    const tilt = this.longship.container.rotation; // > 0: starboard is lower
    const g = this.deckWater;
    g.clear();

    for (const side of SIDES) {
      const lean = side === 'port' ? -tilt : tilt;
      const target = Math.max(0, 0.08 + lean * 9);
      // Rise quickly toward the slosh, drain slowly.
      const current = this.volume[side];
      this.volume[side] =
        current < target ? current + (target - current) * Math.min(1, delta / 250) : Math.max(target, current - DRAIN_PER_MS * delta);

      const volume = this.volume[side];
      if (volume < 0.02) {
        continue;
      }

      // A sheet of water hugging the inside of the hull, nearer the stern,
      // that fades out toward the middle of the deck: deep at the side, thin
      // inside. It starts a little inside the gunwale, where the deck planks
      // meet the side in this perspective.
      const edge = [];
      const inner = [];
      for (let i = 0; i <= 16; i++) {
        const u = 0.5 + (0.5 * i) / 16;
        const [gx, gy] = along(HULL.gunwale[side], u);
        const [dx, dy] = along(HULL.deckEdge[side], u);
        const [ex, ey] = [lerp(gx, dx, 0.3), lerp(gy, dy, 0.3)];
        const ripple = 1 + 0.15 * Math.sin(this.elapsed / 260 + i * 1.1);
        const width = volume * 260 * u * ripple;
        edge.push(this.longship.toLocal(ex, ey));
        inner.push(this.longship.toLocal(ex + INWARD[side] * width, ey));
      }

      const alpha = Math.min(0.55, 0.2 + 0.4 * volume);
      for (let i = 0; i < edge.length - 1; i++) {
        g.fillGradientStyle(DECK_WATER, DECK_WATER, DECK_WATER, DECK_WATER, alpha, alpha, 0, 0);
        g.fillTriangle(edge[i].x, edge[i].y, edge[i + 1].x, edge[i + 1].y, inner[i].x, inner[i].y);
        g.fillGradientStyle(DECK_WATER, DECK_WATER, DECK_WATER, DECK_WATER, 0, 0, alpha, alpha);
        g.fillTriangle(inner[i + 1].x, inner[i + 1].y, inner[i].x, inner[i].y, edge[i + 1].x, edge[i + 1].y);
      }
      // Glints on the moving water, broken into short dashes.
      g.lineStyle(1.5, 0xffffff, 0.15 + 0.3 * volume);
      for (let i = 0; i < inner.length - 1; i += 2) {
        const mid = (p, q) => ({ x: lerp(p.x, q.x, 0.55), y: lerp(p.y, q.y, 0.55) });
        const a = mid(edge[i], inner[i]);
        const b = mid(edge[i + 1], inner[i + 1]);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
  }
}

/** Foam: soft white clouds that slide in over the gunwale, swell and fade. */
function foamConfig(angle) {
  return {
    emitting: false,
    speed: { min: 50, max: 140 },
    angle,
    lifespan: { min: 380, max: 650 },
    scale: { start: 0.9, end: 2.4 },
    alpha: { start: 0.75, end: 0 },
    tint: [0xffffff, 0xe3f5ff]
  };
}

/** Water droplets: fly out, fall back with gravity and fade. */
function sprayConfig(angle, speed, size = 1) {
  return {
    emitting: false,
    speed,
    angle,
    lifespan: { min: 450, max: 900 },
    gravityY: 950,
    scale: { start: 0.9 * size, end: 0.3 * size },
    alpha: { start: 0.95, end: 0 },
    tint: [0xffffff, 0xd9f2ff, 0xa8dcff]
  };
}
