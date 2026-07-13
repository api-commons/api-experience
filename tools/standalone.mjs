// Post-build: collapse the Vite output into one self-contained HTML file at
// dist/apis-json-viewer.html. That single file is the portable viewer — drop
// it (renamed index.html if you like) next to any apis.json, or feed it to
// tools/bundle.mjs to inline a document into it.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
let html = readFileSync(resolve(dist, 'index.html'), 'utf8');

html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const js = readFileSync(resolve(dist, src.replace(/^\.\//, '')), 'utf8');
  return `<script type="module">${js.replace(/<\/script>/g, '<\\/script>')}</script>`;
});

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const css = readFileSync(resolve(dist, href.replace(/^\.\//, '')), 'utf8');
  return `<style>${css}</style>`;
});

writeFileSync(resolve(dist, 'apis-json-viewer.html'), html);
console.log(`dist/apis-json-viewer.html — ${(html.length / 1024).toFixed(0)} KB, fully self-contained`);
