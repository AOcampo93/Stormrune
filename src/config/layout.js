// Screen geometry shared by the scenes, the enemies and the HUD.
// The game is authored at a fixed 1280x720 and Phaser scales it to fit.

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** Where the sea meets the sky. Draugar rise out of the waves here. */
export const HORIZON_Y = Math.round(GAME_HEIGHT * 0.45); // 324

/** The longship sits at the bottom center and never moves. */
export const SHIP_X = GAME_WIDTH / 2;

/** When a draugr's feet reach this line it has boarded the ship. */
export const SHIP_LINE_Y = 640;

/** HUD elements stay this far from every edge (phone notches in landscape). */
export const SAFE_MARGIN = 40;

/**
 * Draw order, from back to front. Enemies add their y position to
 * DEPTH.enemies so the nearer ones (larger y) cover the ones behind them.
 */
export const DEPTH = {
  sky: 0,
  seaBack: 10,
  enemies: 100, // + y, so up to ~740
  seaFront: 1000,
  ship: 1100,
  rain: 1200,
  effects: 1300,
  runePanels: 1400, // + a fraction of y, so nearer queues sit on top
  trail: 1500,
  hud: 1600,
  banner: 1700,
  vignette: 1800
};
