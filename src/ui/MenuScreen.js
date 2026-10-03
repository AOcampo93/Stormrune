import { GAME_WIDTH, GAME_HEIGHT } from '../config/layout.js';
import { addRain } from '../systems/rain.js';

/** The menu screens are laid out on a stage this wide, like their designs. */
const STAGE_WIDTH = 1920;

/**
 * A menu screen (How to Play, About, Game Over): the artwork from its design
 * on the canvas, rain falling over it, and the text and buttons as HTML on
 * top. The HTML is styled by screens.css; Phaser keeps it scaled and placed
 * over the canvas as the window changes size.
 *
 * Buttons are plain <button data-action="name"> elements; `actions` says
 * what each name does. Every action leaves the screen, so only the first
 * one counts.
 */
export class MenuScreen {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} options
   * @param {string} options.backdrop Texture key of the screen's artwork.
   * @param {string} options.html The screen's content.
   * @param {Record<string, () => void>} options.actions What each button does.
   * @param {Record<string, string>} [options.keys] Keyboard shortcuts, e.g. { ENTER: 'begin' }.
   * @param {number} [options.inputDelayMs] Buttons ignore input this long at first, so a
   *   finger lifted from the last stroke of a game can't press one by accident.
   */
  constructor(scene, { backdrop, html, actions, keys = {}, inputDelayMs = 0 }) {
    this.actions = actions;
    this.done = false;
    this.ready = inputDelayMs === 0;

    scene.add.image(0, 0, backdrop).setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    addRain(scene);

    this.node = document.createElement('div');
    this.node.className = 'screen';
    this.node.innerHTML = html;
    scene.add.dom(0, 0, this.node).setOrigin(0, 0).setScale(GAME_WIDTH / STAGE_WIDTH);

    this.node.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (button) {
        this.run(button.dataset.action);
      }
    });
    for (const [key, action] of Object.entries(keys)) {
      scene.input.keyboard?.on(`keydown-${key}`, () => this.run(action));
    }

    if (!this.ready) {
      this.node.classList.add('is-waiting');
      scene.time.delayedCall(inputDelayMs, () => {
        this.ready = true;
        this.node.classList.remove('is-waiting');
      });
    }

    scene.cameras.main.fadeIn(400);
  }

  run(action) {
    if (!this.ready || this.done || !this.actions[action]) {
      return;
    }
    this.done = true;
    this.actions[action]();
  }
}
