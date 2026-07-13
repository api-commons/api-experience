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
import { buildExperience, deriveSurface, computeCoverage, type ExperienceModel, type ExpApi } from './experience';
import { renderExperience } from './render';
import { initEngage } from './engage';
import { initSettings, openSettings, getToken } from './settings';
import { suggest, applySuggestion, describe, type SuggestKind } from './suggest';
import { downloadBundle } from './bundle';
import { esc, escAttr } from './ui';

// `src` is what we actually fetch (must be same-origin or CORS-enabled); `show` is the
// human label. apis.io/apis.json has no CORS header, so we bundle it locally and let the
// tool fetch its OpenAPI from githubusercontent (which does allow cross-origin).
const DEFAULTS = [
  { label: 'APIs.io', src: './examples/apis-io.json', show: 'apis.io/apis.json', blurb: 'The API → MCP → Agent-Skill surface of apis.io itself: discovery free, synthesis Pro.' },
  { label: 'API Evangelist', src: 'https://apievangelist.com/apis.yml', show: 'apievangelist.com/apis.yml', blurb: 'The API Evangelist network index.' },
];

let current: ApisDoc | null = null;
let model: ExperienceModel | null = null;
let sourceLabel = '';
let editCount = 0;
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
        <div class="menu-wrap">
          <button class="ghost-btn" id="btn-suggest" title="Suggest additions with Claude">✨ Suggest ▾</button>
          <div class="menu" id="suggest-menu" hidden>
            <button data-kind="path">Path (new operation)</button>
            <button data-kind="tool">MCP tool</button>
            <button data-kind="prompt">MCP prompt</button>
            <button data-kind="resource">MCP resource</button>
            <button data-kind="skill">Agent Skill</button>
          </div>
        </div>
        <button class="ghost-btn" id="btn-download" title="Download versioned bundle">⤓ Download</button>
        <button class="ghost-btn" id="btn-settings" title="Settings — Claude token, guide skill">⚙ Settings</button>
        <button class="ghost-btn" id="btn-open" title="Load a different APIs.json">Open…</button>
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
  document.getElementById('btn-settings')!.addEventListener('click', () => openSettings());
  document.getElementById('btn-download')!.addEventListener('click', () => doDownload());
  const suggestMenu = document.getElementById('suggest-menu')!;
  document.getElementById('btn-suggest')!.addEventListener('click', (e) => { e.stopPropagation(); suggestMenu.hidden = !suggestMenu.hidden; });
  document.addEventListener('click', () => { suggestMenu.hidden = true; });
  suggestMenu.querySelectorAll<HTMLButtonElement>('button[data-kind]').forEach((b) =>
    b.addEventListener('click', () => { suggestMenu.hidden = true; runSuggest(b.dataset.kind as SuggestKind); }));
  initSettings(() => {});

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
            <button class="ex-card" data-url="${escAttr(e.src)}">
              <strong>${esc(e.label)}</strong>
              <span>${esc(e.blurb)}</span>
              <code>${esc(e.show)}</code>
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
  current = doc; sourceLabel = label; editCount = 0;
  loading(label, doc.name);
  model = await buildExperience(doc);
  reRender();
  view().scrollIntoView({ block: 'start' });
}

function reRender(): void {
  if (!model) return;
  view().innerHTML = renderExperience(model, editCount ? `${sourceLabel} · edited v${editCount}` : sourceLabel);
}

// The API being iterated on: the first one that actually has an OpenAPI surface.
function targetApi(): ExpApi | null {
  return model?.apis.find((a) => a.hasOpenApi && a.oaDoc) || null;
}

async function runSuggest(kind: SuggestKind): Promise<void> {
  const token = getToken();
  if (!token) { openSettings(); return; }
  const exp = targetApi();
  if (!exp) { alert('Load an API that has an OpenAPI first — suggestions extend its operations.'); return; }
  suggestModal(kind, exp, 'loading', []);
  try {
    const suggestions = await suggest(kind, exp, token);
    if (!suggestions.length) { suggestModal(kind, exp, 'empty', []); return; }
    suggestModal(kind, exp, 'ready', suggestions);
  } catch (e) {
    suggestModal(kind, exp, 'error', [], e instanceof Error ? e.message : String(e));
  }
}

let sModal: HTMLElement | null = null;
function suggestModal(kind: SuggestKind, exp: ExpApi, state: string, suggestions: Awaited<ReturnType<typeof suggest>>, err = ''): void {
  if (!sModal) {
    sModal = document.createElement('div');
    sModal.className = 'modal suggest-modal';
    document.body.appendChild(sModal);
    sModal.addEventListener('click', (e) => { if (e.target === sModal) sModal!.hidden = true; });
  }
  const body = state === 'loading'
    ? `<div class="loading"><div class="spinner"></div><p>Asking Claude for ${esc(kind)} suggestions…</p></div>`
    : state === 'error'
      ? `<div class="error-box"><p>${esc(err)}</p></div>`
      : state === 'empty'
        ? `<p class="muted">No suggestions came back — try a different kind or refine the guide skill.</p>`
        : `<p class="sug-intro">Pick suggestions to add to <strong>${esc(exp.name)}</strong>. Each one edits the in-memory OpenAPI and re-renders the journey — download the bundle when you're happy.</p>
           <div class="sug-list">${suggestions.map((s, i) => `
             <div class="sug-item" data-i="${i}">
               <div class="sug-text"><code>${esc(describe(kind, s))}</code>${s.description || s.summary ? `<span class="sug-desc">${esc(s.description || s.summary || '')}</span>` : ''}</div>
               <button class="btn sug-add" data-i="${i}">+ Add</button>
             </div>`).join('')}</div>`;
  sModal.innerHTML = `<div class="modal-card suggest-card">
      <div class="modal-head"><span>✨ Suggest ${esc(kind)}</span><button type="button" class="sug-close" aria-label="Close">×</button></div>
      <div class="suggest-body">${body}</div>
    </div>`;
  sModal.hidden = false;
  sModal.querySelector('.sug-close')!.addEventListener('click', () => { sModal!.hidden = true; });
  sModal.querySelectorAll<HTMLButtonElement>('.sug-add').forEach((btn) => btn.addEventListener('click', () => {
    const s = suggestions[Number(btn.dataset.i)];
    applySuggestion(kind, exp, s);
    deriveSurface(exp);
    if (model) model.coverage = computeCoverage(model.apis);
    editCount++;
    reRender();
    btn.textContent = '✓ Added'; btn.disabled = true;
  }));
}

async function doDownload(): Promise<void> {
  if (!current || !model) { alert('Load an APIs.json first.'); return; }
  await downloadBundle(current, model.apis, `v${editCount}`);
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
  // Zip mode: ./apis.json next to this file. Otherwise default-load the bundled apis.io example
  // so the tool shows the DX/AX journey on first visit; the landing (Open…) is one click away.
  fetch('./apis.json')
    .then((r) => (r.ok ? r.text().then((t) => loadText(t, './apis.json')) : defaultLoad()))
    .catch(() => defaultLoad());
}

function defaultLoad(): void {
  fetch(DEFAULTS[0].src)
    .then((r) => (r.ok ? r.text().then((t) => loadText(t, DEFAULTS[0].show)) : landing()))
    .catch(() => landing());
}
