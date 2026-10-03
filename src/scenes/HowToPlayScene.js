import Phaser from 'phaser';
import { MenuScreen } from '../ui/MenuScreen.js';
import { fullscreen, enterFullscreenOnTouch, fullscreenIconSvg } from '../ui/fullscreen.js';
import { queueGlyphs, traceGuide, tracingPicture, hammerIcon } from '../ui/runeArt.js';
import { RUNE_IDS, RUNE_NAMES } from '../systems/runeTemplates.js';
import { loadLatestVersion } from '../systems/updates.js';

/** What each rune stands for in the Elder Futhark, and how to trace it here. */
const RUNE_NOTES = {
  isa: { meaning: 'ice', stroke: 'One line, top to bottom' },
  sowilo: { meaning: 'the sun', stroke: 'Right, down-left, right' },
  tiwaz: { meaning: 'victory', stroke: 'Up-right, then down-right' }
};

/**
 * Safari on iPhone can't put a page in full screen, but a game added to the
 * home screen opens without the browser's bars. In the browser there, the
 * tip says how.
 */
const IPHONE_IN_BROWSER =
  /iPhone|iPod/.test(navigator.userAgent) &&
  !navigator.standalone &&
  !window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

const TIP = IPHONE_IN_BROWSER
  ? 'Tip: to play full screen on iPhone, tap Share, then Add to Home Screen.'
  : 'Tip: size and direction don’t matter, and a stroke that isn’t a rune never costs a hammer.';

/**
 * The main menu: the saga, the rules in four steps, and the three runes
 * with how to trace each one. "Begin" starts the game. When a game was left
 * for the menu (it sleeps behind it), "Resume" goes back to it and "New
 * Game" starts over. The gear opens the settings: the version running, and
 * a way to load the latest one.
 */
export class HowToPlayScene extends Phaser.Scene {
  constructor() {
    super('HowToPlayScene');
  }

  /** @param {{show?: string}} [data] A panel to open right away, e.g. 'fullscreen-help'. */
  init(data) {
    this.panelToOpen = data?.show;
  }

  create() {
    const gameInProgress = this.scene.isSleeping('GameScene');

    let screen = null;
    const panel = (name) => screen.node.querySelector(`.overlay[data-panel="${name}"]`);
    const openPanels = () => [...screen.node.querySelectorAll('.overlay.is-open')];
    const closePanels = () => openPanels().forEach((open) => open.classList.remove('is-open'));

    screen = new MenuScreen(this, {
      backdrop: 'screen:how-to-play',
      html: howToPlayHtml(gameInProgress),
      actions: {
        begin: () => {
          enterFullscreenOnTouch();
          this.scene.start('GameScene');
        },
        resume: () => {
          enterFullscreenOnTouch();
          this.scene.wake('GameScene');
          this.scene.stop();
        },
        // The sleeping game is shut down first, so nothing of it lingers.
        'new-game': () => {
          enterFullscreenOnTouch();
          this.scene.stop('GameScene');
          this.scene.start('GameScene');
        },
        about: () => this.scene.start('AboutScene')
      },
      controls: {
        // Where the browser can't go full screen (iPhone), explain the home screen.
        fullscreen: () => (fullscreen.available ? fullscreen.toggle() : panel('fullscreen-help').classList.add('is-open')),
        settings: () => panel('settings').classList.add('is-open'),
        'close-panel': closePanels,
        // Escape closes an open panel; with none open, it goes back to the game.
        escape: () => {
          if (openPanels().length > 0) {
            closePanels();
          } else if (gameInProgress) {
            screen.run('resume');
          }
        },
        update: () => {
          const button = panel('settings').querySelector('[data-action="update"]');
          button.disabled = true;
          button.textContent = 'Updating…';
          loadLatestVersion();
        }
      },
      keys: { ENTER: gameInProgress ? 'resume' : 'begin', SPACE: gameInProgress ? 'resume' : 'begin', F: 'fullscreen', ESC: 'escape' },
      // With a panel open, the buttons that leave the screen wait until it closes.
      holdActions: () => openPanels().length > 0
    });

    if (this.panelToOpen) {
      panel(this.panelToOpen)?.classList.add('is-open');
    }

    // The full-screen button shows whether the page is in full screen now.
    const button = screen.node.querySelector('[data-action="fullscreen"]');
    if (button && fullscreen.available) {
      const show = () => {
        button.classList.toggle('is-active', fullscreen.active);
        button.setAttribute('aria-label', fullscreen.active ? 'Leave full screen' : 'Full screen');
      };
      show();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, fullscreen.onChange(show));
    }
  }
}

/** @param {boolean} gameInProgress Whether a game is waiting behind the menu. */
function howToPlayHtml(gameInProgress) {
  const legend = RUNE_IDS.map(
    (id) => `
      <div class="legend-rune">
        ${traceGuide(id, 56)}
        <div>
          <div><span class="name">${RUNE_NAMES[id]}</span><span class="meaning">${RUNE_NOTES[id].meaning}</span></div>
          <div class="stroke">${RUNE_NOTES[id].stroke}</div>
        </div>
      </div>`
  ).join('');

  return `
    <div class="how-to-play">
      <header class="how-to-play-header">
        <div class="heading">
          <div class="runic">ᚺᛟᚹ ᛏᛟ ᛈᛚᚨᛃ</div>
          <h1 class="title">How to Play</h1>
        </div>
        <section class="panel saga">
          <span class="label">THE SAGA</span>
          <p>In the old tales, those lost at sea go to Rán, the sea goddess, who gathers the drowned
          in her net. Tonight the frost giants have made a pact with her. Her dead rise as
          <em>draugar</em>: undead sailors with ice in their veins, sent to drag Thor’s drakkar under
          while a jötunn watches from the mist. Thor, protector of Midgard, must hold the ship.</p>
        </section>
      </header>

      <div class="cards">
        <article class="panel card">
          <div class="card-art">
            <img src="assets/screens/card-draugr.webp" alt="" />
            <div class="queue">${queueGlyphs(['tiwaz', 'isa'])}</div>
          </div>
          <div class="card-text">
            <h2><span class="numeral">I</span>Read the rune</h2>
            <p>Every draugr carries a queue of runes. The bright one is the rune that hurts it next.</p>
          </div>
        </article>

        <article class="panel card">
          <div class="card-art">${tracingPicture('sowilo')}</div>
          <div class="card-text">
            <h2><span class="numeral">II</span>Trace it</h2>
            <p>Draw it anywhere on the screen, in one stroke. A true trace calls Thor’s lightning down.</p>
          </div>
        </article>

        <article class="panel card">
          <div class="card-art"><img src="assets/screens/card-thor.webp" alt="" /></div>
          <div class="card-text">
            <h2><span class="numeral">III</span>Strike them all</h2>
            <p>The lightning strikes every draugr that needs that rune. Empty a queue to destroy it.</p>
          </div>
        </article>

        <article class="panel card">
          <div class="card-art">
            <div class="hammers">
              <div class="row">${hammerIcon(true)}${hammerIcon(true)}${hammerIcon(false)}</div>
              <div class="caption">2 OF 3 REMAIN</div>
            </div>
          </div>
          <div class="card-text">
            <h2><span class="numeral">IV</span>Guard the ship</h2>
            <p>Each draugr that reaches the drakkar breaks one hammer. Lose all three and Thor falls.</p>
          </div>
        </article>
      </div>

      <section class="panel legend">
        <span class="label">THE THREE<br />RUNES</span>
        <div class="legend-runes">${legend}</div>
      </section>

      <footer class="how-to-play-footer">
        <span class="tip">${TIP}</span>
        <div class="buttons">
          <button class="button button-icon" data-action="settings" aria-label="Settings">${gearIconSvg()}</button>
          ${fullscreen.offered ? `<button class="button button-icon" data-action="fullscreen" aria-label="Full screen">${fullscreenIconSvg()}</button>` : ''}
          <button class="button button-secondary" data-action="about">About</button>
          ${
            gameInProgress
              ? `<button class="button button-secondary" data-action="new-game">New Game</button>
                 <button class="button button-primary" data-action="resume">Resume</button>`
              : `<button class="button button-primary" data-action="begin">Begin</button>`
          }
        </div>
      </footer>
    </div>

    <div class="overlay" data-panel="settings">
      <section class="panel overlay-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <span class="label">SETTINGS</span>
        <h2 id="settings-title" class="overlay-title">Game version</h2>
        <p class="settings-version">${__APP_VERSION__}</p>
        <p>Seeing an old version, or something not working? This clears the game’s saved
        files and loads the latest version.</p>
        <div class="buttons">
          <button class="button button-secondary" data-action="close-panel">Close</button>
          <button class="button button-primary" data-action="update">Get the latest version</button>
        </div>
      </section>
    </div>

    <div class="overlay" data-panel="fullscreen-help">
      <section class="panel overlay-panel" role="dialog" aria-modal="true" aria-labelledby="fullscreen-help-title">
        <span class="label">FULL SCREEN</span>
        <h2 id="fullscreen-help-title" class="overlay-title">Full screen on iPhone</h2>
        <p>Safari on iPhone can’t show a web page full screen, but the game can live on your
        home screen: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
        Opened from there, Stormrune fills the whole screen.</p>
        <div class="buttons">
          <button class="button button-primary" data-action="close-panel">Got it</button>
        </div>
      </section>
    </div>`;
}

/** A gear: eight teeth around a ring with a hole, in the screens' glowing blue. */
function gearIconSvg() {
  const teeth = Array.from({ length: 8 }, (_, k) => {
    const angle = (k * Math.PI) / 4;
    const point = (r) => `${(20 + r * Math.cos(angle)).toFixed(1)} ${(20 + r * Math.sin(angle)).toFixed(1)}`;
    return `M${point(12)} L${point(17)}`;
  }).join(' ');
  return `<svg viewBox="0 0 40 40" width="40" height="40" fill="none" aria-hidden="true">
    <path d="${teeth}" stroke-width="5.5" stroke-linecap="butt"/>
    <circle cx="20" cy="20" r="10.5"/>
    <circle cx="20" cy="20" r="4" stroke-width="3"/>
  </svg>`;
}
