// Render the experience model as a journey (per-operation API -> MCP -> Skill flow with tier
// shading) plus a coverage scorecard (what's wired vs. missing, to drive iteration).

import { esc, escAttr, rich, extLink, slugify } from './ui';
import type { ExperienceModel, ExpApi, ExpOperation, Tier } from './experience';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function tierBadge(tier: Tier): string {
  const label = tier === 'pro' ? 'Pro' : tier === 'free' ? 'Free' : '?';
  return `<span class="tier tier-${tier}" title="${tier === 'unknown' ? 'No x-tier declared' : tier} tier">${label}</span>`;
}

function methodChip(m: string): string {
  return `<span class="method m-${m.toLowerCase()}">${esc(m)}</span>`;
}

// One link in the chain: filled (wired) or a muted gap.
function chainCell(kind: 'mcp' | 'skill', value?: string): string {
  const icon = kind === 'mcp' ? '⚙' : '✦';
  if (value) return `<span class="node node-${kind}"><span class="node-ic">${icon}</span><code>${esc(value)}</code></span>`;
  return `<span class="node node-gap" title="No ${kind === 'mcp' ? 'MCP tool' : 'Agent Skill'} mapped">— none</span>`;
}

function journeyRow(op: ExpOperation): string {
  const op_label = `${methodChip(op.method)}<code class="op-path">${esc(op.path)}</code>`;
  const sum = op.summary ? `<span class="op-sum">${esc(op.summary)}</span>` : '';
  return `
    <div class="jrow jrow-${op.tier}">
      <div class="jcell jop">${op_label}${sum}</div>
      <div class="jarrow">→</div>
      <div class="jcell">${chainCell('mcp', op.mcpTool)}</div>
      <div class="jarrow">→</div>
      <div class="jcell">${chainCell('skill', op.agentSkill)}</div>
      <div class="jcell jtier">${tierBadge(op.tier)}</div>
    </div>`;
}

function artifactChips(a: ExpApi): string {
  const items: [string, string | undefined][] = [
    ['OpenAPI', a.hasOpenApi ? (a.openApiUrl || 'inline') : undefined],
    ['MCP', a.mcpServer], ['Skills', a.agentSkills],
    ['Pricing', a.pricing], ['Plans', a.plans], ['Auth', a.auth],
  ];
  return items.map(([label, val]) =>
    val
      ? `<span class="achip achip-on" title="${escAttr(val)}">${esc(label)}</span>`
      : `<span class="achip achip-off" title="not declared">${esc(label)}</span>`
  ).join('');
}

function coverageBar(label: string, n: number, d: number, cls = ''): string {
  const p = pct(n, d);
  return `
    <div class="cbar">
      <div class="cbar-top"><span>${esc(label)}</span><span class="cbar-num">${n}/${d} · ${p}%</span></div>
      <div class="cbar-track"><div class="cbar-fill ${cls}" style="width:${p}%"></div></div>
    </div>`;
}

// The rest of the MCP surface beyond tools: prompts (guided flows) and resources (attachable
// context) — server-level, each tier-badged. Part of the DX/AX equation.
function mcpSurface(a: ExpApi): string {
  if (!a.prompts.length && !a.resources.length) return '';
  const group = (label: string, icon: string, cls: string, items: { name: string; tier: Tier; description?: string }[]) =>
    items.length ? `
      <div class="surface-group">
        <div class="surface-h">${esc(label)} <span class="muted">${items.length}</span></div>
        ${items.map((it) => `
          <div class="surf-row surf-${it.tier}">
            <span class="node node-${cls}"><span class="node-ic">${icon}</span><code>${esc(it.name)}</code></span>
            ${tierBadge(it.tier)}
            ${it.description ? `<span class="surf-desc">${esc(it.description)}</span>` : ''}
          </div>`).join('')}
      </div>` : '';
  return `
    <div class="mcp-surface">
      <div class="surface-title">MCP prompts &amp; resources <span class="muted">— the rest of the agent surface, beyond tools</span></div>
      ${group('Prompts', '◇', 'prompt', a.prompts)}
      ${group('Resources', '▤', 'resource', a.resources.map((r) => ({ name: r.uri, tier: r.tier, description: r.description })))}
    </div>`;
}

function apiSection(a: ExpApi): string {
  const ops = a.operations;
  const gaps = ops.filter((o) => !o.mcpTool || !o.agentSkill);
  const head = `
    <div class="api-head">
      <h3 id="${escAttr(a.anchor)}">${esc(a.name)}</h3>
      <div class="achips">${artifactChips(a)}</div>
    </div>`;

  if (!a.hasOpenApi) {
    const why = a.openApiError ? `<span class="muted"> — ${esc(a.openApiError)}</span>` : '';
    return `<section class="api-block">${head}
      <p class="no-oas">No OpenAPI to map operations for this API${why}. The artifact chips above show what this API does publish.</p>
    </section>`;
  }

  const scorecard = `
    <div class="scorecard">
      ${coverageBar('Operations with an MCP tool', ops.filter((o) => o.mcpTool).length, ops.length, 'fill-mcp')}
      ${coverageBar('Operations with an Agent Skill', ops.filter((o) => o.agentSkill).length, ops.length, 'fill-skill')}
      <div class="tier-split">
        <span class="tier tier-free">Free ${ops.filter((o) => o.tier === 'free').length}</span>
        <span class="tier tier-pro">Pro ${ops.filter((o) => o.tier === 'pro').length}</span>
        ${ops.some((o) => o.tier === 'unknown') ? `<span class="tier tier-unknown">? ${ops.filter((o) => o.tier === 'unknown').length}</span>` : ''}
      </div>
    </div>`;

  const legend = `
    <div class="jhead">
      <div class="jcell">Operation</div><div class="jarrow"></div>
      <div class="jcell">MCP tool</div><div class="jarrow"></div>
      <div class="jcell">Agent Skill</div><div class="jcell jtier">Tier</div>
    </div>`;

  const gapNote = gaps.length
    ? `<p class="gap-note">${gaps.length} operation${gaps.length === 1 ? '' : 's'} ${gaps.length === 1 ? 'has' : 'have'} a gap in the chain — ${
        ops.filter((o) => !o.mcpTool).length} without an MCP tool, ${ops.filter((o) => !o.agentSkill).length} without an Agent Skill.</p>`
    : `<p class="gap-note gap-none">Every operation is wired end-to-end: API → MCP → Agent Skill. ✓</p>`;

  return `<section class="api-block">${head}${scorecard}${gapNote}
    <div class="journey">${legend}${ops.map(journeyRow).join('')}</div>
    ${mcpSurface(a)}
  </section>`;
}

export function renderExperience(model: ExperienceModel, sourceLabel: string): string {
  const d = model.doc;
  const c = model.coverage;
  const tiles = `
    <div class="tiles">
      <div class="tile"><span class="tile-n">${c.apis}</span><span class="tile-l">APIs</span></div>
      <div class="tile"><span class="tile-n">${c.apisWithOpenApi}</span><span class="tile-l">with OpenAPI</span></div>
      <div class="tile"><span class="tile-n">${c.totalOps}</span><span class="tile-l">operations</span></div>
      <div class="tile"><span class="tile-n">${pct(c.withMcp, c.totalOps)}%</span><span class="tile-l">have MCP tool</span></div>
      <div class="tile"><span class="tile-n">${pct(c.withSkill, c.totalOps)}%</span><span class="tile-l">have Agent Skill</span></div>
      <div class="tile"><span class="tile-n">${c.prompts}</span><span class="tile-l">MCP prompts</span></div>
      <div class="tile"><span class="tile-n">${c.resources}</span><span class="tile-l">MCP resources</span></div>
      <div class="tile"><span class="tile-n"><span class="tier tier-free">${c.free}</span> <span class="tier tier-pro">${c.pro}</span></span><span class="tile-l">free / pro ops</span></div>
    </div>`;

  const overall = `
    <section class="overview">
      <div class="doc-hero">
        ${d.image ? `<img class="doc-img" src="${escAttr(d.image)}" alt="" />` : ''}
        <div>
          <h2>${esc(d.name)}</h2>
          ${d.description ? `<div class="doc-desc">${rich(d.description)}</div>` : ''}
          <div class="doc-meta">
            <span class="chip">APIs.json ${esc(d.specificationVersion)}</span>
            ${d.url ? extLink(d.url, 'source') : ''}
            ${sourceLabel ? `<span class="muted">${esc(sourceLabel)}</span>` : ''}
          </div>
        </div>
      </div>
      ${tiles}
      <div class="cov-summary">
        ${coverageBar('MCP coverage across all operations', c.withMcp, c.totalOps, 'fill-mcp')}
        ${coverageBar('Agent Skill coverage across all operations', c.withSkill, c.totalOps, 'fill-skill')}
      </div>
      <p class="legend-note"><span class="node node-mcp"><span class="node-ic">⚙</span>MCP tool</span> · <span class="node node-prompt"><span class="node-ic">◇</span>prompt</span> · <span class="node node-resource"><span class="node-ic">▤</span>resource</span> · <span class="node node-skill"><span class="node-ic">✦</span>Agent Skill</span> · ${tierBadge('free')} open discovery · ${tierBadge('pro')} paid synthesis · the surface reads <strong>REST operation → MCP (tools + prompts + resources) → Agent Skill</strong>.</p>
    </section>`;

  return `<div class="experience">${overall}${model.apis.map(apiSection).join('')}</div>`;
}
