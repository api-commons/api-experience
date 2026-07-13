// API Experience — a DX/AX visual layer for any APIs.json.
//
// Reads an APIs.json, fetches the OpenAPI(s) it references, and renders the
// REST-operation -> MCP-tool -> Agent-Skill journey plus a free/paid coverage
// scorecard. Data acquisition, in priority order:
//   1. Inline <script id="apis-json-data"> bundle (npm run bundle).
//   2. ?url=… query parameter.
//   3. ./apis.json next to this HTML.
//   4. A landing screen defaulting to apis.io + API Evangelist.

import './style.css';
import { parse as parseYAML } from 'yaml';
import { normalize, type ApisDoc } from './model';
import { buildExperience } from './experience';
import { renderExperience } from './render';
import { initEngage } from './engage';
import { esc, escAttr } from './ui';

const DEFAULTS = [
  { label: 'APIs.io', url: 'https://apis.io/apis.json', blurb: 'The API → MCP → Agent-Skill surface of apis.io itself: discovery free, synthesis Pro.' },
  { label: 'API Evangelist', url: 'https://apievangelist.com/apis.json', blurb: 'The API Evangelist network index.' },
];

let current: ApisDoc | null = null;
let sourceLabel = '';
const app = document.getElementById('app')!;

function shell(): void {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">◇→⚙→✦</span>
        <strong>API Experience</strong>
        <span class="tag">DX / AX for any APIs.json</span>
      </div>
      <nav>
        <button class="ghost-btn" id="btn-open" title="Load a different APIs.json">Open…</button>
        <a href="https://apisjson.org" target="_blank" rel="noopener">APIs.json</a>
        <a href="https://apicommons.org/tools/" target="_blank" rel="noopener">API Commons</a>
        <a href="https://github.com/api-commons/api-experience" target="_blank" rel="noopener">GitHub</a>
        <button class="engage-btn" id="engage-ae">Work with us</button>
      </nav>
    </header>
    <div data-laneworks-ad="top-banner"></div>
    <div id="view"></div>`;

  document.getElementById('btn-open')!.addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    landing();
  });

  initEngage(() => {
    if (!current) return 'Context: browsing API Experience with no APIs.json loaded yet.';
    return [
      `Context: viewing the DX/AX of "${current.name}" (APIs.json ${current.specificationVersion})`,
      sourceLabel ? `Source: ${sourceLabel}` : '',
      `APIs: ${current.apis.length}`,
    ].filter(Boolean).join('\n');
  });
}

const view = () => document.getElementById('view')!;

function landing(): void {
  view().innerHTML = `
    <div class="landing">
      <h1>See the experience of your APIs</h1>
      <p class="lede">Drop in an <a href="https://apisjson.org" target="_blank" rel="noopener">APIs.json</a> and watch each REST
        operation flow to its <strong>MCP tool</strong> and <strong>Agent Skill</strong> — with a free/paid coverage view so you
        can spot the gaps and iterate. Everything runs in your browser; nothing is uploaded.</p>

      <div class="drop" id="drop">
        <p><strong>Drop an apis.json / apis.yaml here</strong>, or</p>
        <div class="drop-actions">
          <label class="btn">Choose file<input type="file" id="file" accept=".json,.yaml,.yml,application/json" hidden /></label>
          <form id="urlform" class="urlform">
            <input type="url" id="urlin" placeholder="https://example.com/apis.json" />
            <button class="btn" type="submit">Load URL</button>
          </form>
        </div>
      </div>

      <div class="examples">
        <h2>Start with</h2>
        <div class="ex-grid">
          ${DEFAULTS.map((e) => `
            <button class="ex-card" data-url="${escAttr(e.url)}">
              <strong>${esc(e.label)}</strong>
              <span>${esc(e.blurb)}</span>
              <code>${esc(e.url)}</code>
            </button>`).join('')}
        </div>
        <p class="cors-note">Loading a URL fetches it in your browser — the host must allow cross-origin reads (CORS). If a load fails, download the file and drop it here.</p>
      </div>
    </div>`;

  const fileEl = document.getElementById('file') as HTMLInputElement;
  fileEl.addEventListener('change', () => {
    const f = fileEl.files?.[0];
    if (f) f.text().then((t) => loadText(t, `file: ${f.name}`));
  });
  document.getElementById('urlform')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = (document.getElementById('urlin') as HTMLInputElement).value.trim();
    if (url) loadUrl(url);
  });
  view().querySelectorAll<HTMLButtonElement>('.ex-card').forEach((b) =>
    b.addEventListener('click', () => loadUrl(b.dataset.url!)));

  const drop = document.getElementById('drop')!;
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) f.text().then((t) => loadText(t, `file: ${f.name}`));
  });
}

function parseApisJson(text: string): unknown {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return JSON.parse(t);
  return parseYAML(t);
}

async function loadText(text: string, label: string): Promise<void> {
  try {
    const doc = normalize(parseApisJson(text));
    await render(doc, label);
  } catch (e) {
    error(e instanceof Error ? e.message : String(e));
  }
}

async function loadUrl(url: string): Promise<void> {
  loading(url);
  history.replaceState(null, '', `?url=${encodeURIComponent(url)}`);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json, application/yaml, */*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    await loadText(await res.text(), url);
  } catch (e) {
    error(`${e instanceof Error ? e.message : String(e)}\n\nIf this is a CORS error, download the file and drop it in.`);
  }
}

async function render(doc: ApisDoc, label: string): Promise<void> {
  current = doc; sourceLabel = label;
  loading(label, doc.name);
  const model = await buildExperience(doc);
  view().innerHTML = renderExperience(model, label);
  view().scrollIntoView({ block: 'start' });
}

function loading(label: string, name?: string): void {
  view().innerHTML = `<div class="loading"><div class="spinner"></div><p>Reading ${esc(name || label)} and fetching its OpenAPI(s)…</p></div>`;
}

function error(m: string): void {
  view().innerHTML = `<div class="error-box"><h2>Couldn't load that</h2><pre>${esc(m)}</pre>
    <button class="btn" id="back">← Back</button></div>`;
  document.getElementById('back')?.addEventListener('click', () => landing());
}

// --- boot ---
shell();
const inline = document.getElementById('apis-json-data');
const params = new URLSearchParams(location.search);
const urlParam = params.get('url');

if (inline?.textContent?.trim()) {
  loadText(inline.textContent, 'bundled apis.json');
} else if (urlParam) {
  loadUrl(urlParam);
} else {
  // Try ./apis.json next to this file (zip mode); fall back to the landing (defaults to apis.io + AE).
  fetch('./apis.json')
    .then((r) => (r.ok ? r.text().then((t) => loadText(t, './apis.json')) : landing()))
    .catch(() => landing());
}
