import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { HowToPlayScene } from './scenes/HowToPlayScene.js';
import { AboutScene } from './scenes/AboutScene.js';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './config/layout.js';
import { PALETTE } from './config/palette.js';
import { releaseStaleTouches } from './systems/staleTouches.js';
import { keepGameInView } from './systems/viewport.js';
import { reloadIfGraphicsStayLost } from './systems/recovery.js';
import { keepRunningAfterErrors, lastProblem } from './systems/problems.js';
import { tidyAddressBar } from './systems/updates.js';

// The typefaces of the menu screens and the HUD, bundled with the game
// (SIL Open Font License), and the screens' own styles.
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-900.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/noto-sans-runic/runic-400.css';
import './ui/screens.css';

// Adding "?debug" to the URL turns on developer aids: an on-screen readout of
// what the rune recognizer saw, and a read-only state snapshot that automated
// browser tests can query. Players never see either.
const DEBUG = new URLSearchParams(window.location.search).has('debug');

tidyAddressBar();

const config = {
  type: Phaser.AUTO, // WebGL when available, Canvas as a fallback
  parent: 'game', // the <div id="game"> in index.html
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: PALETTE.skyTop,
  render: {
    // Phaser 4 batches sprites with different textures by picking the
    // texture in the shader with an exact float comparison. Software
    // renderers (and some low-precision mobile GPUs) interpolate that index
    // slightly off, which drew parts of sprites as transparent holes. One
    // texture per batch skips that code; the extra draw calls are negligible
    // for a scene this size.
    maxTextures: 1
  },
  scale: {
    // Keep the 16:9 design resolution and letterbox whatever is left over,
    // so the same layout works on a monitor and on a phone in landscape.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  // The menu screens are HTML over the canvas; Phaser keeps that layer the
  // same size and place as the canvas.
  dom: { createContainer: true },
  input: {
    // Track up to four fingers. Holding a phone in landscape, a thumb or
    // palm often rests on the screen; with a single touch slot it would take
    // that slot and the finger that draws would be ignored.
    activePointers: 4
  },
  scene: [BootScene, HowToPlayScene, AboutScene, GameScene, GameOverScene]
};

const game = new Phaser.Game(config);
keepRunningAfterErrors(game);
releaseStaleTouches(game);
keepGameInView(game);
reloadIfGraphicsStayLost(game);

// The registry is shared by every scene, so they can all check the flag.
game.registry.set('debug', DEBUG);

if (DEBUG) {
  window.__stormrune = {
    /** A fresh copy of the gameplay state each time it is read. */
    get state() {
      const gameScene = game.scene.getScene('GameScene');
      return {
        // Counts every frame the game runs: it stops if the game loop dies.
        frame: game.loop.frame,
        activeScenes: game.scene.getScenes(true).map((scene) => scene.scene.key),
        // A game left for the menu sleeps until it is resumed.
        gameSleeping: game.scene.isSleeping('GameScene'),
        lastProblem: lastProblem(),
        // What the renderer holds on the GPU: counts that keep growing are a leak.
        gpu: game.renderer?.glTextureWrappers
          ? {
              textures: game.renderer.glTextureWrappers.length,
              framebuffers: game.renderer.glFramebufferWrappers.length,
              buffers: game.renderer.glBufferWrappers.length
            }
          : null,
        // Input slots: 0 is the mouse, the rest are fingers.
        pointers: game.input.pointers.map((p) => ({ id: p.id, active: p.active, down: p.isDown })),
        // The scene object exists from boot, but it has no gameplay state
        // until it starts for the first time (after the assets load).
        ...(gameScene?.draugar ? gameScene.getDebugState() : {})
      };
    },

    /** Makes the next `count` game frames fail, to check that the game survives them. */
    failFrames(count = 1) {
      let left = count;
      const fail = () => {
        left -= 1;
        if (left === 0) {
          game.events.off(Phaser.Core.Events.POST_STEP, fail);
        }
        throw new Error('A frame failed on purpose (debug)');
      };
      game.events.on(Phaser.Core.Events.POST_STEP, fail);
    }
  };
}
