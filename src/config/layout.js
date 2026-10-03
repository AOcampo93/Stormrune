import { SPRITES, BOAT_ANCHOR } from './sprites.js';

// Screen geometry shared by the scenes, the enemies and the HUD.
// The game is authored at a fixed 1280x720 and Phaser scales it to fit.

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/**
 * The stormy sea background ("Mar fondo" design) is 2000 units wide with its
 * horizon at y = 700. It is shown across the full width of the screen, so
 * the horizon lands at about y = 448. That is also where the longship's deck
 * lines meet, so the boat and the sea share one perspective.
 */
export const BACKGROUND_SCALE = GAME_WIDTH / 2000;
export const HORIZON_Y = Math.round(700 * BACKGROUND_SCALE); // 448

/**
 * The longship fills the bottom of the screen, seen from the stern. Thor
 * stands at its anchor, bottom center; everything else is placed from there.
 */
export const SHIP_X = GAME_WIDTH / 2;
export const SHIP_ANCHOR_Y = 694;

/** HUD elements stay this far from every edge (phone notches in landscape). */
export const SAFE_MARGIN = 40;

/**
 * Draugar wade in along these lanes, three on each side of the boat (the bow
 * and Thor fill the middle). Each one rises at `startX` on the horizon and
 * climbs aboard where the hull's top edge crosses `boardY`.
 */
export const LANES = [
  { side: 'port', startX: 100, boardY: 690 },
  { side: 'port', startX: 280, boardY: 625 },
  { side: 'port', startX: 440, boardY: 565 },
  { side: 'starboard', startX: 840, boardY: 565 },
  { side: 'starboard', startX: 1000, boardY: 625 },
  { side: 'starboard', startX: 1180, boardY: 690 }
];

/**
 * Lines of the hull on each side, in the boat design's units (taken from the
 * "Bote idle" design), each running from the bow down past the stern:
 *   gunwale    - the hull's outer top edge,
 *   hullBottom - where the outer side of the hull ends (the design's waterline),
 *   deckEdge   - where the inner wall meets the deck.
 */
export const HULL = {
  gunwale: { port: [[1288, 908], [-283.2, 2050]], starboard: [[1312, 908], [2883.2, 2050]] },
  hullBottom: { port: [[1278, 938], [-800, 2050]], starboard: [[1322, 938], [3400, 2050]] },
  deckEdge: { port: [[1300, 940], [611.8, 2050]], starboard: [[1300, 940], [1988.2, 2050]] }
};

/**
 * The point on the hull's top edge at screen height `y` on one side of the
 * boat: where a draugr walking in on that side climbs aboard.
 */
export function gunwalePoint(side, y) {
  const scale = SPRITES.boat.scale;
  const [[x0, y0], [x1, y1]] = HULL.gunwale[side];
  const designY = BOAT_ANCHOR[1] + (y - SHIP_ANCHOR_Y) / scale;
  const designX = x0 + ((designY - y0) / (y1 - y0)) * (x1 - x0);
  return { x: SHIP_X + (designX - BOAT_ANCHOR[0]) * scale, y };
}

/**
 * Draw order, from back to front. Enemies add their y position to
 * DEPTH.enemies so the nearer ones (larger y) cover the ones behind them.
 * They stay behind the ship, whose hull hides them as they climb aboard.
 */
export const DEPTH = {
  background: 0,
  enemies: 100, // + y, so up to ~800
  ship: 1100, // the longship with Thor on deck
  shipWater: 1110, // the sea against the hull and the spray over it
  rain: 1200,
  effects: 1300,
  runePanels: 1400, // + a fraction of y, so nearer queues sit on top
  trail: 1500,
  hud: 1600,
  banner: 1700,
  vignette: 1800
};
