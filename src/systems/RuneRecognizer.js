/*
 * RuneRecognizer: our own implementation of the $1 Unistroke Recognizer
 * (Wobbrock, Wilson & Li, "Gestures without Libraries, Toolkits or Training",
 * UIST 2007), tuned for Stormrune's three runes.
 *
 * THE IDEA
 * A drawn gesture is just a list of points, but nobody draws a shape twice at
 * the same size, position, speed or angle. $1 removes those differences one
 * by one until only the *shape* is left, and then compares that shape with
 * each stored template, point by point:
 *
 *   1. Resample   - always 64 points, evenly spaced along the path,
 *                   so drawing speed no longer matters.
 *   2. Rotate     - turn the stroke so the line from its centroid to its
 *                   first point points along angle 0 (the "indicative angle").
 *   3. Scale      - stretch it into a 250x250 reference square, and
 *      Translate  - move its centroid to the origin (0, 0).
 *   4. Compare    - average distance between matching points, after trying
 *                   small extra rotations with a Golden Section Search.
 *   5. Score      - turn the best distance into a 0..1 score.
 *
 * Steps 1-3 run once on every template (at startup) and once on every stroke
 * the player draws, so both sides are always prepared in exactly the same way.
 *
 * TWO DELIBERATE CHANGES FROM THE PAPER
 *   - Isa is a straight line. Plain $1 scales width and height separately,
 *     which for a line means dividing by a width of almost zero and blowing
 *     the hand's tiny wobble up into a big shape. Like the later $N
 *     recognizer (Anthony & Wobbrock, 2010), we detect "1D" strokes and scale
 *     those uniformly instead.
 *   - Every template is also stored drawn backwards, so a rune traced in the
 *     opposite direction (common for left-handed players) still matches.
 *
 * This file is plain JavaScript with no Phaser dependency, so it can also be
 * tested from Node: `npm run check:recognizer`.
 */

import { RUNE_TEMPLATES } from './runeTemplates.js';

/** Number of points every stroke and template is resampled to. */
export const NUM_POINTS = 64;

/** Side of the reference square strokes are scaled into. */
const SQUARE_SIZE = 250;

/** Half the square's diagonal: the largest possible average point distance. */
const HALF_DIAGONAL = 0.5 * Math.hypot(SQUARE_SIZE, SQUARE_SIZE);

/**
 * A stroke whose short side is at most 30% of its long side (after rotation)
 * is treated as a line and scaled uniformly. 0.30 is the $N default, and it
 * kept all three runes apart in our synthetic tests.
 */
const ONE_D_THRESHOLD = 0.3;

/** Extra rotations tried while comparing: +-45 degrees, refined to 2 degrees. */
const ANGLE_RANGE = degreesToRadians(45);
const ANGLE_PRECISION = degreesToRadians(2);

/** Golden ratio (0.618...), the step factor of the Golden Section Search. */
const PHI = 0.5 * (Math.sqrt(5) - 1);

/** A match scoring below this is a failed cast (a "fizzle"). */
export const MIN_SCORE = 0.75;

/** Strokes with a shorter total length (px) are stray taps, not runes. */
export const MIN_STROKE_LENGTH = 40;

export class RuneRecognizer {
  /**
   * @param {Object<string, number[][]>} templates Rune id -> corner points.
   */
  constructor(templates = RUNE_TEMPLATES) {
    this.templates = [];

    for (const [name, corners] of Object.entries(templates)) {
      const points = corners.map(([x, y]) => ({ x, y }));
      this.templates.push({ name, points: normalize(points) });

      // The same rune drawn backwards. For Isa and Sowilo the reversed stroke
      // normalizes to (almost) the same shape, a harmless duplicate. For Tiwaz
      // it matters: a caret drawn right-to-left scores only ~0.37 against the
      // forward template and would otherwise never be recognized.
      this.templates.push({ name, points: normalize([...points].reverse()) });
    }
  }

  /**
   * Recognizes a stroke as one of the runes.
   *
   * @param {{x: number, y: number}[]} stroke Raw stroke points, in pixels.
   * @returns {{name: string, score: number} | null} The rune, or null for a fizzle.
   */
  recognize(stroke) {
    const match = this.bestMatch(stroke);
    return match && match.score >= MIN_SCORE ? match : null;
  }

  /**
   * The closest template and its score, however poor the match. Returns null
   * only for strokes too small to compare (taps). Useful for tuning/debugging.
   *
   * @param {{x: number, y: number}[]} stroke Raw stroke points, in pixels.
   * @returns {{name: string, score: number} | null}
   */
  bestMatch(stroke) {
    // Ignore taps and tiny scratches. The spec also suggested a minimum of 8
    // points, but with StrokeInput's 8 px point spacing that rejected about 3
    // in 10 quick, perfectly valid strokes in our tests. Total length alone
    // filters out taps reliably, and resampling copes with sparse strokes.
    if (stroke.length < 2 || pathLength(stroke) < MIN_STROKE_LENGTH) {
      return null;
    }

    const candidate = normalize(stroke);
    let bestDistance = Infinity;
    let bestName = null;

    // Step 4: compare against every template and keep the closest one.
    for (const template of this.templates) {
      const distance = distanceAtBestAngle(candidate, template.points);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestName = template.name;
      }
    }

    // Step 5: distance 0 is a perfect match (score 1); half the square's
    // diagonal is as far apart as two normalized strokes can be (score 0).
    return { name: bestName, score: 1 - bestDistance / HALF_DIAGONAL };
  }
}

/**
 * Steps 1-3: puts a stroke into the standard form used for comparison.
 * Exported so the test script can inspect each stage.
 */
export function normalize(points) {
  let result = resample(points, NUM_POINTS);
  result = rotateBy(result, -indicativeAngle(result));
  result = scaleTo(result, SQUARE_SIZE);
  return translateTo(result, { x: 0, y: 0 });
}

/**
 * Step 1: Resample. Walks along the stroke and places a new point every
 * `interval` pixels (total length / (n - 1)), interpolating inside segments.
 * Fast parts of a stroke (few, far-apart points) and slow parts (many, close
 * points) end up equally dense. Works on copies; the input is not modified.
 */
export function resample(points, n) {
  const interval = pathLength(points) / (n - 1);
  const result = [{ x: points[0].x, y: points[0].y }];

  if (interval > 0) {
    let walked = 0; // distance covered since the last placed point
    let previous = points[0];

    for (let i = 1; i < points.length; i++) {
      const current = points[i];
      let segment = distance(previous, current);

      // The next point may fall inside this segment, possibly several times.
      while (walked + segment >= interval && result.length < n) {
        const t = (interval - walked) / segment;
        const point = {
          x: previous.x + t * (current.x - previous.x),
          y: previous.y + t * (current.y - previous.y)
        };
        result.push(point);

        // Continue measuring from the point we just placed.
        previous = point;
        segment = distance(previous, current);
        walked = 0;
      }

      walked += segment;
      previous = current;
    }
  }

  // Floating-point rounding can leave us one point short (or, for a stroke
  // with no length at all, with a single point): pad with the last point.
  const last = points[points.length - 1];
  while (result.length < n) {
    result.push({ x: last.x, y: last.y });
  }
  return result;
}

/**
 * Step 2 helper: the angle of the line from the centroid to the first point.
 * Rotating by minus this angle gives every stroke the same starting direction.
 */
function indicativeAngle(points) {
  const center = centroid(points);
  return Math.atan2(points[0].y - center.y, points[0].x - center.x);
}

/** Rotates all points around their centroid by `radians`. */
function rotateBy(points, radians) {
  const center = centroid(points);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return points.map((p) => ({
    x: (p.x - center.x) * cos - (p.y - center.y) * sin + center.x,
    y: (p.x - center.x) * sin + (p.y - center.y) * cos + center.y
  }));
}

/**
 * Step 3: Scale. Most strokes are stretched to fill the reference square on
 * both axes ($1's non-uniform scaling, which makes a tall Z match a wide Z).
 * A stroke that is basically a line is scaled uniformly instead, so its
 * negligible width is not blown up (see the notes at the top of the file).
 */
function scaleTo(points, size) {
  const { width, height } = boundingBox(points);
  const longSide = Math.max(width, height);

  if (longSide === 0) {
    return points.map((p) => ({ x: p.x, y: p.y })); // a single dot: nothing to scale
  }

  const isLine = Math.min(width, height) / longSide <= ONE_D_THRESHOLD;
  const scaleX = isLine ? size / longSide : size / width;
  const scaleY = isLine ? size / longSide : size / height;

  return points.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
}

/** Step 3: Translate. Moves the points so their centroid lands on `target`. */
function translateTo(points, target) {
  const center = centroid(points);
  return points.map((p) => ({
    x: p.x + target.x - center.x,
    y: p.y + target.y - center.y
  }));
}

/**
 * Step 4: the distance between a stroke and a template at the best small
 * rotation. Hand-drawn strokes are rarely at exactly the template's angle,
 * so we search angles between -45 and +45 degrees. Golden Section Search
 * narrows the range by ~38% per step instead of testing every angle, which
 * finds the minimum in about ten comparisons.
 */
function distanceAtBestAngle(points, template) {
  let a = -ANGLE_RANGE;
  let b = ANGLE_RANGE;
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = distanceAtAngle(points, template, x1);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = distanceAtAngle(points, template, x2);

  while (Math.abs(b - a) > ANGLE_PRECISION) {
    if (f1 < f2) {
      // The minimum lies in [a, x2]: drop the right part of the range.
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = distanceAtAngle(points, template, x1);
    } else {
      // The minimum lies in [x1, b]: drop the left part of the range.
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = distanceAtAngle(points, template, x2);
    }
  }

  return Math.min(f1, f2);
}

function distanceAtAngle(points, template, radians) {
  return pathDistance(rotateBy(points, radians), template);
}

/** Average distance between corresponding points of two equal-length paths. */
function pathDistance(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    total += distance(a[i], b[i]);
  }
  return total / a.length;
}

// --- Small geometry helpers -------------------------------------------------

/** Total length of a polyline. */
export function pathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += distance(points[i - 1], points[i]);
  }
  return length;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function centroid(points) {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function boundingBox(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}
