import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/**
 * The commit and day a build was made from, e.g. "6e27d6b · 2026-10-03".
 * The game shows it in its settings, so a player (or a tester on a phone)
 * can tell which version they are running.
 */
function buildVersion() {
  let commit = 'dev';
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    // Not a git checkout: keep "dev".
  }
  return `${commit} · ${new Date().toISOString().slice(0, 10)}`;
}

export default defineConfig({
  // Emit relative asset URLs so the built site works from any folder or
  // sub-path, e.g. a GitHub Pages project site served at /<repo>/.
  base: './',

  define: {
    __APP_VERSION__: JSON.stringify(buildVersion())
  },

  build: {
    // Phaser is a single large module (well over Vite's default 500 kB
    // warning). That is expected for a game framework, so raise the limit
    // to keep the build output free of noise.
    chunkSizeWarningLimit: 1600
  }
});
