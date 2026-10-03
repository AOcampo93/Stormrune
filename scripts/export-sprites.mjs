/*
 * export-sprites.mjs: turns the designs in art/designs into the sprite
 * sheets the game loads.
 *
 * Run with `npm run export:sprites` after changing a design. It needs Google
 * Chrome installed and an internet connection (the design files load their
 * React runtime from unpkg).
 *
 * The designs (.dc.html) are animated SVG pages: each one draws every frame
 * of an animation as its own <svg>. For each animation this script:
 *   1. opens the page in headless Chrome (setting design options if needed)
 *      and waits for the frames to render,
 *   2. rasterizes the frames the game uses with a transparent background,
 *   3. crops them all to the same box (the union of what is visible in any
 *      frame), so an anchor point such as a character's feet stays put,
 *   4. packs them into WebP sheets no larger than 2048 px per side (one
 *      animation may need several sheets),
 *   5. records sizes, anchors and sheet names in src/config/sprites.js.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DESIGNS_DIR = join(ROOT, 'art/designs');
const OUT_DIR = join(ROOT, 'public/assets/sprites');
const MANIFEST = join(ROOT, 'src/config/sprites.js');

/** Design units to game pixels for characters and the boat (Thor ~320 px tall). */
const SCALE = 0.32;

/** Gap between frames in a sheet, so filtering never bleeds into a neighbor. */
const SPACING = 2;
const MAX_SHEET_SIZE = 2048;
const WEBP_QUALITY = 0.86;

/** Thor's feet in design units: every Thor sprite is anchored here. */
const THOR_ANCHOR = [500, 1250];

/** Where Thor stands on the longship, in the boat's design units. */
const BOAT_ANCHOR = [1300, 1720];

/** A draugr is waist-deep: it is anchored where its body meets the water. */
const DRAUGR_ANCHOR = [500, 878];

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const CHARACTER = '-150 -220 1300 1500';

/**
 * The longship ("Bote idle" design) is exported in layers, so the game can
 * slip its own water in between them (see Longship and ShipWater). Every
 * layer is untransformed: the game recreates the rocking with the design's
 * formula, so it is smooth instead of 12 steps.
 */
const BOAT = {
  design: 'Bote idle.dc.html',
  viewBox: '-200 0 3000 1800',
  // Wider and taller than the design's frame: the hull continues past it,
  // and the extra margin keeps the edges off screen while the boat rocks.
  exportViewBox: '-700 0 4000 2100',
  stripTransform: true,
  anchor: BOAT_ANCHOR,
  // The game lights the boat up itself, only when lightning strikes.
  props: { vista: 'hoja', relampagos: false }
};

// Parts of the boat design, picked with CSS selectors on its SVG frames.
/** The pool of sea water sloshing on the deck (the game draws it). */
const POOL = 'g:has(> path[fill="url(#gPool)"])';
/** Streaks of water running down the inner walls (left out of the game). */
const WALL_RUNS = 'path[stroke="#5f7faa"]';
/** The waves breaking over the gunwales: every path drawn over the boat. */
const BREAKING_WAVES = 'svg > g > path';
/** Their drops: the game throws its own particles instead. */
const WAVE_DROPS = 'path[fill="#e2f3f8"]';
/** Water pouring down the inner walls after a wave (left out of the game). */
const WAVE_POURING = 'path[stroke="#a9cde0"]';
/** The boat lit by lightning, drawn over it at the flash's opacity. */
const LIGHTNING_LIGHT = 'g[opacity]';
/** The outline of the bench nearest Thor, which stands out of the pool. */
const NEAR_BENCH = 'M327 1640 L2273 1640 L2273 1660.3 L2269 1674.5 L331 1674.5 L327 1660.3 Z';

/**
 * One entry per animation. `frames` are 1-based frame numbers of the design.
 * Optional: `props` sets design options, `scale` overrides SCALE, `crop:
 * false` keeps the whole frame, `exportViewBox` renders a different area.
 * To export only part of a design: `remove` drops the elements matching
 * some CSS selectors, `keep` drops everything else, and `clip` (an SVG path
 * in design units) cuts out one area.
 */
const SHEETS = [
  { ...BOAT, key: 'boat', frames: [1], remove: [POOL, WALL_RUNS] },
  // The game draws the pool over the deck, then this bench over the pool.
  { ...BOAT, key: 'boat-bench', frames: [1], clip: NEAR_BENCH },
  // Waves break over the port side, then the bow, then starboard, in step
  // with the rocking (frames 2-11).
  {
    ...BOAT,
    key: 'boat-waves',
    frames: range(1, 12),
    keep: [BREAKING_WAVES],
    remove: [WAVE_DROPS, WAVE_POURING]
  },
  // A soft glow, so half resolution is plenty. Frame 3 is a flash at its peak.
  {
    ...BOAT,
    key: 'boat-lightning',
    frames: [3],
    props: { vista: 'hoja', relampagos: true },
    keep: [LIGHTNING_LIGHT],
    scale: 0.16
  },
  // Attacks skip their slow wind-up so the strike lands right away.
  { key: 'thor-idle', design: 'Thor idle.dc.html', viewBox: CHARACTER, frames: range(1, 8), anchor: THOR_ANCHOR },
  { key: 'thor-raise', design: 'Thor levantar martillo.dc.html', viewBox: CHARACTER, frames: range(6, 15), anchor: THOR_ANCHOR },
  { key: 'thor-atk2', design: 'Thor ataque 2.dc.html', viewBox: CHARACTER, frames: range(4, 11), anchor: THOR_ANCHOR },
  { key: 'thor-atk3', design: 'Thor ataque 3.dc.html', viewBox: '-250 -220 1500 1660', frames: range(3, 12), anchor: THOR_ANCHOR },
  { key: 'thor-hurt', design: 'Thor herido.dc.html', viewBox: CHARACTER, frames: range(1, 12), anchor: THOR_ANCHOR },
  { key: 'thor-death', design: 'Thor muerte.dc.html', viewBox: CHARACTER, frames: range(1, 10), anchor: THOR_ANCHOR },
  { key: 'draugr-walk', design: 'Draugr caminando.dc.html', viewBox: CHARACTER, frames: range(1, 12), anchor: DRAUGR_ANCHOR },
  { key: 'draugr-death', design: 'Draugr muerte.dc.html', viewBox: CHARACTER, frames: range(1, 12), anchor: DRAUGR_ANCHOR },
  {
    // The whole stormy sea, giant included, as a 16-frame loop. Its own rain
    // and lightning are switched off: the game draws rain with particles and
    // adds occasional lightning itself (the design flashes every 0.4 s, which
    // would drown out the lightning that marks the player's hits). Exported
    // at half the on-screen size and scaled up in game: a misty background
    // loses little, and it halves the memory the 16 frames need.
    key: 'sea',
    design: 'Mar fondo.dc.html',
    viewBox: '0 0 2000 1200',
    frames: range(1, 16),
    props: { vista: 'hoja', lluvia: false, relampago: false },
    scale: 0.32,
    crop: false
  }
];

// --- A tiny static server, so the designs can load their support.js ---------

const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const body = await readFile(join(DESIGNS_DIR, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await mkdir(OUT_DIR, { recursive: true });

const manifest = {};
for (const sheet of SHEETS) {
  await page.goto(baseUrl + encodeURIComponent(sheet.design));
  if (sheet.props) {
    // The design runtime exposes its options; e.g. the "sheet" view shows every frame.
    await page.waitForFunction(() => typeof window.__dcSetProps === 'function' && window.__dcRootName?.());
    await page.evaluate((props) => window.__dcSetProps(window.__dcRootName(), props), sheet.props);
  }
  const selector = `svg[viewBox="${sheet.viewBox}"]`;
  await page.waitForFunction(
    ({ selector, needed }) => document.querySelectorAll(selector).length >= needed,
    { selector, needed: Math.max(...sheet.frames) },
    { timeout: 60000 }
  );

  // Everything below runs inside the page, where the SVG frames live.
  const result = await page.evaluate(
    async ({ selector, sheet, scale, spacing, maxSize, quality }) => {
      const viewBox = (sheet.exportViewBox ?? sheet.viewBox).split(' ').map(Number);
      const [vx, vy, vw, vh] = viewBox;
      const width = Math.round(vw * scale);
      const height = Math.round(vh * scale);

      // Gradients, filters and clip paths are shared by all frames in a hidden <svg>.
      const defs = [...document.querySelectorAll('svg')].find((s) => s.getAttribute('width') === '0')?.querySelector('defs');
      const all = [...document.querySelectorAll(selector)];

      /** Applies the sheet's `remove`, `keep` and `clip` options to one frame. */
      function selectPart(svg, { remove, keep, clip }) {
        if (remove) svg.querySelectorAll(remove.join(', ')).forEach((element) => element.remove());
        if (keep) {
          const kept = [...svg.querySelectorAll(keep.join(', '))];
          for (const element of svg.querySelectorAll('*')) {
            if (!kept.some((k) => k.contains(element) || element.contains(k))) element.remove();
          }
        }
        if (clip) {
          const ns = 'http://www.w3.org/2000/svg';
          const clipPath = document.createElementNS(ns, 'clipPath');
          clipPath.id = 'export-clip';
          clipPath.appendChild(document.createElementNS(ns, 'path')).setAttribute('d', clip);
          const group = document.createElementNS(ns, 'g');
          group.setAttribute('clip-path', 'url(#export-clip)');
          group.append(...svg.childNodes);
          svg.append(clipPath, group);
        }
      }

      // 1-2. Rasterize each requested frame as a standalone SVG.
      const canvases = [];
      for (const number of sheet.frames) {
        const svg = all[number - 1].cloneNode(true);
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('viewBox', viewBox.join(' '));
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.removeAttribute('style');
        if (sheet.stripTransform) svg.querySelector('g[transform]')?.removeAttribute('transform');
        selectPart(svg, sheet);
        if (defs) svg.insertBefore(defs.cloneNode(true), svg.firstChild);

        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);
        canvases.push(canvas);
      }

      // 3. The union of the visible pixels of all frames, plus a small margin.
      let left = 0, top = 0, frameWidth = width, frameHeight = height;
      if (sheet.crop !== false) {
        let x0 = width, y0 = height, x1 = 0, y1 = 0;
        for (const canvas of canvases) {
          const alpha = canvas.getContext('2d').getImageData(0, 0, width, height).data;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              if (alpha[(y * width + x) * 4 + 3] > 8) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
              }
            }
          }
        }
        left = Math.max(0, x0 - 2);
        top = Math.max(0, y0 - 2);
        frameWidth = Math.min(width, x1 + 3) - left;
        frameHeight = Math.min(height, y1 + 3) - top;
      }

      // 4. Pack the frames row by row, starting a new sheet when one is full.
      const columns = Math.max(1, Math.min(canvases.length, Math.floor((maxSize + spacing) / (frameWidth + spacing))));
      const maxRows = Math.max(1, Math.floor((maxSize + spacing) / (frameHeight + spacing)));
      const perSheet = columns * maxRows;
      const parts = [];
      for (let first = 0; first < canvases.length; first += perSheet) {
        const chunk = canvases.slice(first, first + perSheet);
        const cols = Math.min(columns, chunk.length);
        const rows = Math.ceil(chunk.length / cols);
        const sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = cols * frameWidth + (cols - 1) * spacing;
        sheetCanvas.height = rows * frameHeight + (rows - 1) * spacing;
        const ctx = sheetCanvas.getContext('2d');
        chunk.forEach((canvas, i) => {
          const dx = (i % cols) * (frameWidth + spacing);
          const dy = Math.floor(i / cols) * (frameHeight + spacing);
          ctx.drawImage(canvas, left, top, frameWidth, frameHeight, dx, dy, frameWidth, frameHeight);
        });
        parts.push({
          dataUrl: sheetCanvas.toDataURL('image/webp', quality),
          frames: chunk.length,
          width: sheetCanvas.width,
          height: sheetCanvas.height
        });
      }

      // 5. Where the anchor point lands inside a frame (0..1).
      const anchor = sheet.anchor ?? [vx, vy];
      return {
        parts,
        frameWidth,
        frameHeight,
        originX: +(((anchor[0] - vx) * scale - left) / frameWidth).toFixed(4),
        originY: +(((anchor[1] - vy) * scale - top) / frameHeight).toFixed(4)
      };
    },
    { selector, sheet, scale: sheet.scale ?? SCALE, spacing: SPACING, maxSize: MAX_SHEET_SIZE, quality: WEBP_QUALITY }
  );

  const parts = [];
  for (const [i, part] of result.parts.entries()) {
    const key = result.parts.length === 1 ? sheet.key : `${sheet.key}-${i}`;
    const bytes = Buffer.from(part.dataUrl.split(',')[1], 'base64');
    await writeFile(join(OUT_DIR, `${key}.webp`), bytes);
    parts.push({ key, url: `assets/sprites/${key}.webp`, frames: part.frames });
    console.log(
      `${key.padEnd(15)} ${String(part.frames).padStart(2)} frames ${result.frameWidth}x${result.frameHeight} ` +
        `-> sheet ${part.width}x${part.height}, ${Math.round(bytes.length / 1024)} KB`
    );
  }
  manifest[sheet.key] = {
    scale: sheet.scale ?? SCALE,
    frameWidth: result.frameWidth,
    frameHeight: result.frameHeight,
    frames: sheet.frames.length,
    spacing: SPACING,
    originX: result.originX,
    originY: result.originY,
    parts
  };
}

await browser.close();
server.close();

await writeFile(
  MANIFEST,
  `// GENERATED by scripts/export-sprites.mjs from the designs in art/designs.
// Do not edit by hand: change a design (or the script) and run \`npm run export:sprites\`.

/** Where Thor stands on the longship, in the boat design's units. */
export const BOAT_ANCHOR = ${JSON.stringify(BOAT_ANCHOR)};

/**
 * One entry per animation. \`scale\` is design units to sheet pixels;
 * originX/originY mark the anchor as a fraction of a frame (Thor's feet, a
 * draugr's waterline, Thor's spot on the deck), beyond 0..1 for a layer of
 * the boat that doesn't reach Thor's spot; \`parts\` lists the sheet files,
 * in frame order.
 */
export const SPRITES = ${JSON.stringify(manifest, null, 2).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")};
`
);
console.log(`\nWrote ${Object.keys(manifest).length} animations to public/assets/sprites and src/config/sprites.js`);
