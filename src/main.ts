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
import { buildExperience, deriveSurface, computeCoverage, type ExperienceModel, type ExpApi, type ExpOperation } from './experience';
import { renderExperience } from './render';
import { initEngage } from './engage';
import { initSettings, openSettings, getToken } from './settings';
import { suggest, applySuggestion, describe, completeOperation, type SuggestKind, type Suggestion } from './suggest';
import { downloadBundle } from './bundle';
import { esc, escAttr } from './ui';

// `src` is what we actually fetch (must be same-origin or CORS-enabled); `show` is the
// human label. apis.io/apis.json has no CORS header, so we bundle it locally and let the
// tool fetch its OpenAPI from githubusercontent (which does allow cross-origin).
const DEFAULTS = [
  { label: 'APIs.io', src: './examples/apis-io.json', show: 'apis.io/apis.json', blurb: 'The live API → MCP → Agent-Skill surface of apis.io. Work it operation by operation — the ✨ on each row completes that one operation precisely.' },
  { label: 'API Evangelist', src: 'https://apievangelist.com/apis.yml', show: 'apievangelist.com/apis.yml', blurb: 'The API Evangelist network index.' },
  { label: 'APIs.io — target (roadmap)', src: './examples/apis-io-target.json', show: 'apis.io roadmap', blurb: 'A bulk proposed buildout, for reference — prefer completing operations one at a time on the live surface above.' },
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
        <button class="ghost-btn" id="btn-suggest-path" title="Suggest new operations (paths) with Claude — tool/prompt/resource/skill are suggested inline per operation (the ✨ on each row)">✨ Suggest path</button>
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
  document.getElementById('btn-suggest-path')!.addEventListener('click', () => runSuggest('path'));
  initSettings(() => {});

  // Inline per-operation suggest: the ✨ on each journey row opens a kind menu scoped to that op.
  app.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.op-suggest');
    if (!btn) return;
    e.stopPropagation();
    const op = model?.apis.flatMap((a) => a.operations).find((o) => o.operationId === btn.dataset.op);
    if (op) openOpMenu(btn, op);
  });
  document.addEventListener('click', () => closeOpMenu());

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

// Anchored kind-menu opened by the inline ✨ on an operation row.
let opMenuEl: HTMLElement | null = null;
function closeOpMenu(): void { opMenuEl?.remove(); opMenuEl = null; }
function openOpMenu(anchor: HTMLElement, op: ExpOperation): void {
  closeOpMenu();
  const el = document.createElement('div');
  el.className = 'op-menu';
  el.innerHTML = `
    <div class="op-menu-h">Complete ${esc(op.method)} ${esc(op.path)}</div>
    <button data-complete="1"><strong>✨ Complete this operation</strong><span class="op-menu-sub">tool + prompts + resources + skill, in one pass</span></button>
    <div class="op-menu-div"></div>
    <button data-k="tool">⚙ MCP tool</button>
    <button data-k="prompt">◇ MCP prompt</button>
    <button data-k="resource">▤ MCP resource</button>
    <button data-k="skill">✦ Agent Skill</button>`;
  el.addEventListener('click', (e) => e.stopPropagation());
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  el.style.top = `${window.scrollY + r.bottom + 4}px`;
  el.style.left = `${window.scrollX + Math.min(r.left, window.innerWidth - 240)}px`;
  el.querySelector<HTMLButtonElement>('button[data-complete]')!.addEventListener('click', () => { closeOpMenu(); runComplete(op); });
  el.querySelectorAll<HTMLButtonElement>('button[data-k]').forEach((b) =>
    b.addEventListener('click', () => { closeOpMenu(); runSuggest(b.dataset.k as SuggestKind, op); }));
  opMenuEl = el;
}

async function runComplete(op: ExpOperation): Promise<void> {
  const token = getToken();
  if (!token) { openSettings(); return; }
  const exp = targetApi();
  if (!exp) { alert('Load an API that has an OpenAPI first.'); return; }
  completeModal(op, exp, 'loading', null);
  try {
    const res = await completeOperation(exp, op, token);
    completeModal(op, exp, 'ready', res);
  } catch (e) {
    completeModal(op, exp, 'error', null, e instanceof Error ? e.message : String(e));
  }
}

let cModal: HTMLElement | null = null;
function completeModal(op: ExpOperation, exp: ExpApi, state: string, res: Awaited<ReturnType<typeof completeOperation>> | null, err = ''): void {
  if (!cModal) {
    cModal = document.createElement('div');
    cModal.className = 'modal suggest-modal';
    document.body.appendChild(cModal);
    cModal.addEventListener('click', (e) => { if (e.target === cModal) cModal!.hidden = true; });
  }
  const section = (title: string, kind: SuggestKind, items: Suggestion[]) => {
    if (!items.length) return `<div class="cx-sec"><div class="cx-h">${esc(title)}</div><p class="muted cx-empty">Nothing suggested — this part looks covered.</p></div>`;
    const hasTier = kind !== 'skill';
    return `<div class="cx-sec"><div class="cx-h">${esc(title)}</div>${items.map((s, i) => {
      const def = s.tier || (kind === 'tool' && op.tier === 'pro' ? 'pro' : 'free');
      return `<div class="sug-item" data-kind="${kind}" data-i="${i}">
        <div class="sug-text"><code>${esc(describe(kind, s))}</code>${s.description ? `<span class="sug-desc">${esc(s.description)}</span>` : ''}</div>
        <div class="sug-actions">
          ${hasTier ? `<span class="sug-tier"><button type="button" class="tglt ${def === 'free' ? 'on' : ''}" data-t="free">Free</button><button type="button" class="tglt ${def === 'pro' ? 'on' : ''}" data-t="pro">Pro</button></span>` : ''}
          <button class="btn sug-add">+ Add</button>
        </div>
      </div>`; }).join('')}</div>`;
  };
  const body = state === 'loading'
    ? `<div class="loading"><div class="spinner"></div><p>Completing <code>${esc(op.method)} ${esc(op.path)}</code>…</p></div>`
    : state === 'error'
      ? `<div class="error-box"><p>${esc(err)}</p></div>`
      : `<p class="sug-intro">Precise proposal for <code>${esc(op.method)} ${esc(op.path)}</code> — add the parts you want; each edits the in-memory OpenAPI and re-renders.</p>
         ${section('⚙ MCP tool', 'tool', res!.tools)}
         ${section('◇ MCP prompts', 'prompt', res!.prompts)}
         ${section('▤ MCP resources', 'resource', res!.resources)}
         ${section('✦ Agent Skill', 'skill', res!.skills)}`;
  cModal.innerHTML = `<div class="modal-card suggest-card">
      <div class="modal-head"><span>✨ Complete ${esc(op.method)} ${esc(op.path)}</span><button type="button" class="sug-close" aria-label="Close">×</button></div>
      <div class="suggest-body">${body}</div>
    </div>`;
  cModal.hidden = false;
  cModal.querySelector('.sug-close')!.addEventListener('click', () => { cModal!.hidden = true; });
  cModal.querySelectorAll<HTMLButtonElement>('.tglt').forEach((t) => t.addEventListener('click', () => {
    const wrap = t.closest('.sug-tier')!; wrap.querySelectorAll('.tglt').forEach((x) => x.classList.remove('on')); t.classList.add('on');
  }));
  if (res) cModal.querySelectorAll<HTMLButtonElement>('.sug-add').forEach((btn) => btn.addEventListener('click', () => {
    const item = btn.closest<HTMLElement>('.sug-item')!;
    const kind = item.dataset.kind as SuggestKind;
    const list = kind === 'tool' ? res.tools : kind === 'prompt' ? res.prompts : kind === 'resource' ? res.resources : res.skills;
    const s = { ...list[Number(item.dataset.i)] };
    const onTier = item.querySelector<HTMLElement>('.tglt.on');
    if (onTier) s.tier = onTier.dataset.t as 'free' | 'pro';
    applySuggestion(kind, exp, s, op);
    deriveSurface(exp);
    if (model) model.coverage = computeCoverage(model.apis);
    editCount++;
    reRender();
    btn.textContent = '✓ Added'; btn.disabled = true;
  }));
}

async function runSuggest(kind: SuggestKind, op?: ExpOperation): Promise<void> {
  const token = getToken();
  if (!token) { openSettings(); return; }
  const exp = targetApi();
  if (!exp) { alert('Load an API that has an OpenAPI first — suggestions extend its operations.'); return; }
  suggestModal(kind, exp, 'loading', [], '', op);
  try {
    const suggestions = await suggest(kind, exp, token, op);
    if (!suggestions.length) { suggestModal(kind, exp, 'empty', [], '', op); return; }
    suggestModal(kind, exp, 'ready', suggestions, '', op);
  } catch (e) {
    suggestModal(kind, exp, 'error', [], e instanceof Error ? e.message : String(e), op);
  }
}

let sModal: HTMLElement | null = null;
function suggestModal(kind: SuggestKind, exp: ExpApi, state: string, suggestions: Awaited<ReturnType<typeof suggest>>, err = '', op?: ExpOperation): void {
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
        : `<p class="sug-intro">Pick suggestions to add${op ? ` to <code>${esc(op.method)} ${esc(op.path)}</code>` : ` to <strong>${esc(exp.name)}</strong>`}. Each one edits the in-memory OpenAPI and re-renders the journey — download the bundle when you're happy.</p>
           <div class="sug-list">${suggestions.map((s, i) => {
             const hasTier = kind !== 'skill'; // Agent Skills aren't tiered in the model
             const def = s.tier || (kind === 'tool' && op?.tier === 'pro' ? 'pro' : 'free');
             return `
             <div class="sug-item" data-i="${i}">
               <div class="sug-text"><code>${esc(describe(kind, s))}</code>${s.description || s.summary ? `<span class="sug-desc">${esc(s.description || s.summary || '')}</span>` : ''}</div>
               <div class="sug-actions">
                 ${hasTier ? `<span class="sug-tier" title="Set the tier for this addition">
                   <button type="button" class="tglt ${def === 'free' ? 'on' : ''}" data-t="free">Free</button>
                   <button type="button" class="tglt ${def === 'pro' ? 'on' : ''}" data-t="pro">Pro</button>
                 </span>` : ''}
                 <button class="btn sug-add" data-i="${i}">+ Add</button>
               </div>
             </div>`; }).join('')}</div>`;
  sModal.innerHTML = `<div class="modal-card suggest-card">
      <div class="modal-head"><span>✨ Suggest ${esc(kind)}${op ? ` for ${esc(op.method)} ${esc(op.path)}` : ''}</span><button type="button" class="sug-close" aria-label="Close">×</button></div>
      <div class="suggest-body">${body}</div>
    </div>`;
  sModal.hidden = false;
  sModal.querySelector('.sug-close')!.addEventListener('click', () => { sModal!.hidden = true; });
  sModal.querySelectorAll<HTMLButtonElement>('.tglt').forEach((t) => t.addEventListener('click', () => {
    const wrap = t.closest('.sug-tier')!;
    wrap.querySelectorAll('.tglt').forEach((x) => x.classList.remove('on'));
    t.classList.add('on');
  }));
  sModal.querySelectorAll<HTMLButtonElement>('.sug-add').forEach((btn) => btn.addEventListener('click', () => {
    const item = btn.closest('.sug-item')!;
    const onTier = item.querySelector<HTMLElement>('.tglt.on');
    const s = { ...suggestions[Number(btn.dataset.i)] };
    if (onTier) s.tier = onTier.dataset.t as 'free' | 'pro';
    applySuggestion(kind, exp, s, op);
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
