import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, HORIZON_Y, SHIP_X, DEPTH } from '../config/layout.js';
import { PALETTE, COLOR } from '../config/palette.js';
import { StrokeInput } from '../systems/StrokeInput.js';
import { RuneRecognizer } from '../systems/RuneRecognizer.js';
import { RUNE_IDS, RUNE_NAMES } from '../systems/runeTemplates.js';
import { Draugr } from '../entities/Draugr.js';

/**
 * Draugar rise in one of these lanes (x on the horizon). Spreading them out
 * keeps their rune panels from piling on top of each other.
 */
const LANES = [220, 388, 556, 724, 892, 1060];
const LANE_JITTER = 30;

/**
 * GameScene orchestrates the gameplay. It wires input, rune recognition,
 * enemies, effects and the HUD together, but leaves the details of each to
 * its own module so this file reads like a summary of the rules.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  /**
   * Phaser reuses this scene object when the game restarts, so every piece of
   * gameplay state is reset here rather than in the constructor.
   */
  init() {
    this.draugar = [];
    this.laneLastUsed = LANES.map(() => -1);
    this.spawnCount = 0;
    this.strokesHandled = 0;
    this.lastRecognition = null;
  }

  create() {
    this.createBackground();
    this.add.image(SHIP_X, GAME_HEIGHT, 'ship').setOrigin(0.5, 1).setDepth(DEPTH.ship);

    this.readout = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, '', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: PALETTE.white
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    this.recognizer = new RuneRecognizer();
    this.strokeInput = new StrokeInput(this, (points) => this.handleStroke(points));
    this.setupOrientationPause();

    this.time.addEvent({ delay: 2200, loop: true, callback: this.spawnDraugr, callbackScope: this });
    this.spawnDraugr();
  }

  update(time, delta) {
    for (const draugr of this.draugar) {
      draugr.update(delta);
    }

    // Draugar that reach the ship leave the field.
    for (const draugr of this.draugar.filter((d) => d.hasReachedShip)) {
      this.removeDraugr(draugr);
      draugr.destroy();
    }
  }

  /** A simple sky and sea until the painted backgrounds arrive. */
  createBackground() {
    this.add
      .rectangle(0, HORIZON_Y, GAME_WIDTH, GAME_HEIGHT - HORIZON_Y, COLOR.seaBack)
      .setOrigin(0, 0)
      .setDepth(DEPTH.seaBack);
  }

  /** Raises a new draugr from the waves, carrying a random rune queue. */
  spawnDraugr() {
    const queueLength = Phaser.Math.Between(1, 2);
    const runeQueue = Array.from({ length: queueLength }, () => Phaser.Utils.Array.GetRandom(RUNE_IDS));

    this.draugar.push(new Draugr(this, { x: this.pickLaneX(), runeQueue, speed: 1 }));
  }

  /** The least recently used lane, so consecutive draugar never share one. */
  pickLaneX() {
    const oldest = Math.min(...this.laneLastUsed);
    const candidates = LANES.map((_, i) => i).filter((i) => this.laneLastUsed[i] === oldest);
    const lane = Phaser.Utils.Array.GetRandom(candidates);

    this.laneLastUsed[lane] = this.spawnCount;
    this.spawnCount += 1;
    return LANES[lane] + Phaser.Math.Between(-LANE_JITTER, LANE_JITTER);
  }

  /** Takes a draugr out of play (it can no longer be targeted or counted). */
  removeDraugr(draugr) {
    this.draugar = this.draugar.filter((d) => d !== draugr);
  }

  /** Called by StrokeInput with every finished stroke. */
  handleStroke(points) {
    this.strokesHandled += 1;

    const rune = this.recognizer.recognize(points);
    this.lastRecognition = rune;

    if (rune) {
      this.readout.setText(`${RUNE_NAMES[rune.name]} · ${rune.score.toFixed(2)}`);
    } else {
      const best = this.recognizer.bestMatch(points);
      this.readout.setText(best ? `fizzle (closest: ${best.name} ${best.score.toFixed(2)})` : 'fizzle');
    }
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
      paused: this.scene.isPaused(),
      strokesHandled: this.strokesHandled,
      lastRecognition: this.lastRecognition,
      alive: this.draugar.length,
      draugar: this.draugar.map((d) => ({
        x: Math.round(d.body.x),
        y: Math.round(d.groundY),
        queue: [...d.runeQueue]
      }))
    };
  }
}
