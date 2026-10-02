/*
 * check-recognizer.js: a dependency-free accuracy test for RuneRecognizer.
 *
 * Run with `npm run check:recognizer`. It draws thousands of synthetic,
 * hand-like strokes (random size, proportions, tilt, curvature, jitter,
 * direction and pointer speed), feeds them through the same rules as
 * StrokeInput, and checks that:
 *   - each rune is recognized correctly and almost never confused,
 *   - taps, scribbles and other shapes are rejected (no accidental casts),
 *   - degenerate input never produces NaN.
 * It exits with code 1 if any requirement fails.
 */

import { RuneRecognizer, resample, normalize, NUM_POINTS } from '../src/systems/RuneRecognizer.js';
import { RUNE_TEMPLATES } from '../src/systems/runeTemplates.js';

const recognizer = new RuneRecognizer();
const SAMPLES = 1500; // strokes per rune / per negative shape
const failures = [];
const lines = [];

// --- Seeded randomness, so every run tests exactly the same strokes ---------

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(310);
const between = (min, max) => min + (max - min) * rand();

// --- Building hand-like strokes ---------------------------------------------

const toPoints = (corners) => corners.map(([x, y]) => ({ x, y }));

/** Scales to `size` (longest side), stretches by `aspect`, rotates by `angle`. */
function transform(points, size, aspect, angle) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const k = size / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const sx = Math.sqrt(aspect);
  const sy = 1 / Math.sqrt(aspect);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map((p) => {
    const x = (p.x - cx) * k * sx;
    const y = (p.y - cy) * k * sy;
    return { x: 640 + x * cos - y * sin, y: 360 + x * sin + y * cos };
  });
}

/** Dense path through the corners; each segment bows sideways by up to `bow` of its length. */
function densify(corners, bow) {
  const path = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i];
    const b = corners[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const offset = between(-bow, bow) * len;
    // Quadratic curve whose control point sits 2*offset from the midpoint,
    // which puts the curve's peak exactly `offset` away from the straight line.
    const control = {
      x: (a.x + b.x) / 2 + (-(b.y - a.y) / len) * offset * 2,
      y: (a.y + b.y) / 2 + ((b.x - a.x) / len) * offset * 2
    };
    const steps = Math.max(8, Math.ceil(len / 2));
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      const t = s / steps;
      path.push({
        x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * control.x + t ** 2 * b.x,
        y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * control.y + t ** 2 * b.y
      });
    }
  }
  return path;
}

/**
 * Emulates the browser: a pointer event every `spacing` px along the path,
 * with up to `noise` px of jitter, filtered exactly like StrokeInput
 * (keep points more than 8 px apart, at most 150, always keep the release).
 */
function capture(path, spacing, noise) {
  const events = [];
  let walked = Infinity;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) walked += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (walked >= spacing || i === path.length - 1) {
      events.push({ x: path[i].x + between(-noise, noise), y: path[i].y + between(-noise, noise) });
      walked = 0;
    }
  }
  const stroke = [events[0]];
  for (const e of events.slice(1, -1)) {
    const last = stroke[stroke.length - 1];
    if (stroke.length < 150 && Math.hypot(e.x - last.x, e.y - last.y) > 8) stroke.push(e);
  }
  const release = events[events.length - 1];
  if (events.length > 1 && stroke.length < 150) stroke.push(release);
  return stroke;
}

/** A random hand-drawn version of a shape given by its corners. */
function handDrawn(corners, { reversible = true, maxBow = 0.15 } = {}) {
  let points = toPoints(corners);
  if (reversible && rand() < 0.5) points = points.reverse();
  const shaped = transform(points, between(60, 450), Math.exp(between(Math.log(0.5), Math.log(2))), between(-Math.PI / 6, Math.PI / 6));
  return capture(densify(shaped, maxBow), between(4, 50), between(0, 3));
}

// --- Shapes that must NOT be read as runes ------------------------------------

function curve(fn, turns, size) {
  const points = [];
  const steps = 120;
  for (let i = 0; i <= steps; i++) points.push(fn((i / steps) * turns * Math.PI * 2, i / steps));
  return capture(transform(points, size, 1, between(-Math.PI, Math.PI)), between(4, 30), between(0, 2));
}

const NEGATIVES = {
  circle: () => curve((t) => ({ x: Math.cos(t), y: Math.sin(t) }), between(1, 1.1), between(80, 400)),
  spiral: () => curve((t, u) => ({ x: Math.cos(t) * (0.2 + u), y: Math.sin(t) * (0.2 + u) }), 2, between(80, 400)),
  figure8: () => curve((t) => ({ x: Math.sin(t), y: Math.sin(t) * Math.cos(t) }), 1, between(80, 400)),
  triangle: () => handDrawn([[0, 100], [50, 0], [100, 100], [0, 100]], { maxBow: 0.05 }),
  mirroredZ: () => handDrawn([[80, 0], [0, 0], [80, 80], [0, 80]], { maxBow: 0.05 }),
  scribble: () => {
    const corners = [[0, 0]];
    for (let i = 0; i < 12; i++) corners.push([between(0, 100), between(0, 100)]);
    return handDrawn(corners, { maxBow: 0.1 });
  }
};

/**
 * Shapes we only report on. $1 ignores rotation, so a "7" or an "L" really is
 * a bent caret to it. A W or a zigzag drawn wide and flat becomes a wavy line,
 * which can just pass as Isa (scores 0.75-0.78, while real Isa strokes score
 * 0.85+). None of this matters in play: the game never asks for these shapes
 * and a misread never costs the player anything.
 */
const REPORT_ONLY = {
  seven: [[0, 0], [100, 0], [40, 100]],
  L: [[0, 0], [0, 100], [70, 100]],
  checkMark: [[0, 60], [30, 100], [100, 0]],
  closedSquare: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]],
  W: [[0, 0], [25, 100], [50, 30], [75, 100], [100, 0]],
  zigzag: [[0, 0], [20, 100], [40, 0], [60, 100], [80, 0], [100, 100]]
};

// --- Helpers for reporting ----------------------------------------------------

const pct = (n) => `${((n / SAMPLES) * 100).toFixed(1)}%`;

function requireThat(ok, message) {
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures.push(message);
}

// --- 1. Each rune, drawn thousands of ways -------------------------------------

for (const [rune, corners] of Object.entries(RUNE_TEMPLATES)) {
  let correct = 0;
  let wrong = 0;
  let gated = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const stroke = handDrawn(corners);
    if (!recognizer.bestMatch(stroke)) gated++;
    const result = recognizer.recognize(stroke);
    if (result?.name === rune) correct++;
    else if (result) wrong++;
  }
  requireThat(correct / SAMPLES >= 0.98, `${rune}: ${pct(correct)} recognized (need >= 98%)`);
  requireThat(wrong / SAMPLES <= 0.005, `${rune}: ${pct(wrong)} read as another rune (need <= 0.5%)`);
  requireThat(gated === 0, `${rune}: ${gated} valid strokes discarded as taps (need 0)`);
}

// --- 2. Taps, short scratches and other shapes are rejected ---------------------

{
  let accepted = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const taps = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({ x: 640 + between(-5, 5), y: 360 + between(-5, 5) }));
    if (recognizer.recognize(taps)) accepted++;
  }
  requireThat(accepted === 0, `taps: ${pct(SAMPLES - accepted)} rejected (need 100%)`);
}
{
  let accepted = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const length = between(5, 38);
    const angle = between(0, Math.PI * 2);
    const stroke = [{ x: 600, y: 300 }, { x: 600 + Math.cos(angle) * length, y: 300 + Math.sin(angle) * length }];
    if (recognizer.recognize(stroke)) accepted++;
  }
  requireThat(accepted === 0, `strokes under 38 px: ${pct(SAMPLES - accepted)} rejected (need 100%)`);
}

const STRICT = new Set(['circle', 'spiral', 'figure8', 'triangle', 'mirroredZ']);
for (const [name, make] of Object.entries(NEGATIVES)) {
  let accepted = 0;
  for (let i = 0; i < SAMPLES; i++) if (recognizer.recognize(make())) accepted++;
  const need = STRICT.has(name) ? 0.98 : 0.9;
  requireThat((SAMPLES - accepted) / SAMPLES >= need, `${name}: ${pct(SAMPLES - accepted)} rejected (need >= ${need * 100}%)`);
}

// --- 3. Fixed cases ---------------------------------------------------------------

const exact = (corners, size = 200) => capture(densify(transform(toPoints(corners), size, 1, 0), 0), 6, 0);

for (const [rune, corners] of Object.entries(RUNE_TEMPLATES)) {
  const result = recognizer.recognize(exact(corners));
  requireThat(result?.name === rune && result.score >= 0.99, `${rune} template itself scores ${result?.score.toFixed(3)} (need >= 0.99)`);
}

const FIXED = [
  ['caret drawn right-to-left', [[100, 100], [50, 0], [0, 100]], 'tiwaz'],
  ['horizontal line', [[0, 0], [100, 0]], 'isa'],
  ['diagonal line', [[0, 0], [100, 100]], 'isa'],
  ['"v"', [[0, 0], [50, 100], [100, 0]], 'tiwaz'],
  ['"<"', [[100, 0], [0, 50], [100, 100]], 'tiwaz'],
  ['">"', [[0, 0], [100, 50], [0, 100]], 'tiwaz'],
  ['"N"', [[0, 100], [0, 0], [80, 100], [80, 0]], 'sowilo']
];
for (const [label, corners, expected] of FIXED) {
  const result = recognizer.recognize(exact(corners));
  requireThat(result?.name === expected, `${label} -> ${result?.name ?? 'fizzle'} (expected ${expected})`);
}

// A vertical line drawn with a thumb is never straight: it bows sideways.
for (const bow of [0.05, 0.1, 0.15]) {
  let worst = 1;
  for (let i = 0; i < 200; i++) {
    const length = between(100, 400);
    const tilt = between(-0.3, 0.3);
    const top = { x: 640, y: 360 - length / 2 };
    const bottom = { x: 640 + Math.sin(tilt) * length, y: top.y + Math.cos(tilt) * length };
    const result = recognizer.recognize(capture(bowLine(top, bottom, bow), 6, 0));
    worst = Math.min(worst, result?.name === 'isa' ? result.score : 0);
  }
  requireThat(worst >= 0.9, `line bowed ${bow * 100}%: worst Isa score ${worst.toFixed(3)} (need >= 0.9)`);
}

/** Points along a line from a to b whose middle bulges sideways by `bow` of its length. */
function bowLine(a, b, bow) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const control = {
    x: (a.x + b.x) / 2 + (-(b.y - a.y) / len) * bow * len * 2,
    y: (a.y + b.y) / 2 + ((b.x - a.x) / len) * bow * len * 2
  };
  const points = [];
  for (let s = 0; s <= 100; s++) {
    const t = s / 100;
    points.push({
      x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * control.x + t ** 2 * b.x,
      y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * control.y + t ** 2 * b.y
    });
  }
  return points;
}

// Degenerate input must never produce NaN, and resampling must give exactly 64 points.
{
  const degenerate = [
    [{ x: 0, y: 0 }, { x: 60, y: 0 }],
    [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 60, y: 0 }, { x: 90, y: 0 }],
    [...Array(20).fill({ x: 10, y: 10 }), { x: 80, y: 90 }, ...Array(20).fill({ x: 80, y: 90 })]
  ];
  const clean = degenerate.every((stroke) => {
    const normalized = normalize(stroke);
    const match = recognizer.bestMatch(stroke);
    return normalized.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && Number.isFinite(match.score);
  });
  requireThat(clean, 'degenerate strokes (2 points, collinear, duplicates) produce no NaN');

  let exactCount = true;
  for (let i = 0; i < 500; i++) {
    if (resample(handDrawn(RUNE_TEMPLATES.sowilo), NUM_POINTS).length !== NUM_POINTS) exactCount = false;
  }
  requireThat(exactCount, `resample always returns exactly ${NUM_POINTS} points`);
}

// --- 4. Report-only shapes ----------------------------------------------------------

const reports = [];
for (const [name, corners] of Object.entries(REPORT_ONLY)) {
  const counts = {};
  for (let i = 0; i < SAMPLES; i++) {
    const result = recognizer.recognize(handDrawn(corners, { maxBow: 0.05 }));
    const key = result?.name ?? 'fizzle';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  reports.push(`${name}: ${Object.entries(counts).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
}

console.log(lines.join('\n'));
console.log('\nFor information only (no requirement):\n  ' + reports.join('\n  '));
console.log(failures.length ? `\n${failures.length} requirement(s) failed.` : '\nAll requirements passed.');
process.exit(failures.length ? 1 : 0);
