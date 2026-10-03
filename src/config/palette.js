// Every color in the game lives here, so the whole look can be tuned in one
// place. PALETTE keeps CSS-style strings (handy for Text objects and the HTML
// page). Phaser's Graphics, tint and particle APIs want numbers instead, so
// COLOR exposes the same palette as 0xRRGGBB values.

export const PALETTE = {
  skyTop:     '#0B1A2E',
  skyBottom:  '#1A237E',
  seaBack:    '#0D47A1',
  seaFront:   '#303F9F',
  silhouette: '#0A121E',
  glow:       '#00E5FF',
  white:      '#FFFFFF',
  accent:     '#FFC107',
  danger:     '#E53935',
  // Not in the original art brief: a muted grey for failed casts ("fizzles").
  ash:        '#7F8FA6',
  // The menu screens' glowing blue, also used for the level signs: a pale
  // fill and the cyan light around it.
  frost:      '#BFF4FF',
  frostGlow:  '#5FDCF5'
};

/** The same palette as numbers, e.g. COLOR.glow === 0x00E5FF. */
export const COLOR = Object.fromEntries(
  Object.entries(PALETTE).map(([name, hex]) => [name, parseInt(hex.slice(1), 16)])
);

/**
 * Typefaces, bundled with the game in main.js. The same as the menu screens:
 * Cinzel for titles, numbers and labels, Alegreya Sans for sentences.
 */
export const FONT = {
  display: 'Cinzel, Georgia, serif',
  text: '"Alegreya Sans", system-ui, sans-serif'
};
