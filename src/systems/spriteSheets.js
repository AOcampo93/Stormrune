import { SPRITES } from '../config/sprites.js';

/**
 * Helpers for the sprite sheets exported by scripts/export-sprites.mjs
 * (described in src/config/sprites.js). A long animation may be split over
 * several sheet files ("parts"); these helpers hide that detail.
 */

/** Queues every exported sheet on a scene's loader. */
export function loadSpriteSheets(loader) {
  for (const sheet of Object.values(SPRITES)) {
    for (const part of sheet.parts) {
      if (sheet.frames === 1) {
        loader.image(part.key, part.url);
      } else {
        loader.spritesheet(part.key, part.url, {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
          spacing: sheet.spacing,
          // Without this Phaser would also add the empty cells of the last row.
          endFrame: part.frames - 1
        });
      }
    }
  }
}

/** Every frame of an animation, in order, across all of its sheets. */
export function sheetFrames(anims, key) {
  return SPRITES[key].parts.flatMap((part) => anims.generateFrameNumbers(part.key, { start: 0, end: part.frames - 1 }));
}

/** The texture of an animation's first frame, to create a sprite with. */
export function firstTexture(key) {
  return SPRITES[key].parts[0].key;
}
