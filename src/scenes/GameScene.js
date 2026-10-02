import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/layout.js';
import { PALETTE } from '../config/palette.js';

/**
 * GameScene orchestrates the gameplay. It wires input, rune recognition,
 * enemies, effects and the HUD together, but leaves the details of each to
 * its own module so this file reads like a summary of the rules.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'STORMRUNE', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '72px',
        color: PALETTE.glow
      })
      .setOrigin(0.5);

    this.setupOrientationPause();
  }

  /**
   * The game is landscape-only. index.html covers the page with a "rotate
   * your device" notice in portrait (pure CSS), and here we pause the scene
   * under exactly the same media query, so nothing happens behind the notice.
   */
  setupOrientationPause() {
    this.portraitQuery = window.matchMedia('(orientation: portrait)');
    const onOrientationChange = () => this.syncPause();

    // The media query covers every case, including a desktop window resized
    // to be taller than wide. Phaser's orientation event only follows the
    // physical screen, but it is a useful second trigger on phones.
    this.portraitQuery.addEventListener('change', onOrientationChange);
    this.scale.on(Phaser.Scale.Events.ORIENTATION_CHANGE, onOrientationChange);

    // Pausing from inside create() does not stick: Phaser marks the scene as
    // running right after create() returns. Apply the starting state once the
    // CREATE event fires instead.
    this.events.once(Phaser.Scenes.Events.CREATE, onOrientationChange);

    // These emitters outlive this scene, so detach from them on shutdown
    // (game over or restart); otherwise every restart would add listeners.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.portraitQuery.removeEventListener('change', onOrientationChange);
      this.scale.off(Phaser.Scale.Events.ORIENTATION_CHANGE, onOrientationChange);
    });
  }

  /** Pause in portrait, resume in landscape. Safe to call any number of times. */
  syncPause() {
    const portrait = this.portraitQuery.matches;

    if (portrait && !this.scene.isPaused()) {
      this.scene.pause();
    } else if (!portrait && this.scene.isPaused()) {
      this.scene.resume();
    }
  }

  /** Snapshot of the gameplay state for "?debug" browser tests. */
  getDebugState() {
    return {
      paused: this.scene.isPaused()
    };
  }
}
