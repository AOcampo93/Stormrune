// The three runes a player can cast. Each one is drawn as a single stroke and
// is described here by its corner points, in drawing order, inside a 0..100
// box where y grows downward (screen coordinates).
//
// The shapes are deliberately as different from each other as possible,
// which is what keeps recognition accurate. If you ever add a rune, re-run
// `npm run check:recognizer` to make sure the set is still easy to tell apart.
//
// Note on "templates": the recognizer resamples these corner points into 64
// evenly spaced points with the very same function it applies to the
// player's strokes, so templates and input are always sampled identically.

export const RUNE_TEMPLATES = {
  isa:    [[0, 0], [0, 100]],                   // │  one vertical line, top to bottom
  sowilo: [[0, 0], [80, 0], [0, 80], [80, 80]], // Z  right, diagonal down-left, right
  tiwaz:  [[0, 100], [50, 0], [100, 100]]       // ^  up-right, then down-right
};

/** Every rune id, e.g. for picking random runes. */
export const RUNE_IDS = Object.keys(RUNE_TEMPLATES);

/** Display names, used in on-screen text. */
export const RUNE_NAMES = {
  isa: 'Isa',
  sowilo: 'Sowilo',
  tiwaz: 'Tiwaz'
};

/**
 * Fits a rune's corner points into a size x size box centered on (0, 0),
 * keeping its proportions, so the rune can be drawn as a small glyph.
 *
 * @param {string} id Rune id, e.g. 'tiwaz'.
 * @param {number} size Side of the box in pixels.
 * @returns {{x: number, y: number}[]} Corner points relative to the box center.
 */
export function fitRuneToBox(id, size) {
  const corners = RUNE_TEMPLATES[id];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Uniform scale so the longest side fills the box (Isa has zero width).
  const scale = size / Math.max(maxX - minX, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return corners.map(([x, y]) => ({
    x: (x - centerX) * scale,
    y: (y - centerY) * scale
  }));
}
