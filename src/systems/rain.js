import { GAME_WIDTH, DEPTH } from '../config/layout.js';

/**
 * Slanted rain over the whole screen: streaks spawn above it and are tilted
 * to match their sideways drift. Used by the game and the menu screens.
 */
export function addRain(scene) {
  return scene.add
    .particles(0, -30, 'raindrop', {
      x: { min: -100, max: GAME_WIDTH + 250 },
      speedX: { min: -260, max: -200 },
      speedY: { min: 900, max: 1200 },
      rotate: 12,
      lifespan: 900,
      frequency: 16,
      quantity: 2,
      scale: { min: 0.6, max: 1.1 },
      alpha: { min: 0.12, max: 0.35 }
    })
    .setDepth(DEPTH.rain);
}
