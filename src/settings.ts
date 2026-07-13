// Settings: the Claude API token + the guide skill, both stored in the browser (localStorage).
// The token never leaves this browser except on direct calls to api.anthropic.com (see claude.ts).

import { esc } from './ui';
import { getGuideSkill, setGuideSkill, resetGuideSkill, DEFAULT_GUIDE_SKILL } from './guide';

const TOKEN_KEY = 'apix.claudeToken';

export function getToken(): string { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
export function setToken(t: string): void { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } }
export function clearToken(): void { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } }
export function hasToken(): boolean { return !!getToken(); }

let modal: HTMLElement | null = null;
let onChange: (() => void) | null = null;

function build(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'modal settings-modal';
  el.hidden = true;
  el.innerHTML = `
    <div class="modal-card settings-card">
      <div class="modal-head">
        <span>Settings — iteration layer</span>
        <button type="button" class="settings-close" aria-label="Close">×</button>
      </div>
      <div class="settings-body">
        <section class="set-block">
          <h4>Claude API token</h4>
          <p class="set-note">Paste your Anthropic API key to enable AI suggestions. It's stored <strong>only in this browser</strong> (localStorage) and sent <strong>only</strong> to <code>api.anthropic.com</code> when you ask for a suggestion — it never touches any server of ours. Clear it anytime. Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.</p>
          <div class="set-row">
            <input type="password" id="set-token" placeholder="sk-ant-…" autocomplete="off" spellcheck="false" />
            <button class="btn" id="set-token-save">Save</button>
            <button class="btn ghost-btn" id="set-token-clear">Clear</button>
          </div>
          <div class="set-status" id="set-token-status"></div>
        </section>
        <section class="set-block">
          <h4>Guide skill <span class="muted">— the Agent Skill that steers every suggestion</span></h4>
          <p class="set-note">This single skill isn't tied to any one API — it rides along with each Claude call as the system prompt and shapes how suggestions are made. Edit it to encode your house rules and it gets smarter over time. Included in the downloaded bundle.</p>
          <textarea id="set-guide" rows="14" spellcheck="false"></textarea>
          <div class="set-row">
            <button class="btn" id="set-guide-save">Save guide</button>
            <button class="btn ghost-btn" id="set-guide-reset">Reset to default</button>
            <span class="set-status" id="set-guide-status"></span>
          </div>
        </section>
      </div>
    </div>`;
  document.body.appendChild(el);

  const close = () => { el.hidden = true; };
  el.querySelector('.settings-close')!.addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });

  const tokenIn = el.querySelector('#set-token') as HTMLInputElement;
  const tokenStatus = el.querySelector('#set-token-status') as HTMLElement;
  const guideIn = el.querySelector('#set-guide') as HTMLTextAreaElement;
  const guideStatus = el.querySelector('#set-guide-status') as HTMLElement;

  el.querySelector('#set-token-save')!.addEventListener('click', () => {
    setToken(tokenIn.value.trim());
    tokenStatus.textContent = hasToken() ? '✓ Saved in this browser' : 'Empty — not saved';
    onChange?.();
  });
  el.querySelector('#set-token-clear')!.addEventListener('click', () => {
    clearToken(); tokenIn.value = ''; tokenStatus.textContent = 'Cleared'; onChange?.();
  });
  el.querySelector('#set-guide-save')!.addEventListener('click', () => {
    setGuideSkill(guideIn.value); guideStatus.textContent = '✓ Saved';
  });
  el.querySelector('#set-guide-reset')!.addEventListener('click', () => {
    resetGuideSkill(); guideIn.value = DEFAULT_GUIDE_SKILL; guideStatus.textContent = 'Reset to default';
  });

  return el;
}

export function initSettings(changed: () => void): void { onChange = changed; }

export function openSettings(): void {
  if (!modal) modal = build();
  (modal.querySelector('#set-token') as HTMLInputElement).value = getToken();
  (modal.querySelector('#set-guide') as HTMLTextAreaElement).value = getGuideSkill();
  (modal.querySelector('#set-token-status') as HTMLElement).textContent = hasToken() ? '✓ A token is saved' : 'No token saved yet';
  (modal.querySelector('#set-guide-status') as HTMLElement).textContent = '';
  modal.hidden = false;
}
