/**
 * Phaser gives each finger on the screen one of a few input slots and frees
 * it when that touch ends. A touch whose end never reaches the page keeps
 * its slot forever. That happens when the touch began on a menu screen that
 * was removed while the finger was still down: the browser sends its end to
 * the removed element. With every slot taken, new touches are ignored and
 * the player can no longer draw.
 *
 * So, before each new touch, any slot still held by a finger that is no
 * longer on the screen is released. `touches` lists every finger that is
 * actually down. This listener runs in the capture phase, before Phaser
 * looks for a free slot.
 */
export function releaseStaleTouches(game) {
  window.addEventListener(
    'touchstart',
    (event) => {
      const onScreen = new Set([...event.touches].map((touch) => touch.identifier));
      // Slot 0 is the mouse; the rest are fingers.
      for (const pointer of game.input.pointers.slice(1)) {
        if (pointer.active && !onScreen.has(pointer.identifier)) {
          pointer.reset();
        }
      }
    },
    { capture: true, passive: true }
  );
}
