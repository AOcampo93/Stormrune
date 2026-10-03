/**
 * Full screen, where the browser allows it: desktop browsers, Android and
 * iPad. Safari on iPhone can't put a page in full screen; there the game is
 * played full screen from the home screen instead (see manifest.webmanifest).
 *
 * Browsers only grant full screen in response to a tap, click or key press,
 * so these functions must be called from one. Phaser's own startFullscreen()
 * leaves a refusal unhandled (an error in the console), so the standard API
 * is used directly; Phaser still notices the change and rescales the game.
 */

const root = document.documentElement;
const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
const exit = document.exitFullscreen ?? document.webkitExitFullscreen;

export const fullscreen = {
  /** Whether this browser can put the page in full screen. */
  get available() {
    return typeof request === 'function' && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true);
  },

  get active() {
    return Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
  },

  /** Enters full screen and, where allowed (Android), locks landscape. */
  enter() {
    if (!this.available || this.active) {
      return;
    }
    // Older Safari returns nothing instead of a promise.
    Promise.resolve(request.call(root, { navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {}); // refused: the game simply keeps playing in the page
  },

  leave() {
    if (this.active) {
      Promise.resolve(exit.call(document)).catch(() => {});
    }
  },

  toggle() {
    if (this.active) {
      this.leave();
    } else {
      this.enter();
    }
  },

  /** Calls `listener` whenever the page enters or leaves full screen; returns a remover. */
  onChange(listener) {
    const events = ['fullscreenchange', 'webkitfullscreenchange'];
    events.forEach((type) => document.addEventListener(type, listener));
    return () => events.forEach((type) => document.removeEventListener(type, listener));
  }
};

/**
 * On phones and tablets the game is much bigger in full screen, so it goes
 * full screen when play starts there. Mouse users keep their window.
 */
export function enterFullscreenOnTouch() {
  if (window.matchMedia('(pointer: coarse)').matches) {
    fullscreen.enter();
  }
}
