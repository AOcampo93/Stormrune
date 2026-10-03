# Stormrune

Defend a Viking longship from the draugar by drawing Norse runes.

![Stormrune: Thor calls down lightning on two draugar with a Sowilo rune](docs/screenshot.jpg)

## Overview

Stormrune is a 2D browser game made with [Phaser 4](https://phaser.io/). Thor
stands on the deck of a longship while undead warriors, the draugar, rise from a
stormy sea and wade toward it. Each one carries a queue of runes above its head.
Draw the matching rune with your mouse or finger and Thor calls down lightning,
removing that rune. When a draugr's queue
is empty it is destroyed. If a draugr reaches the ship you lose one of your three
lives, and losing all three ends the game.

The game runs in any modern browser, on desktop and on phones in landscape.

## How to play

Draw a rune anywhere on the screen in one stroke:

| Rune   | Shape | How to draw it                       |
| ------ | :---: | ------------------------------------ |
| Isa    |   │   | one straight line, top to bottom     |
| Sowilo |   Z   | right, diagonal down-left, right     |
| Tiwaz  |   ^   | up-right, then down-right            |

- The **bright** rune in a draugr's panel is the one that hurts it next. The dimmed ones come after.
- One rune strikes **every** draugr whose next rune matches, so a single stroke can hit several at once.
- Each rune has its own attack: Isa makes Thor raise his hammer, Sowilo calls a storm around him, and Tiwaz is a leaping spin.
- Size, position and direction don't matter. A Tiwaz drawn right-to-left still counts.
- A stroke that isn't a rune just fizzles. Misreads never cost you a life.
- Destroy enough draugar to clear a level. Each level spawns them more often, makes them walk faster and gives them longer rune queues. After level 5 the game is endless, getting about 10% harder per level.
- Landscape only: on a phone held upright, the game pauses and asks you to rotate.

## Running it locally

You need [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (the minimum for Vite 8).

```bash
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

| Command                    | What it does                                                 |
| -------------------------- | ------------------------------------------------------------ |
| `npm run dev`              | Development server with hot reload                           |
| `npm run build`            | Production build into `dist/`                                |
| `npm run preview`          | Serves the production build from `dist/`                     |
| `npm run check:recognizer` | Accuracy test for the rune recognizer (runs in Node, no browser) |
| `npm run export:sprites`   | Rebuilds Thor's and the longship's sprite sheets from the designs in `art/designs` (needs Google Chrome and an internet connection) |

### Play on your phone

1. Connect the phone and the computer to the same Wi-Fi network.
2. Run `npm run build` and then `npm run preview -- --host`. You can also use `npm run dev -- --host`.
3. Open the **Network** address Vite prints on the phone and hold it in landscape.

### Debug mode

Add `?debug` to the URL, for example `http://localhost:5173/?debug`, to show what the
recognizer read for each stroke and its score. It also exposes a read-only
`window.__stormrune.state` snapshot for automated browser tests. Players never see it.

## Purpose

This project was built for the Game Framework module of BYU-Idaho's CSE 310. It had two goals:

- **Learn a real game framework.** Phaser 4 covers scenes, pointer and touch input,
  Graphics drawing, tweens, timers, particles and the new filter system (used for the
  glowing rune trail). It also supports responsive scaling for phones.
- **Implement a published algorithm instead of pulling in a library.** Stroke
  recognition is our own implementation of the $1 Unistroke Recognizer
  ([src/systems/RuneRecognizer.js](src/systems/RuneRecognizer.js)).

All art and characters are original:

- **Thor and the longship** are detailed vector designs made for this project
  ([art/designs](art/designs)). `npm run export:sprites` renders their animation frames
  into the WebP sprite sheets in [public/assets/sprites](public/assets/sprites).
- **The draugr and the backgrounds** are hand-written SVGs in [public/assets](public/assets).
- **Lightning, rain, sparks, runes, the stroke trail and the HUD** are drawn with code at runtime.

## Development environment

- **Phaser 4.2.1**: 2D game framework. Uses the WebGL renderer, with Canvas as a fallback.
- **Vite 8**: development server and production bundler.
- **JavaScript (ES modules)**: no TypeScript, and no runtime dependency other than Phaser.
- **Node.js and npm**: run the tooling.
- **Visual Studio Code**: editor.
- **Chrome DevTools**: device emulation for phone screens and orientation.

## How it works

```
src/
  main.js                    Phaser config: 1280x720 scaled with FIT, scene list
  scenes/BootScene.js        loads the art and sprite sheets, registers Thor's animations
  scenes/GameScene.js        orchestrates gameplay: levels, casting, damage
  scenes/GameOverScene.js    final score and restart
  systems/StrokeInput.js     pointer capture and the glowing trail
  systems/RuneRecognizer.js  $1 Unistroke Recognizer
  systems/runeTemplates.js   the three rune shapes
  systems/Lightning.js       procedural lightning bolts
  entities/Draugr.js         enemy: approach, rune queue, death
  entities/Longship.js       the boat; rocks, carrying Thor with it
  entities/Thor.js           the hero's animations: idle, three attacks, hurt, death
  ui/Hud.js                  lives, score and level
  config/levels.js           difficulty table and endless scaling
  config/palette.js          every color in one place
  config/layout.js           screen geometry, boarding lanes and draw order
  config/sprites.js          sprite sheet sizes and anchors (generated)
scripts/check-recognizer.js  recognizer accuracy test
scripts/export-sprites.mjs   design files -> sprite sheets
art/designs/                 Thor and longship designs (animated SVG pages)
```

**Recognizing runes.** Each stroke goes through the $1 pipeline:

1. Resample it to 64 evenly spaced points.
2. Rotate it by its "indicative angle".
3. Scale it into a 250×250 square and center it.
4. Compare it point by point against each rune template, using a Golden Section Search over ±45°.

A match is accepted with a score of 0.75 or more.

The implementation changes the paper in three places:

- **1D-aware scaling.** It is borrowed from the $N recognizer, because Isa is a straight line and plain $1 scaling would blow up its tiny width.
- **Templates stored in both directions.** Strokes drawn backwards still match.
- **Stray taps filtered by stroke length** rather than by point count.

`npm run check:recognizer` draws thousands of seeded synthetic strokes to measure accuracy. Each rune is recognized ≥ 98% of the time and confused with another rune ≤ 0.5% of the time. Taps, circles, spirals and similar shapes are rejected.

**Fake depth.** A draugr's distance is never stored. Its size follows how far down
the screen it is (25% on the horizon, 100% near the stern), nearer draugar are drawn
on top, and the sea scrolls in parallax layers. They wade in along both sides of the
boat and climb aboard where the hull's edge is, so the hull hides their legs.

**The rocking longship.** The boat is one still image inside a Phaser Container
whose origin is the spot on the deck where Thor stands. Every frame the container
tilts, bobs and squashes slightly, with the same formula as the design's 12-frame
loop. Thor's sprite is a child of that container, so he moves exactly like the deck.

**Sprite pipeline.** Each design draws every frame of an animation as SVG.
`scripts/export-sprites.mjs` opens them in headless Chrome and rasterizes the frames
the game uses. It then crops them to a shared box, so Thor's feet stay put, and packs
them into sheets of at most 2048 px. The frame sizes and anchors go to
`src/config/sprites.js`.

## Deploying later

The build uses relative asset URLs (`base: './'` in [vite.config.js](vite.config.js)).
That means `dist/` works from any static host or sub-folder, for example a GitHub
Pages project site, Netlify or itch.io. The hosting choice is still pending; a deploy
script or workflow will be added once it is made.

## Useful websites

- [Phaser 4 documentation](https://docs.phaser.io/)
- [Phaser examples](https://phaser.io/examples)
- [Phaser changelog and v3 → v4 migration guide](https://github.com/phaserjs/phaser/tree/master/changelog)
- [$1 Unistroke Recognizer: project page, pseudocode and demo](https://depts.washington.edu/acelab/proj/dollar/index.html)
- Wobbrock, Wilson & Li (2007). *Gestures without Libraries, Toolkits or Training: A $1 Recognizer for User Interface Prototypes.* UIST '07. [doi:10.1145/1294211.1294238](https://doi.org/10.1145/1294211.1294238)
- [$N Multistroke Recognizer](https://depts.washington.edu/acelab/proj/dollar/ndollar.html) (Anthony & Wobbrock, 2010), the source of the 1D scaling rule
- [Vite guide](https://vite.dev/guide/)
- MDN:
  - [Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
  - [The `orientation` media query](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/orientation)
  - [`matchMedia()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia)
  - [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

## Future work

- Publish a playable demo on a static host and link it here and in the repository description.
- Sound: thunder, rune chimes, an ambient storm, music.
- A start menu, a pause menu and saved high scores.
- Bosses: a frost giant and Jörmungandr.
- Multi-stroke runes, such as an X-shaped Gebo special attack. These would need a $N-style recognizer.
- Detailed, animated draugar to match Thor and the longship.
- Playtest the difficulty curve and the recognition threshold on more phones. A stricter score of 0.78 rejects more doodles but loses about 1% of valid Tiwaz strokes.
- Haptic feedback on phones, and more accessibility options.
