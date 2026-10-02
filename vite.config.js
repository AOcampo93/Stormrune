import { defineConfig } from 'vite';

export default defineConfig({
  // Emit relative asset URLs so the built site works from any folder or
  // sub-path, e.g. a GitHub Pages project site served at /<repo>/.
  base: './',

  build: {
    // Phaser is a single large module (well over Vite's default 500 kB
    // warning). That is expected for a game framework, so raise the limit
    // to keep the build output free of noise.
    chunkSizeWarningLimit: 1600
  }
});
