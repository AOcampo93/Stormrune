/*
 * export-sprites.mjs: turns the character designs in art/designs into the
 * sprite sheets the game loads.
 *
 * Run with `npm run export:sprites` after changing a design. It needs Google
 * Chrome installed and an internet connection (the design files load their
 * React runtime from unpkg).
 *
 * The designs (.dc.html) are animated SVG pages: each one draws every frame
 * of an animation as its own <svg>. For each animation this script:
 *   1. opens the page in headless Chrome and waits for the frames to render,
 *   2. rasterizes the frames the game uses at SCALE, with a transparent background,
 *   3. crops them all to the same box (the union of what is visible in any
 *      frame) so the character's feet stay at the same spot in every frame,
 *   4. packs them into a WebP sprite sheet no larger than 2048 px per side,
 *   5. records frame size and anchor in src/config/sprites.js.
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

/** Design units to game pixels. Thor ends up about 320 px tall. */
const SCALE = 0.32;

/** Gap between frames in a sheet, so filtering never bleeds into a neighbor. */
const SPACING = 2;
const MAX_SHEET_SIZE = 2048;
const WEBP_QUALITY = 0.86;

/** Thor's feet in design units: every Thor sprite is anchored here. */
const THOR_ANCHOR = [500, 1250];

/** Where Thor stands on the longship, in the boat's design units. */
const BOAT_ANCHOR = [1300, 1720];

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * One entry per sprite sheet. `frames` are 1-based frame numbers of the
 * design; attacks skip their slow wind-up so the strike lands right away.
 */
const SHEETS = [
  {
    // Only the untransformed boat is exported: the game recreates the
    // rocking with the same formula, so it is smooth instead of 12 steps.
    key: 'boat',
    design: 'Bote idle.dc.html',
    viewBox: '-200 0 3000 1800',
    // Wider and taller than the design's frame: the hull continues past it,
    // and the extra margin keeps the edges off screen while the boat rocks.
    exportViewBox: '-700 0 4000 2100',
    frames: [1],
    stripTransform: true,
    anchor: BOAT_ANCHOR
  },
  { key: 'thor-idle', design: 'Thor idle.dc.html', viewBox: '-150 -220 1300 1500', frames: range(1, 8), anchor: THOR_ANCHOR },
  { key: 'thor-raise', design: 'Thor levantar martillo.dc.html', viewBox: '-150 -220 1300 1500', frames: range(6, 15), anchor: THOR_ANCHOR },
  { key: 'thor-atk2', design: 'Thor ataque 2.dc.html', viewBox: '-150 -220 1300 1500', frames: range(4, 11), anchor: THOR_ANCHOR },
  { key: 'thor-atk3', design: 'Thor ataque 3.dc.html', viewBox: '-250 -220 1500 1660', frames: range(3, 12), anchor: THOR_ANCHOR },
  { key: 'thor-hurt', design: 'Thor herido.dc.html', viewBox: '-150 -220 1300 1500', frames: range(1, 12), anchor: THOR_ANCHOR },
  { key: 'thor-death', design: 'Thor muerte.dc.html', viewBox: '-150 -220 1300 1500', frames: range(1, 10), anchor: THOR_ANCHOR }
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
      let left = width, top = height, right = 0, bottom = 0;
      for (const canvas of canvases) {
        const alpha = canvas.getContext('2d').getImageData(0, 0, width, height).data;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (alpha[(y * width + x) * 4 + 3] > 8) {
              if (x < left) left = x;
              if (x > right) right = x;
              if (y < top) top = y;
              if (y > bottom) bottom = y;
            }
          }
        }
      }
      left = Math.max(0, left - 2);
      top = Math.max(0, top - 2);
      const frameWidth = Math.min(width, right + 3) - left;
      const frameHeight = Math.min(height, bottom + 3) - top;

      // 4. Pack the cropped frames row by row.
      const columns = Math.max(1, Math.min(canvases.length, Math.floor((maxSize + spacing) / (frameWidth + spacing))));
      const rows = Math.ceil(canvases.length / columns);
      const sheetCanvas = document.createElement('canvas');
      sheetCanvas.width = columns * frameWidth + (columns - 1) * spacing;
      sheetCanvas.height = rows * frameHeight + (rows - 1) * spacing;
      const ctx = sheetCanvas.getContext('2d');
      canvases.forEach((canvas, i) => {
        const dx = (i % columns) * (frameWidth + spacing);
        const dy = Math.floor(i / columns) * (frameHeight + spacing);
        ctx.drawImage(canvas, left, top, frameWidth, frameHeight, dx, dy, frameWidth, frameHeight);
      });

      // 5. Where the anchor point lands inside a cropped frame (0..1).
      const anchorX = (sheet.anchor[0] - vx) * scale - left;
      const anchorY = (sheet.anchor[1] - vy) * scale - top;

      return {
        dataUrl: sheetCanvas.toDataURL('image/webp', quality),
        frameWidth,
        frameHeight,
        sheetWidth: sheetCanvas.width,
        sheetHeight: sheetCanvas.height,
        originX: +(anchorX / frameWidth).toFixed(4),
        originY: +(anchorY / frameHeight).toFixed(4)
      };
    },
    { selector, sheet, scale: SCALE, spacing: SPACING, maxSize: MAX_SHEET_SIZE, quality: WEBP_QUALITY }
  );

  if (result.sheetWidth > MAX_SHEET_SIZE || result.sheetHeight > MAX_SHEET_SIZE) {
    throw new Error(`${sheet.key}: sheet ${result.sheetWidth}x${result.sheetHeight} exceeds ${MAX_SHEET_SIZE} px`);
  }

  const bytes = Buffer.from(result.dataUrl.split(',')[1], 'base64');
  await writeFile(join(OUT_DIR, `${sheet.key}.webp`), bytes);
  manifest[sheet.key] = {
    url: `assets/sprites/${sheet.key}.webp`,
    frameWidth: result.frameWidth,
    frameHeight: result.frameHeight,
    frames: sheet.frames.length,
    spacing: SPACING,
    originX: result.originX,
    originY: result.originY
  };
  console.log(
    `${sheet.key.padEnd(11)} ${String(sheet.frames.length).padStart(2)} frames ` +
      `${result.frameWidth}x${result.frameHeight} -> sheet ${result.sheetWidth}x${result.sheetHeight}, ` +
      `${Math.round(bytes.length / 1024)} KB`
  );
}

await browser.close();
server.close();

const header = `// GENERATED by scripts/export-sprites.mjs from the designs in art/designs.
// Do not edit by hand: change a design (or the script) and run \`npm run export:sprites\`.
`;
await writeFile(
  MANIFEST,
  `${header}
/** Design units to game pixels used for every sprite. */
export const SPRITE_SCALE = ${SCALE};

/** Where Thor stands on the longship, in the boat design's units. */
export const BOAT_ANCHOR = ${JSON.stringify(BOAT_ANCHOR)};

/**
 * One entry per sprite sheet. originX/originY (0..1) mark the anchor inside a
 * frame: Thor's feet, or the spot on the deck where Thor stands.
 */
export const SPRITES = ${JSON.stringify(manifest, null, 2).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")};
`
);
console.log(`\nWrote ${Object.keys(manifest).length} sheets to public/assets/sprites and src/config/sprites.js`);
