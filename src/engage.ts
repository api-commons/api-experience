// Weave API Evangelist governance services into the app. Every action routes to
// info@apievangelist.com over a mailto link, with the current context pre-filled
// — so engagement works even in a zipped-up, fully local copy, with no backend.
// API Documentation is free, open tooling; API Evangelist sells the expert
// services around it, and this is the always-present front door to them.
const EMAIL = 'info@apievangelist.com';
const APP = 'API Experience';
const SERVICES_URL = 'https://apievangelist.com/services/';

interface Service {
  title: string;
  blurb: string;
  cta: string;
  subject: string;
  body: (ctx: string) => string;
}

// Ordered for this tool — people arrive here holding an APIs.json (or wishing
// they had one), so artifact creation and review lead.
const SERVICES: Service[] = [
  {
    title: 'Artifact creation',
    blurb: 'No APIs.json yet — or one missing OpenAPI, Arazzo, MCP, or skill artifacts? We create governed artifacts for your APIs.',
    cta: 'Request an artifact',
    subject: 'API artifact creation request',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like help creating governed API artifacts (APIs.json / OpenAPI / AsyncAPI / Arazzo / MCP / skill).\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Governance review',
    blurb: 'Have an API Evangelist expert review your APIs.json and the artifacts it carries against best practices and your own standards.',
    cta: 'Request a review',
    subject: 'Governance review request',
    body: (ctx) => `Hi API Evangelist,\n\nI'd like a governance review of an APIs.json and its artifacts.\n\n${ctx}\n\nI'll attach or paste the artifact in my reply — what does an engagement look like?\n\nThanks,`,
  },
  {
    title: 'Discovery & inventory',
    blurb: 'Map the APIs you produce and the ones you depend on into a governed, searchable inventory with provenance.',
    cta: 'Map my APIs',
    subject: 'API discovery & inventory engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like help discovering and inventorying our API estate and dependencies.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Consumer API governance',
    blurb: 'Govern the APIs you consume, not just the ones you produce — agent-safety rulesets, consumption gates, and the context you hand to AI.',
    cta: 'Govern consumption',
    subject: 'Consumer API governance engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe want to govern the APIs and context our AI integrations consume.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Custom rulesets',
    blurb: 'We encode your organization’s standards as portable rules you can run in CI, the editor, and the browser.',
    cta: 'Talk rulesets',
    subject: 'Custom ruleset engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like custom rulesets that encode our API standards.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Training & advisory',
    blurb: 'Workshops and an ongoing governance retainer to stand up producer and consumer governance across your teams.',
    cta: 'Start a conversation',
    subject: 'API governance training & advisory',
    body: (ctx) => `Hi API Evangelist,\n\nWe’re interested in API governance training / an advisory retainer.\n\n${ctx}\n\nThanks,`,
  },
];

function mailto(s: Service, ctx: string): string {
  const body = `${s.body(ctx)}\n\n— sent from ${APP} (experience.apicommons.org)`;
  return `mailto:${EMAIL}?subject=${encodeURIComponent(s.subject)}&body=${encodeURIComponent(body)}`;
}

export function initEngage(context: () => string): void {
  const btn = document.getElementById('engage-ae');
  if (!btn) return;

  const modal = document.createElement('div');
  modal.className = 'modal engage-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card engage-card">
      <div class="modal-head">
        <span id="modal-title">Work with API Evangelist</span>
        <button type="button" class="engage-close" aria-label="Close">×</button>
      </div>
      <div class="engage-body">
        <p class="engage-intro">API Experience is open and free to run yourself. When you want experts in the loop,
          <a href="https://apievangelist.com" target="_blank" rel="noopener">API Evangelist</a> offers governance
          services — every option below opens an email to
          <a id="engage-email" href="mailto:${EMAIL}">${EMAIL}</a> with your current context filled in.</p>
        <div class="engage-services"></div>
        <p class="engage-foot"><a href="${SERVICES_URL}" target="_blank" rel="noopener">See all governance services →</a></p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const listEl = modal.querySelector('.engage-services') as HTMLElement;
  const emailEl = modal.querySelector('#engage-email') as HTMLAnchorElement;
  const close = () => { modal.hidden = true; };

  function render(): void {
    const ctx = context();
    listEl.innerHTML = SERVICES.map((s, i) => `
      <div class="engage-service">
        <div class="engage-service-text"><strong>${s.title}</strong><span>${s.blurb}</span></div>
        <a class="engage-cta" href="${mailto(s, ctx)}" data-i="${i}">${s.cta}</a>
      </div>`).join('');
    emailEl.href = mailto(SERVICES[0], ctx);
  }

  btn.addEventListener('click', () => { render(); modal.hidden = false; });
  modal.querySelector('.engage-close')!.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
