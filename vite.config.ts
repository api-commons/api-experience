import { defineConfig } from 'vite';

// base './' + a single inlined chunk keep the built viewer relocatable — it can
// be dropped into any folder (or zipped up next to an apis.json) and still work.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 1024 * 1024,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
