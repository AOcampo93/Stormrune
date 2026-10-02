// Difficulty table, one entry per level. To clear a level the player must
// destroy `enemiesToClear` draugar. Later levels spawn them more often
// (`spawnDelayMs`), make them walk faster (`speed` multiplies the base
// approach speed) and give them longer rune queues (1 to `maxQueue` runes).

export const LEVELS = [
  { enemiesToClear: 5,  spawnDelayMs: 2200, speed: 1.0, maxQueue: 1 },
  { enemiesToClear: 7,  spawnDelayMs: 1800, speed: 1.3, maxQueue: 2 },
  { enemiesToClear: 9,  spawnDelayMs: 1500, speed: 1.6, maxQueue: 2 },
  { enemiesToClear: 11, spawnDelayMs: 1200, speed: 1.9, maxQueue: 3 },
  { enemiesToClear: 13, spawnDelayMs: 1000, speed: 2.2, maxQueue: 3 }
];

/** Past the table, every extra level is about 10% harder than the last... */
const GROWTH_PER_LEVEL = 1.1;

/** ...but never faster than a person can possibly keep up with. */
const MIN_SPAWN_DELAY_MS = 700;
const MAX_SPEED = 3;

/**
 * Settings for any level (1-based). Levels beyond the table keep scaling the
 * last entry, so the game is endless.
 *
 * @param {number} level
 * @returns {{enemiesToClear: number, spawnDelayMs: number, speed: number, maxQueue: number}}
 */
export function getLevelConfig(level) {
  if (level <= LEVELS.length) {
    return { ...LEVELS[level - 1] };
  }

  const last = LEVELS[LEVELS.length - 1];
  const growth = GROWTH_PER_LEVEL ** (level - LEVELS.length);

  return {
    enemiesToClear: Math.round(last.enemiesToClear * growth),
    spawnDelayMs: Math.max(MIN_SPAWN_DELAY_MS, Math.round(last.spawnDelayMs / growth)),
    speed: Math.min(MAX_SPEED, last.speed * growth),
    maxQueue: last.maxQueue
  };
}
