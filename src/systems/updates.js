import { SPRITES } from '../config/sprites.js';

/** Files the game loads by a fixed name, so the browser may hold old copies of them. */
const FIXED_FILES = [
  './',
  'manifest.webmanifest',
  'favicon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  ...['how-to-play', 'about', 'game-over', 'card-draugr', 'card-thor'].map((name) => `assets/screens/${name}.webp`),
  ...Object.values(SPRITES).flatMap((sheet) => sheet.parts.map((part) => part.url))
];

/** Added to the address to get past a cached copy of the page (see tidyAddressBar). */
const FRESH_PARAM = 'fresh';

/** On a slow connection, reload anyway after this long (ms). */
const REFRESH_TIMEOUT_MS = 15000;

/**
 * Loads the newest version of the game: unregisters any service worker,
 * empties the Cache Storage, replaces the browser's stored copies of the
 * game's files with fresh ones, then reloads the page from the network.
 *
 * The game registers no service worker and caches nothing itself today;
 * clearing both still guards against an old one. The browser's own cache
 * can't be emptied from a page, but requests with `cache: 'reload'`
 * replace what it holds, once each file has arrived in full (a reload
 * would cancel a download still in progress). The script and style files
 * have their content hash in their names, so a fresh page always asks for
 * the new ones.
 */
export async function loadLatestVersion() {
  try {
    const workers = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(workers.map((worker) => worker.unregister()));
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
    const refetch = Promise.all(
      FIXED_FILES.map((file) =>
        fetch(file, { cache: 'reload' })
          .then((response) => response.arrayBuffer())
          .catch(() => {})
      )
    );
    await Promise.race([refetch, new Promise((resolve) => setTimeout(resolve, REFRESH_TIMEOUT_MS))]);
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set(FRESH_PARAM, Date.now().toString(36));
    window.location.replace(url.href);
  }
}

/** After that reload, takes the throwaway parameter out of the address bar again. */
export function tidyAddressBar() {
  const url = new URL(window.location.href);
  if (url.searchParams.has(FRESH_PARAM)) {
    url.searchParams.delete(FRESH_PARAM);
    window.history.replaceState(null, '', url.href);
  }
}
