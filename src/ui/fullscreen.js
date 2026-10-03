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

/** iPhone, iPod or iPad (iPads also call themselves Macs, but with touch). */
const IOS = /iPhone|iPod|iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const fullscreen = {
  /** Whether this browser can put the page in full screen. */
  get available() {
    return typeof request === 'function' && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true);
  },

  get active() {
    return Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
  },

  /** Opened from the home screen: the game already has the whole screen. */
  get installed() {
    return navigator.standalone === true || window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  },

  /**
   * Whether to show a full-screen button: wherever the browser can do it,
   * and on iPhone, where the button explains Add to Home Screen instead.
   */
  get offered() {
    return !this.installed && (this.available || IOS);
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

/**
 * The full-screen icon for the menu screens, as SVG: corner brackets that
 * point out (enter full screen) or, inside an element with class
 * "is-active", point in (leave it). The HUD draws the same shape with
 * Graphics.
 */
export function fullscreenIconSvg() {
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const bracket = (inward, [sx, sy]) => {
    const half = 15;
    const arm = 10;
    const cx = 20 + sx * (inward ? half - arm : half);
    const cy = 20 + sy * (inward ? half - arm : half);
    const toward = inward ? 1 : -1;
    return `M${cx + toward * sx * arm} ${cy} L${cx} ${cy} L${cx} ${cy + toward * sy * arm}`;
  };
  const path = (inward) => corners.map((corner) => bracket(inward, corner)).join(' ');
  return `<svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path class="icon-enter" d="${path(false)}"/>
    <path class="icon-leave" d="${path(true)}"/>
  </svg>`;
}
