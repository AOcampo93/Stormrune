import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, HORIZON_Y, SHIP_X, SAFE_MARGIN, DEPTH } from '../config/layout.js';
import { PALETTE, COLOR } from '../config/palette.js';
import { StrokeInput } from '../systems/StrokeInput.js';
import { RuneRecognizer } from '../systems/RuneRecognizer.js';
import { RUNE_IDS, RUNE_NAMES } from '../systems/runeTemplates.js';
import { Lightning } from '../systems/Lightning.js';
import { Draugr } from '../entities/Draugr.js';
import { Hud } from '../ui/Hud.js';

/**
 * Draugar rise in one of these lanes (x on the horizon). Spreading them out
 * keeps their rune panels from piling on top of each other.
 */
const LANES = [220, 388, 556, 724, 892, 1060];
const LANE_JITTER = 30;

/** Points for each draugr destroyed. */
const KILL_SCORE = 100;

/** Draugar that may board the ship before the game is lost. */
const STARTING_LIVES = 3;

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
    this.score = 0;
    this.lives = STARTING_LIVES;
    this.level = 1;
    this.isGameOver = false;

    // Counters for "?debug" checks.
    this.strokesHandled = 0;
    this.castCount = 0;
    this.lastRecognition = null;
  }

  create() {
    this.debug = this.registry.get('debug');
    // Players who ask their system for less motion get no flashes or shakes.
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.createBackground();
    this.add.image(SHIP_X, GAME_HEIGHT, 'ship').setOrigin(0.5, 1).setDepth(DEPTH.ship);
    this.createEffects();
    this.hud = new Hud(this, { lives: this.lives, score: this.score, level: this.level });

    // Red edges flashed when a draugr boards the ship (see loseLife()).
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0, 0).setAlpha(0).setDepth(DEPTH.vignette);

    if (this.debug) {
      this.readout = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - SAFE_MARGIN, '', {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: PALETTE.white,
          backgroundColor: 'rgba(10, 18, 30, 0.6)'
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.hud);
    }

    this.recognizer = new RuneRecognizer();
    this.lightning = new Lightning(this);
    this.strokeInput = new StrokeInput(this, (points) => this.handleStroke(points));
    this.setupOrientationPause();

    this.spawnTimer = this.time.addEvent({ delay: 2200, loop: true, callback: this.spawnDraugr, callbackScope: this });
    this.spawnDraugr();

    this.cameras.main.fadeIn(400);
  }

  update(time, delta) {
    // Once the game is lost everything freezes while the screen fades out.
    if (this.isGameOver) {
      return;
    }

    for (const draugr of this.draugar) {
      draugr.update(delta);
    }

    // A draugr that reaches the ship boards it: the player loses a life.
    for (const draugr of this.draugar.filter((d) => d.hasReachedShip)) {
      this.removeDraugr(draugr);
      draugr.destroy();
      this.loseLife();
    }
  }

  /** A simple sky and sea until the painted backgrounds arrive. */
  createBackground() {
    this.add
      .rectangle(0, HORIZON_Y, GAME_WIDTH, GAME_HEIGHT - HORIZON_Y, COLOR.seaBack)
      .setOrigin(0, 0)
      .setDepth(DEPTH.seaBack);
  }

  /**
   * One particle emitter per kind of effect, created once and fired with
   * explode() whenever needed (never one emitter per hit).
   */
  createEffects() {
    // Bright sparks where lightning lands.
    this.sparks = this.add
      .particles(0, 0, 'spark', {
        emitting: false,
        speed: { min: 80, max: 340 },
        lifespan: { min: 220, max: 520 },
        scale: { start: 1, end: 0 },
        tint: [COLOR.white, COLOR.glow, COLOR.glow],
        blendMode: 'ADD'
      })
      .setDepth(DEPTH.effects);

    // A bigger, slower burst when a draugr is destroyed.
    this.burst = this.add
      .particles(0, 0, 'spark', {
        emitting: false,
        speed: { min: 40, max: 260 },
        lifespan: { min: 400, max: 900 },
        scale: { start: 1.8, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [COLOR.glow, COLOR.white, COLOR.accent],
        blendMode: 'ADD'
      })
      .setDepth(DEPTH.effects);

    // A grey puff of smoke for a stroke that was not a rune.
    this.fizzleSmoke = this.add
      .particles(0, 0, 'puff', {
        emitting: false,
        speed: { min: 15, max: 70 },
        lifespan: { min: 350, max: 650 },
        scale: { start: 0.6, end: 1.6 },
        alpha: { start: 0.7, end: 0 },
        tint: COLOR.ash
      })
      .setDepth(DEPTH.effects);
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
    const end = points[points.length - 1];

    const rune = this.recognizer.recognize(points);
    this.lastRecognition = rune;
    this.showReadout(points, rune);

    if (rune) {
      this.castRune(rune.name, end);
    } else {
      // Not a rune: a harmless puff of smoke. A misread never hurts the player.
      this.fizzleSmoke.explode(8, end.x, end.y);
    }
  }

  /**
   * A recognized rune strikes every draugr whose queue starts with it, so
   * one well-drawn rune can hit several enemies at once.
   */
  castRune(runeId, end) {
    const targets = this.draugar.filter((d) => d.nextRune === runeId);

    if (targets.length === 0) {
      // Read correctly, but nobody needed that rune right now.
      this.sparks.explode(6, end.x, end.y);
      return;
    }

    this.castCount += 1;
    this.flashCamera();

    for (const draugr of targets) {
      const hit = draugr.hitPoint;
      this.lightning.strike({ x: hit.x + Phaser.Math.Between(-120, 120), y: -10 }, hit);
      this.sparks.explode(14, hit.x, hit.y);
      draugr.flash();

      if (draugr.removeFirstRune()) {
        this.killDraugr(draugr);
      }
    }
  }

  /** The queue is empty: the draugr crumbles and the player scores. */
  killDraugr(draugr) {
    // Out of the list right away, so it can't be hit or counted twice while
    // its death animation plays.
    this.removeDraugr(draugr);

    const { x, y } = draugr.hitPoint;
    this.burst.explode(28, x, y);
    draugr.die();
    this.addScore(KILL_SCORE, x, y);
  }

  addScore(points, x, y) {
    this.score += points;
    this.hud.setScore(this.score);

    // A "+100" that floats up from the kill and fades.
    const popup = this.add
      .text(x, y - 20, `+${points}`, {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '28px',
        color: PALETTE.accent
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.effects);
    this.tweens.add({
      targets: popup,
      y: popup.y - 60,
      alpha: 0,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => popup.destroy()
    });
  }

  /** A draugr boarded the ship: shake, flash red, and maybe end the game. */
  loseLife() {
    // Several draugar can board in the same frame; only the first one that
    // empties the lives counts.
    if (this.isGameOver) {
      return;
    }

    this.lives -= 1;
    this.hud.setLives(this.lives);

    if (!this.reducedMotion) {
      this.cameras.main.shake(300, 0.012);
    }
    this.tweens.killTweensOf(this.vignette);
    this.vignette.setAlpha(1);
    this.tweens.add({ targets: this.vignette, alpha: 0, duration: 700, ease: 'Quad.easeOut' });

    if (this.lives <= 0) {
      this.gameOver();
    }
  }

  /** Stops play, fades to black, then shows the final score. */
  gameOver() {
    this.isGameOver = true;
    this.strokeInput.setEnabled(false);
    this.spawnTimer.remove();

    const camera = this.cameras.main;
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GameOverScene', { score: this.score, level: this.level });
    });
    camera.fadeOut(900, 0, 0, 0);
  }

  /**
   * One short, soft cyan flash per cast, however many draugar it hits.
   * The flash starts at 30% opacity instead of a full-screen white frame.
   */
  flashCamera() {
    if (this.reducedMotion) {
      return;
    }
    const camera = this.cameras.main;
    camera.flashEffect.alpha = 0.3;
    camera.flash(100, 0, 229, 255);
  }

  /** "?debug" only: what the recognizer made of the last stroke. */
  showReadout(points, rune) {
    if (!this.readout) {
      return;
    }
    if (rune) {
      this.readout.setText(` ${RUNE_NAMES[rune.name]} · ${rune.score.toFixed(2)} `);
    } else {
      const best = this.recognizer.bestMatch(points);
      this.readout.setText(best ? ` fizzle (closest: ${best.name} ${best.score.toFixed(2)}) ` : ' fizzle ');
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
      score: this.score,
      lives: this.lives,
      level: this.level,
      gameOver: this.isGameOver,
      strokesHandled: this.strokesHandled,
      castCount: this.castCount,
      lastRecognition: this.lastRecognition,
      spawned: this.spawnCount,
      alive: this.draugar.length,
      draugar: this.draugar.map((d) => ({
        x: Math.round(d.body.x),
        y: Math.round(d.groundY),
        queue: [...d.runeQueue]
      }))
    };
  }
}
