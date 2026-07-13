// Bundle an apis.json INTO the standalone viewer: one HTML file carrying both
// the renderer and the document, viewable from disk (file://), a zip, an email
// attachment, or any static host.
//
//   npm run bundle -- path/to/apis.json [output.html]
//
// Requires a prior `npm run build` (which produces dist/apis-json-viewer.html).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYAML } from 'yaml';

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error('Usage: npm run bundle -- path/to/apis.json [output.html]');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viewerPath = resolve(root, 'dist', 'apis-json-viewer.html');
if (!existsSync(viewerPath)) {
  console.error('dist/apis-json-viewer.html not found — run `npm run build` first.');
  process.exit(1);
}

const text = readFileSync(resolve(input), 'utf8');
const doc = /\.(ya?ml)$/i.test(input) ? parseYAML(text) : JSON.parse(text);

// </script> inside a JSON string would end the tag early; escape it the same
// way the browser-side JSON.parse expects.
const json = JSON.stringify(doc).replace(/</g, '\\u003c');
const tag = `<script id="apis-json-data" type="application/json">${json}</script>`;

const viewer = readFileSync(viewerPath, 'utf8');
const bundled = viewer.replace('<div id="app"></div>', `<div id="app"></div>\n    ${tag}`);

const out = output || resolve(dirname(resolve(input)), basename(input).replace(/\.(json|ya?ml)$/i, '') + '.html');
writeFileSync(out, bundled);
console.log(`${out} — ${(bundled.length / 1024).toFixed(0)} KB self-contained documentation for "${doc.name || basename(input)}"`);
