import Phaser from 'phaser';
import { MenuScreen } from '../ui/MenuScreen.js';
import { fullscreen, enterFullscreenOnTouch, fullscreenIconSvg } from '../ui/fullscreen.js';
import { queueGlyphs, traceGuide, tracingPicture, hammerIcon } from '../ui/runeArt.js';
import { RUNE_IDS, RUNE_NAMES } from '../systems/runeTemplates.js';

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
 * The first screen: the saga, the rules in four steps, and the three runes
 * with how to trace each one. "Begin" starts the game.
 */
export class HowToPlayScene extends Phaser.Scene {
  constructor() {
    super('HowToPlayScene');
  }

  create() {
    const screen = new MenuScreen(this, {
      backdrop: 'screen:how-to-play',
      html: howToPlayHtml(),
      actions: {
        begin: () => {
          enterFullscreenOnTouch();
          this.scene.start('GameScene');
        },
        about: () => this.scene.start('AboutScene')
      },
      controls: { fullscreen: () => fullscreen.toggle() },
      keys: { ENTER: 'begin', SPACE: 'begin', F: 'fullscreen' }
    });

    // The full-screen button shows whether the page is in full screen now.
    const button = screen.node.querySelector('[data-action="fullscreen"]');
    if (button) {
      const show = () => {
        button.classList.toggle('is-active', fullscreen.active);
        button.setAttribute('aria-label', fullscreen.active ? 'Leave full screen' : 'Full screen');
      };
      show();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, fullscreen.onChange(show));
    }
  }
}

function howToPlayHtml() {
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
          ${fullscreen.available ? `<button class="button button-icon" data-action="fullscreen">${fullscreenIconSvg()}</button>` : ''}
          <button class="button button-secondary" data-action="about">About</button>
          <button class="button button-primary" data-action="begin">Begin</button>
        </div>
      </footer>
    </div>`;
}
