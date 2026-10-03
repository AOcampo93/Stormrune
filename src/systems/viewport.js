/**
 * Keeps the game fitted to the part of the page that is actually visible.
 *
 * On phones that area changes as the browser's bars show and hide. Right
 * after the phone turns, some browsers (Safari on iPhone) still report the
 * old size for a moment. So the game measures again on every change of the
 * visible area, and twice more shortly after the phone turns. It also
 * stops the page itself from being zoomed or scrolled, either of which
 * would push part of the game off screen.
 */
export function keepGameInView(game) {
  const refit = () => {
    window.scrollTo(0, 0);
    // The scale manager has nothing to measure until the game has started.
    if (game.isBooted) {
      game.scale.refresh();
    }
  };
  const refitNowAndSoon = () => {
    refit();
    setTimeout(refit, 250);
    setTimeout(refit, 700);
  };

  window.visualViewport?.addEventListener('resize', refitNowAndSoon);
  window.addEventListener('orientationchange', refitNowAndSoon);
  window.addEventListener('resize', refitNowAndSoon);

  // Safari's pinch-to-zoom gesture; touch-action stops it in other browsers.
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
}
