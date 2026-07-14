// The Experience Map: one picture of the whole surface — every operation, MCP tool, prompt,
// resource, and Agent Skill, and the relationships between them, tier-coloured (free / pro / unmapped).
// Pure computed SVG (no deps): four lanes, cubic-bezier links, hover/click to isolate a path.

import type { ExperienceModel, Tier } from './experience';
import { esc, escAttr } from './ui';

interface Node { id: string; label: string; sub?: string; tier: Tier | 'struct'; y: number; cx: number; adj: Set<string>; }
interface Link { a: string; b: string; tier: Tier; }

const NW = 214, NH = 26, PITCH = 32, PADX = 40, HEADER = 44, LANE_GAP = 96;
const trunc = (s: string, n = 30) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// Build the four-lane graph from the model. Tools + skills are structural (they inherit meaning
// from the operations wired to them); operations, prompts, and resources carry the tier colour.
function build(model: ExperienceModel) {
  const ops = model.apis.flatMap((a) => a.operations);
  const prompts = model.apis.flatMap((a) => a.prompts);
  const resources = model.apis.flatMap((a) => a.resources);

  const opId = (i: number) => `op:${i}`;
  const toolId = (n: string) => `tool:${n}`;
  const promptId = (n: string) => `pr:${n}`;
  const resId = (u: string) => `re:${u}`;
  const skillId = (n: string) => `sk:${n}`;

  const lanes: Record<string, Node[]> = { op: [], tool: [], surf: [], skill: [] };
  const links: Link[] = [];
  const adj = (id: string) => byId.get(id)!.adj;
  const byId = new Map<string, Node>();
  const push = (lane: string, n: Node) => { lanes[lane].push(n); byId.set(n.id, n); return n; };

  // Operations
  ops.forEach((o, i) => push('op', { id: opId(i), label: `${o.method} ${o.path}`, sub: o.summary, tier: o.tier, y: 0, cx: 0, adj: new Set() }));
  // Tools (unique), Skills (unique)
  const toolNames = [...new Set(ops.map((o) => o.mcpTool).filter(Boolean) as string[])].sort();
  const skillNames = [...new Set(ops.map((o) => o.agentSkill).filter(Boolean) as string[])].sort();
  toolNames.forEach((n) => push('tool', { id: toolId(n), label: n, tier: 'struct', y: 0, cx: 0, adj: new Set() }));
  // Prompts + Resources share the "MCP surface" lane.
  prompts.forEach((p) => push('surf', { id: promptId(p.name), label: '◇ ' + p.name, sub: p.description, tier: p.tier, y: 0, cx: 0, adj: new Set() }));
  resources.forEach((r) => push('surf', { id: resId(r.uri), label: '▤ ' + r.uri, sub: r.description, tier: r.tier, y: 0, cx: 0, adj: new Set() }));
  skillNames.forEach((n) => push('skill', { id: skillId(n), label: n, tier: 'struct', y: 0, cx: 0, adj: new Set() }));

  const link = (a: string, b: string, tier: Tier) => {
    if (!byId.has(a) || !byId.has(b)) return;
    links.push({ a, b, tier }); adj(a).add(b); adj(b).add(a);
  };
  ops.forEach((o, i) => {
    if (o.mcpTool) link(opId(i), toolId(o.mcpTool), o.tier);           // operation → its MCP tool
    if (o.agentSkill) link(opId(i), skillId(o.agentSkill), o.tier);    // operation → its Agent Skill
    if (o.operationId) for (const r of resources) if (r.operation === o.operationId) link(opId(i), resId(r.uri), o.tier); // operation → resource it backs
  });
  for (const p of prompts) for (const t of p.uses || []) link(toolId(t), promptId(p.name), p.tier); // tool → prompt that orchestrates it

  return { lanes, links, byId };
}

const LANES = [
  { key: 'op', title: 'Operations' },
  { key: 'tool', title: 'MCP tools' },
  { key: 'surf', title: 'Prompts & resources' },
  { key: 'skill', title: 'Agent skills' },
] as const;

const tierClass = (t: Tier | 'struct') => `fmn-${t}`;

export function renderFlowMap(model: ExperienceModel): string {
  const { lanes, links, byId } = build(model);
  const laneCounts = LANES.map((l) => lanes[l.key].length);
  const maxCount = Math.max(1, ...laneCounts);
  const contentH = maxCount * PITCH;
  const height = HEADER + contentH + 24;
  const laneW = NW + LANE_GAP;
  const width = PADX * 2 + laneW * LANES.length - LANE_GAP;

  // Lay out: each lane centred vertically so links stay flat; assign y + cx.
  LANES.forEach((l, li) => {
    const cx = PADX + NW / 2 + li * laneW;
    const arr = lanes[l.key];
    const startY = HEADER + Math.max(0, (contentH - arr.length * PITCH) / 2);
    arr.forEach((n, i) => { n.cx = cx; n.y = startY + i * PITCH; });
  });

  const anchorR = (n: Node) => [n.cx + NW / 2, n.y + NH / 2];
  const anchorL = (n: Node) => [n.cx - NW / 2, n.y + NH / 2];

  // Links behind nodes. Left→right lane order guarantees a is left of b for adjacent chains; for
  // spanning links (op→resource, op→skill) we still go right-of-source to left-of-target.
  const linkSvg = links.map((lk, i) => {
    const A = byId.get(lk.a)!, B = byId.get(lk.b)!;
    const [sx, sy] = A.cx <= B.cx ? anchorR(A) : anchorL(A);
    const [tx, ty] = A.cx <= B.cx ? anchorL(B) : anchorR(B);
    const dx = Math.max(28, Math.abs(tx - sx) / 2);
    const d = `M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`;
    return `<path class="fmlink fml-${lk.tier}" data-i="${i}" data-a="${escAttr(lk.a)}" data-b="${escAttr(lk.b)}" d="${d}" />`;
  }).join('');

  const nodeSvg = LANES.flatMap((l) => lanes[l.key].map((n) => {
    const title = n.sub ? `${n.label} — ${n.sub}` : n.label;
    return `<g class="fmn ${tierClass(n.tier)}" data-id="${escAttr(n.id)}" data-adj="${escAttr([...n.adj].join(' '))}" transform="translate(${n.cx - NW / 2},${n.y})">
      <title>${esc(title)}</title>
      <rect class="fmn-box" width="${NW}" height="${NH}" rx="6" />
      <text class="fmn-t" x="10" y="${NH / 2 + 4}">${esc(trunc(n.label))}</text>
    </g>`;
  })).join('');

  const laneHeads = LANES.map((l, li) => {
    const cx = PADX + NW / 2 + li * laneW;
    return `<text class="fm-lane" x="${cx}" y="26" text-anchor="middle">${esc(l.title)} <tspan class="fm-lane-n">${lanes[l.key].length}</tspan></text>`;
  }).join('');

  const c = model.coverage;
  const stats = [
    ['Operations', String(c.totalOps)],
    ['Free / Pro', `${c.free} / ${c.pro}`],
    ['MCP tools', String(new Set(model.apis.flatMap((a) => a.operations).map((o) => o.mcpTool).filter(Boolean)).size)],
    ['Prompts', String(c.prompts)],
    ['Resources', String(c.resources)],
    ['Skills', String(new Set(model.apis.flatMap((a) => a.operations).map((o) => o.agentSkill).filter(Boolean)).size)],
  ];

  return `
    <div class="fm-wrap">
      <div class="fm-bar">
        <div class="fm-stats">${stats.map(([k, v]) => `<span class="fm-stat"><b>${esc(v)}</b>${esc(k)}</span>`).join('')}</div>
        <div class="fm-legend">
          <span class="fm-key fm-free">Free</span>
          <span class="fm-key fm-pro">Pro</span>
          <span class="fm-key fm-unknown">Unmapped</span>
          <span class="fm-hint">hover a node to trace its flow · click to pin</span>
        </div>
      </div>
      <div class="fm-scroll">
        <svg class="fm-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Experience map">
          <g class="fm-links">${linkSvg}</g>
          <g class="fm-heads">${laneHeads}</g>
          <g class="fm-nodes">${nodeSvg}</g>
        </svg>
      </div>
    </div>`;
}

// Wire hover + click-to-pin isolation inside a rendered map container.
export function wireFlowMap(root: HTMLElement): void {
  const svg = root.querySelector<SVGSVGElement>('.fm-svg');
  if (!svg) return;
  const nodes = [...svg.querySelectorAll<SVGGElement>('.fmn')];
  const links = [...svg.querySelectorAll<SVGPathElement>('.fmlink')];
  let pinned: string | null = null;

  const clear = () => { svg.classList.remove('fm-focus'); nodes.forEach((n) => n.classList.remove('on')); links.forEach((l) => l.classList.remove('on')); };
  const focus = (id: string) => {
    const start = nodes.find((n) => n.dataset.id === id);
    if (!start) return;
    const keep = new Set<string>([id, ...(start.dataset.adj || '').split(' ').filter(Boolean)]);
    svg.classList.add('fm-focus');
    nodes.forEach((n) => n.classList.toggle('on', keep.has(n.dataset.id!)));
    links.forEach((l) => l.classList.toggle('on', (l.dataset.a === id || l.dataset.b === id)));
  };
  nodes.forEach((n) => {
    n.addEventListener('mouseenter', () => { if (!pinned) focus(n.dataset.id!); });
    n.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pinned === n.dataset.id) { pinned = null; clear(); }
      else { pinned = n.dataset.id!; focus(pinned); }
    });
  });
  svg.addEventListener('mouseleave', () => { if (!pinned) clear(); });
}
