import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './config/layout.js';
import { PALETTE } from './config/palette.js';

// Adding "?debug" to the URL turns on developer aids: an on-screen readout of
// what the rune recognizer saw, and a read-only state snapshot that automated
// browser tests can query. Players never see either.
const DEBUG = new URLSearchParams(window.location.search).has('debug');

const config = {
  type: Phaser.AUTO, // WebGL when available, Canvas as a fallback
  parent: 'game', // the <div id="game"> in index.html
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: PALETTE.skyTop,
  scale: {
    // Keep the 16:9 design resolution and letterbox whatever is left over,
    // so the same layout works on a monitor and on a phone in landscape.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, GameScene, GameOverScene]
};

const game = new Phaser.Game(config);

// The registry is shared by every scene, so they can all check the flag.
game.registry.set('debug', DEBUG);

if (DEBUG) {
  window.__stormrune = {
    /** A fresh copy of the gameplay state each time it is read. */
    get state() {
      const gameScene = game.scene.getScene('GameScene');
      return {
        activeScenes: game.scene.getScenes(true).map((scene) => scene.scene.key),
        ...(gameScene?.getDebugState?.() ?? {})
      };
    }
  };
}
