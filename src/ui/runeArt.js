import { fitRuneToBox } from '../systems/runeTemplates.js';

/**
 * Runes drawn as inline SVG for the menu screens, from the same templates
 * the recognizer and the draugar's panels use, so what the player reads is
 * exactly what they have to draw.
 */

const GLOW = '#00e5ff';

/** SVG path data for a rune fitted in a size x size box centered on (x, y). */
export function runePath(id, size, x = 0, y = 0) {
  return fitRuneToBox(id, size)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(x + p.x).toFixed(1)} ${(y + p.y).toFixed(1)}`)
    .join(' ');
}

/**
 * A draugr's rune queue, glyph by glyph: the first rune glows (it's the one
 * to draw next), the rest wait, dimmed. Same look as the panel in the game.
 */
export function queueGlyphs(runes, size = 40) {
  return runes
    .map((id, index) => {
      const d = runePath(id, size, size / 2 + 4, size / 2 + 4);
      const strokes =
        index === 0
          ? `<path d="${d}" stroke="${GLOW}" stroke-opacity="0.25" stroke-width="13"/>
             <path d="${d}" stroke="${GLOW}" stroke-width="6"/>`
          : `<path d="${d}" stroke="#ffffff" stroke-opacity="0.45" stroke-width="4.5"/>`;
      return `<svg width="${size + 8}" height="${size + 8}" fill="none" stroke-linecap="round" stroke-linejoin="round">${strokes}</svg>`;
    })
    .join('');
}

/**
 * How to trace a rune: the glowing shape, a dot where the stroke starts and
 * an arrowhead where it ends.
 */
export function traceGuide(id, size = 64) {
  const pad = 12;
  const box = size + 2 * pad;
  const points = fitRuneToBox(id, size).map((p) => ({ x: p.x + box / 2, y: p.y + box / 2 }));
  const d = runePath(id, size, box / 2, box / 2);
  const start = points[0];
  const end = points[points.length - 1];
  const before = points[points.length - 2];
  const angle = Math.atan2(end.y - before.y, end.x - before.x);
  const arrow = [-1, 1]
    .map((side) => {
      const a = angle + Math.PI + side * 0.5;
      return `${(end.x + 11 * Math.cos(a)).toFixed(1)} ${(end.y + 11 * Math.sin(a)).toFixed(1)}`;
    })
    .join(` L${end.x.toFixed(1)} ${end.y.toFixed(1)} L`);
  return `<svg width="${box}" height="${box}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${d}" stroke="${GLOW}" stroke-opacity="0.22" stroke-width="12"/>
    <path d="${d}" stroke="#e6fbff" stroke-width="4"/>
    <path d="M${arrow}" stroke="#e6fbff" stroke-width="4"/>
    <circle cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="6" fill="#f2c14a" stroke="none"/>
  </svg>`;
}

/**
 * The "Trace it" picture: a rune's faint guide, the glowing stroke a finger
 * has drawn over most of it, and the fingertip where the stroke is now.
 */
export function tracingPicture(id) {
  const size = 170;
  const points = fitRuneToBox(id, size).map((p) => ({ x: p.x + 200, y: p.y + 140 }));

  // Split the stroke where the finger is now, 80% of the way along it:
  // the glowing part already drawn, and the faint guide still ahead.
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let remaining = 0.8 * lengths.reduce((a, b) => a + b, 0);
  const drawn = [points[0]];
  let segment = 0;
  for (; segment < lengths.length && remaining > lengths[segment]; segment++) {
    drawn.push(points[segment + 1]);
    remaining -= lengths[segment];
  }
  const t = remaining / lengths[segment];
  const tip = {
    x: points[segment].x + (points[segment + 1].x - points[segment].x) * t,
    y: points[segment].y + (points[segment + 1].y - points[segment].y) * t
  };
  drawn.push(tip);
  const ahead = [tip, ...points.slice(segment + 1)];
  const path = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return `<svg viewBox="0 0 400 300" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <defs>
      <filter id="trace-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="5"/>
      </filter>
    </defs>
    <path d="${path(ahead)}" stroke="#3a5470" stroke-width="14" stroke-dasharray="2 22"/>
    <path d="${path(drawn)}" stroke="#5fdcf5" stroke-opacity="0.6" stroke-width="18" filter="url(#trace-glow)"/>
    <path d="${path(drawn)}" stroke="#e6fbff" stroke-width="5"/>
    <circle cx="${tip.x.toFixed(1)}" cy="${tip.y.toFixed(1)}" r="22" stroke="#bff4ff" stroke-width="3" stroke-opacity="0.8"/>
    <circle cx="${tip.x.toFixed(1)}" cy="${tip.y.toFixed(1)}" r="9" fill="#e6fbff" stroke="none"/>
  </svg>`;
}

/** One hammer, as in the design's "Guard the ship" card: bright, or lost. */
export function hammerIcon(kept) {
  const [head, cheeks, handle] = kept ? ['#6fd8ee', '#a9ecf8', '#4a3426'] : ['#6a7d92', '#8597ab', '#4a5262'];
  return `<svg viewBox="0 0 60 60" width="64" height="64"><g transform="rotate(-40 30 30)" opacity="${kept ? 1 : 0.5}">
    <rect x="12" y="10" width="36" height="20" rx="3" fill="${head}"/>
    <rect x="9" y="8" width="6" height="24" rx="2" fill="${cheeks}"/>
    <rect x="45" y="8" width="6" height="24" rx="2" fill="${cheeks}"/>
    <rect x="27" y="30" width="6" height="24" rx="2" fill="${handle}"/>
  </g></svg>`;
}
