import Phaser from 'phaser';
import { MenuScreen } from '../ui/MenuScreen.js';

/** Who made the game, as shown on the screen. */
const AUTHOR = {
  name: 'Arturo Ocampo',
  role: 'Game design · Art direction · Code',
  contact: 'github.com/AOcampo93'
};

/** How the game was made, one line per part, each with a rune for a bullet. */
const HOW_IT_WAS_MADE = [
  ['ᚠ', 'Engine', 'Phaser 4 and Vite, in plain JavaScript: one 1280×720 game that scales to any landscape screen.'],
  ['ᚢ', 'Runes', 'Our own $1 Unistroke Recognizer resamples, rotates and scales each stroke, then compares it with the runes.'],
  ['ᚦ', 'Art', 'Thor, the draugar, the drakkar and the sea are animated vector designs, turned into sprite sheets by a script.'],
  ['ᚨ', 'Motion', 'Lightning is generated in code, the boat rocks with its design’s formula, and waves, spray and rain are particles.'],
  ['ᚱ', 'Tools', 'Written in VS Code. A script renders the designs in headless Chrome, and the game is tested in Chrome and Safari.']
];

/** Who made the game, why, how, and what it draws on. "Back" returns to How to Play. */
export class AboutScene extends Phaser.Scene {
  constructor() {
    super('AboutScene');
  }

  create() {
    new MenuScreen(this, {
      backdrop: 'screen:about',
      html: aboutHtml(),
      actions: { back: () => this.scene.start('HowToPlayScene') },
      keys: { ESC: 'back', BACKSPACE: 'back', ENTER: 'back' }
    });
  }
}

function aboutHtml() {
  const initials = AUTHOR.name
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const steps = HOW_IT_WAS_MADE.map(
    ([rune, what, how]) => `
      <li><span class="bullet">${rune}</span><span><span class="what">${what}</span><span class="how">${how}</span></span></li>`
  ).join('');

  return `
    <div class="about">
      <div class="heading">
        <div class="runic">ᚨᛒᛟᚢᛏ</div>
        <h1 class="title">About Stormrune</h1>
      </div>

      <div class="about-columns">
        <section class="panel about-card">
          <div class="about-block">
            <span class="label">MADE BY</span>
            <div class="author">
              <div class="avatar">${initials}</div>
              <div class="author-lines">
                <span class="author-name">${AUTHOR.name}</span>
                <span class="author-role">${AUTHOR.role}</span>
                <span class="author-contact">${AUTHOR.contact}</span>
              </div>
            </div>
          </div>
          <div class="about-block">
            <span class="label">WHY THIS GAME</span>
            <p>A short game about reading runes under pressure, made for the Game Framework module of
            CSE 310 at BYU-Idaho, and a love letter to the Norse myths and the storms of the North Sea.</p>
          </div>
          <div class="about-block">
            <span class="label">SOURCES</span>
            <p>The Poetic and Prose Eddas (Thor, Mjölnir, the jötnar, Rán), Grettis saga and Eyrbyggja
            saga (the draugr), and the Elder Futhark. Rune recognition follows the $1 recognizer of
            Wobbrock, Wilson and Li (2007). Fonts: Cinzel, Alegreya Sans and Noto Sans Runic (SIL OFL).</p>
          </div>
        </section>

        <section class="panel about-card">
          <span class="label">HOW IT WAS MADE</span>
          <ul class="made-list">${steps}</ul>
        </section>
      </div>

      <footer class="about-footer">
        <button class="button button-primary" data-action="back">Back</button>
        <span class="credit">© 2026 ${AUTHOR.name} · Stormrune</span>
      </footer>
    </div>`;
}
