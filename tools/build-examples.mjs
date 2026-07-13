// Post-build: publish each examples/<slug>/apis.json as a working example
// implementation under dist/examples/<slug>/ —
//   apis.json    the document
//   index.html   the standalone viewer sitting next to it (the zip-up pattern)
//   bundled.html a single self-contained file with the document inlined
// so every hosted example demonstrates both distribution modes.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = resolve(root, 'examples');
const dist = resolve(root, 'dist');
const viewer = readFileSync(resolve(dist, 'apis-json-viewer.html'), 'utf8');

if (!existsSync(examplesDir)) process.exit(0);
for (const slug of readdirSync(examplesDir)) {
  const src = resolve(examplesDir, slug, 'apis.json');
  if (!existsSync(src)) continue;
  const outDir = resolve(dist, 'examples', slug);
  mkdirSync(outDir, { recursive: true });

  const text = readFileSync(src, 'utf8');
  writeFileSync(resolve(outDir, 'apis.json'), text);
  writeFileSync(resolve(outDir, 'index.html'), viewer);

  const json = JSON.stringify(JSON.parse(text)).replace(/</g, '\\u003c');
  const tag = `<script id="apis-json-data" type="application/json">${json}</script>`;
  writeFileSync(resolve(outDir, 'bundled.html'), viewer.replace('<div id="app"></div>', `<div id="app"></div>\n    ${tag}`));
  console.log(`dist/examples/${slug}/ — apis.json + index.html + bundled.html`);
}
