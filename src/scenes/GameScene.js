import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, HORIZON_Y, BACKGROUND_SCALE, SAFE_MARGIN, DEPTH, LANES, gunwalePoint } from '../config/layout.js';
import { SPRITES } from '../config/sprites.js';
import { PALETTE, COLOR, FONT } from '../config/palette.js';
import { StrokeInput } from '../systems/StrokeInput.js';
import { RuneRecognizer } from '../systems/RuneRecognizer.js';
import { RUNE_IDS, RUNE_NAMES } from '../systems/runeTemplates.js';
import { Lightning } from '../systems/Lightning.js';
import { Draugr } from '../entities/Draugr.js';
import { Longship } from '../entities/Longship.js';
import { ShipWater } from '../entities/ShipWater.js';
import { CameraSpray } from '../entities/CameraSpray.js';
import { Thor } from '../entities/Thor.js';
import { Hud } from '../ui/Hud.js';
import { getLevelConfig } from '../config/levels.js';
import { firstTexture } from '../systems/spriteSheets.js';
import { addRain } from '../systems/rain.js';
import { fullscreen } from '../ui/fullscreen.js';

/**
 * Random spread (px) around a lane's start on the horizon and its boarding
 * height, so draugar in the same lane don't follow the exact same path.
 */
const LANE_JITTER_X = 30;
const LANE_JITTER_Y = 12;

/** Points for each draugr destroyed. */
const KILL_SCORE = 100;

/** Draugar that may board the ship before the game is lost. */
const STARTING_LIVES = 3;

/** Distant lightning over the sea every few seconds (ms, random in range). */
const AMBIENT_LIGHTNING_MS = { min: 5000, max: 11000 };

/** Thor's lightning shakes the screen: less than a draugr boarding does. */
const STRIKE_SHAKE = { duration: 200, intensity: 0.006 };

/** After coming back from the menu, ignore Escape this long (ms). */
const WAKE_KEY_GRACE_MS = 300;
const BOARDING_SHAKE = { duration: 300, intensity: 0.012 };

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
    this.levelConfig = getLevelConfig(1);
    this.kills = 0; // draugar destroyed in the current level
    this.isLevelTransition = true; // true while the LEVEL banner shows
    this.isGameOver = false;
    this.pausedForPortrait = false;
    this.spawnTimer = null;

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

    // Thor rides inside the longship's container, so he rocks with the deck.
    this.longship = new Longship(this);
    // Waves breaking over the boat, the pool on deck and splashes against the hull.
    this.shipWater = new ShipWater(this, this.longship);
    this.thor = new Thor(this);
    this.longship.carry(this.thor.sprite);
    // Spray thrown up at the camera from the bottom corners.
    this.cameraSpray = new CameraSpray(this, this.longship);
    this.createEffects();
    this.hud = new Hud(
      this,
      { lives: this.lives, score: this.score, level: this.level },
      { onMenu: () => this.openMenu(), onFullscreenHelp: () => this.openMenu('fullscreen-help') }
    );

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
    // F switches full screen on and off, Escape opens the menu (the HUD has
    // buttons for both too).
    this.input.keyboard?.on('keydown-F', () => fullscreen.toggle());
    this.input.keyboard?.on('keydown-ESC', () => {
      // Escape also resumes from the menu; the same key press must not reach
      // the game it just woke and send it straight back.
      if (performance.now() - this.wokeAt > WAKE_KEY_GRACE_MS) {
        this.openMenu();
      }
    });
    this.wokeAt = 0;
    const onWake = () => (this.wokeAt = performance.now());
    this.events.on(Phaser.Scenes.Events.WAKE, onWake);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.WAKE, onWake));
    this.setupOrientationPause();

    this.cameras.main.fadeIn(400);
    this.scheduleAmbientLightning();
    this.startLevel(1);
  }

  update(time, delta) {
    this.longship.update(delta);
    this.shipWater.update(delta);
    this.cameraSpray.update();

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

  /**
   * The stormy sea (sky, waves and the giant in the mist) is one animated
   * sprite looping 16 frames across the whole screen. Its sheets are half
   * the on-screen size, so it is scaled up to fill the width.
   * Rain falls over everything except effects and HUD.
   */
  createBackground() {
    this.add
      .sprite(0, 0, firstTexture('sea'))
      .setOrigin(0, 0)
      .setScale(BACKGROUND_SCALE / SPRITES.sea.scale)
      .setDepth(DEPTH.background)
      .play('sea:loop');

    // A soft light that briefly washes over the scene with distant lightning.
    this.skyFlash = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, COLOR.glow)
      .setOrigin(0, 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setDepth(DEPTH.background);

    addRain(this);
  }

  /**
   * Now and then lightning strikes the sea far away, with a faint flash of
   * the sky that also lights up the longship. It is thinner and dimmer than
   * the player's strikes, and it never touches a draugr, so it can't be
   * mistaken for a hit.
   */
  scheduleAmbientLightning() {
    this.time.delayedCall(Phaser.Math.Between(AMBIENT_LIGHTNING_MS.min, AMBIENT_LIGHTNING_MS.max), () => {
      const x = Phaser.Math.Between(60, GAME_WIDTH - 60);
      this.lightning.strike(
        { x: x + Phaser.Math.Between(-80, 80), y: -10 },
        { x, y: HORIZON_Y - Phaser.Math.Between(0, 30) },
        { thickness: 0.45, alpha: 0.35, depth: DEPTH.background }
      );
      if (!this.reducedMotion) {
        this.skyFlash.setAlpha(0.14);
        this.tweens.add({ targets: this.skyFlash, alpha: 0, duration: 450, ease: 'Quad.easeOut' });
        this.longship.lightUp();
      }
      this.scheduleAmbientLightning();
    });
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

  /**
   * Shows the LEVEL banner, then starts spawning with that level's settings.
   * A level is cleared by destroying `enemiesToClear` draugar.
   */
  startLevel(level) {
    this.level = level;
    this.levelConfig = getLevelConfig(level);
    this.kills = 0;
    this.isLevelTransition = true;
    this.hud.setLevel(level);

    this.showLevelBanner(level, () => {
      this.isLevelTransition = false;
      this.spawnDraugr(); // the first draugr rises right after the banner
      this.spawnTimer = this.time.addEvent({
        delay: this.levelConfig.spawnDelayMs,
        loop: true,
        callback: this.spawnDraugr,
        callbackScope: this
      });
    });
  }

  /** All draugar of this level are destroyed: on to the next one. */
  completeLevel() {
    // A single cast can destroy several draugar; only advance once.
    if (this.isLevelTransition) {
      return;
    }
    this.isLevelTransition = true;
    this.spawnTimer.remove();

    // Let the last death animation play before the next banner.
    this.time.delayedCall(700, () => this.startLevel(this.level + 1));
  }

  /** "LEVEL N" grows in, holds, then fades away and calls `onDone`. */
  showLevelBanner(level, onDone) {
    const items = [
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.36, `LEVEL ${level}`, {
          fontFamily: FONT.display,
          fontStyle: '900',
          fontSize: '96px',
          color: PALETTE.frost,
          stroke: PALETTE.silhouette,
          strokeThickness: 10,
          // Room for the glow, which would otherwise be cut off at the text's edges.
          padding: { x: 36, y: 36 }
        })
        .setShadow(0, 0, PALETTE.frostGlow, 30, true, true)
        .setOrigin(0.5)
    ];

    // A one-line hint the very first time, since there is no tutorial.
    if (level === 1) {
      items.push(
        this.add
          .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.36 + 80, 'Draw the glowing rune above a draugr to strike it', {
            fontFamily: FONT.text,
            fontStyle: '500',
            fontSize: '32px',
            color: PALETTE.white,
            stroke: PALETTE.silhouette,
            strokeThickness: 6
          })
          .setOrigin(0.5)
      );
    }

    for (const item of items) {
      item.setDepth(DEPTH.banner).setAlpha(0).setScale(0.7);
    }

    this.tweens.chain({
      targets: items,
      tweens: [
        { alpha: 1, scale: 1, duration: 350, ease: 'Back.easeOut' },
        { alpha: 0, scale: 1.1, duration: 350, ease: 'Quad.easeIn', delay: level === 1 ? 1600 : 800 }
      ],
      onComplete: () => {
        items.forEach((item) => item.destroy());
        onDone();
      }
    });
  }

  /**
   * Raises a new draugr from the waves with a random rune queue. Only as
   * many draugar exist as are still needed to clear the level, so one that
   * boards the ship is replaced and each level ends with an empty sea.
   */
  spawnDraugr() {
    const { enemiesToClear, maxQueue, speed } = this.levelConfig;
    if (this.isLevelTransition || this.kills + this.draugar.length >= enemiesToClear) {
      return;
    }

    const queueLength = Phaser.Math.Between(1, maxQueue);
    const runeQueue = Array.from({ length: queueLength }, () => Phaser.Utils.Array.GetRandom(RUNE_IDS));

    const lane = this.pickLane();
    const startX = lane.startX + Phaser.Math.Between(-LANE_JITTER_X, LANE_JITTER_X);
    const board = gunwalePoint(lane.side, lane.boardY + Phaser.Math.Between(-LANE_JITTER_Y, LANE_JITTER_Y));

    this.draugar.push(new Draugr(this, { startX, board, runeQueue, speed }));
  }

  /** The least recently used lane, so consecutive draugar never share one. */
  pickLane() {
    const oldest = Math.min(...this.laneLastUsed);
    const candidates = LANES.map((_, i) => i).filter((i) => this.laneLastUsed[i] === oldest);
    const lane = Phaser.Utils.Array.GetRandom(candidates);

    this.laneLastUsed[lane] = this.spawnCount;
    this.spawnCount += 1;
    return LANES[lane];
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
    this.strikeCamera();
    this.thor.attack(runeId);

    for (const draugr of targets) {
      const hit = draugr.hitPoint;
      this.lightning.strike({ x: hit.x + Phaser.Math.Between(-120, 120), y: -10 }, hit);
      this.sparks.explode(14, hit.x, hit.y);

      // A survivor flashes white; a destroyed one plays its own death instead.
      if (draugr.removeFirstRune()) {
        this.killDraugr(draugr);
      } else {
        draugr.flash();
      }
    }
  }

  /** The queue is empty: the draugr crumbles and the player scores. */
  killDraugr(draugr) {
    // Out of the list right away, so it can't be hit or counted twice while
    // its death animation plays.
    this.removeDraugr(draugr);

    const { x, y } = draugr.hitPoint;
    this.burst.explode(12, x, y);
    draugr.die();
    this.addScore(KILL_SCORE, x, y);

    this.kills += 1;
    if (this.kills >= this.levelConfig.enemiesToClear) {
      this.completeLevel();
    }
  }

  addScore(points, x, y) {
    this.score += points;
    this.hud.setScore(this.score);

    // A "+100" that floats up from the kill and fades.
    const popup = this.add
      .text(x, y - 20, `+${points}`, {
        fontFamily: FONT.display,
        fontStyle: '700',
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
    if (this.lives > 0) {
      this.thor.hurt();
    }

    if (!this.reducedMotion) {
      this.cameras.main.shake(BOARDING_SHAKE.duration, BOARDING_SHAKE.intensity);
    }
    this.tweens.killTweensOf(this.vignette);
    this.vignette.setAlpha(1);
    this.tweens.add({ targets: this.vignette, alpha: 0, duration: 700, ease: 'Quad.easeOut' });

    if (this.lives <= 0) {
      this.gameOver();
    }
  }

  /** Stops play; Thor falls, then the screen fades to the final score. */
  gameOver() {
    this.isGameOver = true;
    this.strokeInput.setEnabled(false);
    this.spawnTimer?.remove();

    this.thor.die(() => {
      const camera = this.cameras.main;
      camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('GameOverScene', { score: this.score, level: this.level });
      });
      camera.fadeOut(700, 0, 0, 0);
    });
  }

  /**
   * Thor's lightning lands: the screen shakes and flashes a soft cyan, once
   * per cast however many draugar it hits. The flash starts at 30% opacity
   * instead of a full-screen white frame.
   */
  strikeCamera() {
    if (this.reducedMotion) {
      return;
    }
    const camera = this.cameras.main;
    camera.shake(STRIKE_SHAKE.duration, STRIKE_SHAKE.intensity);
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
    // Any resize checks again too, in case a phone's orientation events
    // arrived out of order and left the game paused in landscape.
    this.scale.on(Phaser.Scale.Events.RESIZE, onOrientationChange);
    // Back from the menu: the phone may have turned in the meantime.
    this.events.on(Phaser.Scenes.Events.WAKE, onOrientationChange);

    // Pausing from inside create() does not stick: Phaser marks the scene as
    // running right after create() returns. Apply the starting state once the
    // CREATE event fires instead.
    this.events.once(Phaser.Scenes.Events.CREATE, onOrientationChange);

    // These emitters outlive this scene, so detach from them on shutdown
    // (game over or restart); otherwise every restart would add listeners.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.portraitQuery.removeEventListener('change', onOrientationChange);
      this.scale.off(Phaser.Scale.Events.ORIENTATION_CHANGE, onOrientationChange);
      this.scale.off(Phaser.Scale.Events.RESIZE, onOrientationChange);
      this.events.off(Phaser.Scenes.Events.WAKE, onOrientationChange);
    });
  }

  /**
   * Leaves the game for the menu without ending it. The scene sleeps (no
   * updates, no drawing, every timer and tween frozen) while How to Play
   * offers to resume it. `show` opens one of that screen's panels.
   */
  openMenu(show) {
    if (this.isGameOver) {
      return;
    }
    this.scene.sleep();
    this.scene.run('HowToPlayScene', { show });
  }

  /** Pause in portrait, resume in landscape. Safe to call any number of times. */
  syncPause() {
    // A game left for the menu stays asleep whatever the orientation.
    if (this.scene.isSleeping()) {
      return;
    }
    // Phaser queues pause and resume until its next step, and a phone
    // turning sends several resize events before then, so remember what
    // was asked for rather than ask again.
    const portrait = this.portraitQuery.matches;
    if (portrait === this.pausedForPortrait) {
      return;
    }
    this.pausedForPortrait = portrait;
    if (portrait) {
      this.scene.pause();
    } else {
      this.scene.resume();
    }
  }


  /** Snapshot of the gameplay state for "?debug" browser tests. */
  getDebugState() {
    return {
      fps: Math.round(this.game.loop.actualFps),
      wavesAboard: this.shipWater.wavesAboard,
      cameraSplashes: this.cameraSpray.splashes,
      // The camera is gone once the scene has shut down (game over).
      shaking: this.cameras.main?.shakeEffect.isRunning ?? false,
      paused: this.scene.isPaused(),
      score: this.score,
      lives: this.lives,
      level: this.level,
      levelConfig: this.levelConfig,
      kills: this.kills,
      inTransition: this.isLevelTransition,
      gameOver: this.isGameOver,
      thor: this.thor.current,
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
