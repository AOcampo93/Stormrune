import Phaser from 'phaser';

/** How long to wait for lost graphics to come back before reloading (ms). */
const RESTORE_WAIT_MS = 3000;

/**
 * A phone can take the GPU away from a page, for example while another app
 * runs. Phaser rebuilds everything when the browser hands the graphics
 * context back. If the browser never does, the game would stay frozen on
 * its last frame, so the page reloads instead.
 */
export function reloadIfGraphicsStayLost(game) {
  game.events.once(Phaser.Core.Events.READY, () => {
    // Only the WebGL renderer can lose its context.
    if (game.renderer.type !== Phaser.WEBGL) {
      return;
    }
    let reload = null;
    game.renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, () => {
      reload = setTimeout(() => window.location.reload(), RESTORE_WAIT_MS);
    });
    game.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => clearTimeout(reload));
  });
}
