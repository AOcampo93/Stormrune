import Phaser from 'phaser';
import { COLOR } from '../config/palette.js';
import { DEPTH } from '../config/layout.js';

/** Each generation splits every segment in two: 2^5 = 32 segments per bolt. */
const GENERATIONS = 5;

/** First sideways jitter, as a fraction of the bolt's length. Halves each generation. */
const JITTER = 0.16;

/**
 * Lightning draws procedural lightning bolts with Graphics: no images.
 *
 * A bolt starts as a straight line from the sky to the target. We then
 * repeatedly split every segment at its midpoint and push that midpoint
 * sideways by a random amount, halving the amount each time
 * ("midpoint displacement"). Big early kinks plus ever smaller ones give
 * the jagged, self-similar look of real lightning. A couple of short side
 * branches are grown the same way.
 */
export class Lightning {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
  }

  /**
   * Strikes from `from` (usually above the screen) to `to`, then fades out.
   * @param {{x: number, y: number}} from
   * @param {{x: number, y: number}} to
   */
  strike(from, to) {
    const bolt = buildBoltPath(from, to, GENERATIONS, JITTER);

    // Each bolt gets its own short-lived Graphics. Additive blending makes
    // overlapping strokes brighter, which reads as light rather than paint.
    const g = this.scene.add.graphics().setDepth(DEPTH.effects).setBlendMode(Phaser.BlendModes.ADD);
    drawBolt(g, bolt, 1);

    // One or two thinner forks, starting somewhere in the upper part of the bolt.
    const branchCount = Phaser.Math.Between(1, 2);
    for (let i = 0; i < branchCount; i++) {
      const start = bolt[Phaser.Math.Between(4, Math.floor(bolt.length * 0.6))];
      const angle = Math.atan2(to.y - from.y, to.x - from.x) + Phaser.Math.FloatBetween(0.4, 0.8) * (Math.random() < 0.5 ? -1 : 1);
      const length = Phaser.Math.Between(70, 150);
      const end = { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
      drawBolt(g, buildBoltPath(start, end, GENERATIONS - 1, JITTER), 0.5);
    }

    // A quick double flicker, then fade away and free the Graphics.
    this.scene.tweens.chain({
      targets: g,
      tweens: [
        { alpha: 0.3, duration: 40, yoyo: true, repeat: 1 },
        { alpha: 0, duration: 220, ease: 'Quad.easeIn' }
      ],
      onComplete: () => g.destroy()
    });
  }
}

/**
 * Midpoint displacement: returns the points of a jagged path from `from` to `to`.
 * Exported so the algorithm can be reused or tested on its own.
 */
export function buildBoltPath(from, to, generations, jitter) {
  let points = [from, to];
  let offset = Math.hypot(to.x - from.x, to.y - from.y) * jitter;

  for (let generation = 0; generation < generations; generation++) {
    const next = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;

      // Unit vector perpendicular to the segment, to push the midpoint sideways.
      const normalX = -(b.y - a.y) / length;
      const normalY = (b.x - a.x) / length;
      const push = Phaser.Math.FloatBetween(-offset, offset);

      next.push({ x: (a.x + b.x) / 2 + normalX * push, y: (a.y + b.y) / 2 + normalY * push }, b);
    }

    points = next;
    offset /= 2;
  }

  return points;
}

/** A bolt as three layered strokes: wide faint halo, cyan body, white-hot core. */
function drawBolt(g, points, thickness) {
  g.lineStyle(16 * thickness, COLOR.glow, 0.15);
  g.strokePoints(points);
  g.lineStyle(6 * thickness, COLOR.glow, 0.7);
  g.strokePoints(points);
  g.lineStyle(2.5 * thickness, COLOR.white, 1);
  g.strokePoints(points);
}
