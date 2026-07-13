// The iteration engine: ask Claude (steered by the guide skill) for concrete, buildable additions
// to an API's surface, let the user pick, and apply the pick by mutating the in-memory OpenAPI —
// which re-derives the journey + coverage with no re-fetch. Kinds map to the DX/AX surface:
// path/tool → an operation (+ its MCP tool), prompt → a guided flow, resource → attachable context,
// skill → an Agent Skill wrapping an operation.

import { callClaudeJSON } from './claude';
import { getGuideSkill } from './guide';
import type { ExpApi, ExpOperation } from './experience';

export type SuggestKind = 'path' | 'tool' | 'prompt' | 'resource' | 'skill';

export interface Suggestion {
  // superset across kinds; only the relevant fields are populated per kind
  path?: string; method?: string; operationId?: string; summary?: string;
  tier?: 'free' | 'pro'; mcpTool?: string; agentSkill?: string;
  name?: string; description?: string; uses?: string[]; uri?: string; operation?: string;
}

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// A compact description of the API's current surface for grounding.
function context(exp: ExpApi): string {
  const ops = exp.operations.map((o) =>
    `  ${o.method} ${o.path}  (id:${o.operationId || '?'}, tier:${o.tier}, tool:${o.mcpTool || '—'}, skill:${o.agentSkill || '—'})`).join('\n');
  const prompts = exp.prompts.map((p) => `  ${p.name} [${p.tier}] uses:[${(p.uses || []).join(',')}]`).join('\n') || '  (none)';
  const resources = exp.resources.map((r) => `  ${r.uri} [${r.tier}] op:${r.operation || '—'}`).join('\n') || '  (none)';
  return `API: ${exp.name}
Operations (${exp.operations.length}):
${ops || '  (none)'}
Prompts:
${prompts}
Resources:
${resources}`;
}

const tierEnum = { type: 'string', enum: ['free', 'pro'] };
const methodEnum = { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] };
const strT = { type: 'string' };

// `scoped` = suggesting for a specific existing operation (inline), so operation-identifying
// fields (path/method/operationId) are already known and dropped from the schema.
function schemaFor(kind: SuggestKind, scoped: boolean): Record<string, unknown> {
  const item = (props: Record<string, unknown>, required: string[]) =>
    ({ type: 'object', additionalProperties: false, properties: props, required });
  let itemSchema: Record<string, unknown>;
  if (kind === 'path') {
    itemSchema = item(
      { path: strT, method: methodEnum, operationId: strT, summary: strT, tier: tierEnum, mcpTool: strT, agentSkill: strT },
      ['path', 'method', 'operationId', 'summary', 'tier', 'mcpTool']);
  } else if (kind === 'tool') {
    itemSchema = item({ mcpTool: strT, description: strT }, ['mcpTool', 'description']);
  } else if (kind === 'prompt') {
    itemSchema = item({ name: strT, tier: tierEnum, description: strT, uses: { type: 'array', items: strT } },
      ['name', 'tier', 'description', 'uses']);
  } else if (kind === 'resource') {
    itemSchema = item({ uri: strT, tier: tierEnum, description: strT, operation: strT }, ['uri', 'tier', 'description']);
  } else { // skill
    const props: Record<string, unknown> = { name: strT, description: strT };
    if (!scoped) props.operationId = strT;
    itemSchema = item(props, scoped ? ['name', 'description'] : ['name', 'description', 'operationId']);
  }
  return { type: 'object', additionalProperties: false, required: ['suggestions'], properties: { suggestions: { type: 'array', items: itemSchema } } };
}

const ASK: Record<SuggestKind, string> = {
  path: 'Suggest up to 4 NEW REST operations (paths) this API should add to round out its surface. For each, include the MCP tool name it maps to and its free/pro tier. Fill the most valuable gaps first.',
  tool: 'Suggest 1-3 MCP tool names for the focus operation below — the tool an agent would call to invoke it. lower_snake_case verb. Include a one-line description.',
  prompt: 'Suggest up to 4 MCP prompts (guided multi-step flows). Each lists the MCP tool names it orchestrates in "uses" (use existing tool names where possible).',
  resource: 'Suggest up to 4 MCP resources (attachable context documents). Give each a stable apis://-style uri; set "operation" to the backing operationId when one applies.',
  skill: 'Suggest up to 4 Agent Skills, each wrapping a repeatable task. Use a short kebab-case slug for the name.',
};

export async function suggest(kind: SuggestKind, exp: ExpApi, token: string, op?: ExpOperation): Promise<Suggestion[]> {
  const focus = op
    ? `\nFocus on this specific operation:\n  ${op.method} ${op.path}  (id:${op.operationId || '?'}, tier:${op.tier}, tool:${op.mcpTool || '—'}, skill:${op.agentSkill || '—'})\nMake the suggestion(s) specifically for it — a ${kind} that attaches to this operation.\n`
    : '';
  const prompt = `${ASK[kind]}
${focus}
Here is the API's current surface — extend it, don't invent unrelated features:

${context(exp)}

Return ONLY the suggestions object.`;
  const out = await callClaudeJSON<{ suggestions: Suggestion[] }>({ token, system: getGuideSkill(), prompt, schema: schemaFor(kind, !!op) });
  return (out.suggestions || []).slice(0, 8);
}

// A one-line human label for a suggestion in the picker.
export function describe(kind: SuggestKind, s: Suggestion): string {
  if (kind === 'path') return `${s.method} ${s.path} → ${s.mcpTool} [${s.tier}]`;
  if (kind === 'tool') return `⚙ ${s.mcpTool}`;
  if (kind === 'prompt') return `◇ ${s.name} [${s.tier}]`;
  if (kind === 'resource') return `▤ ${s.uri} [${s.tier}]`;
  return `✦ ${s.name}`;
}

// Mutate exp.oaDoc in place. When `op` is set, the suggestion attaches to that existing operation.
// Caller re-derives + re-renders.
export function applySuggestion(kind: SuggestKind, exp: ExpApi, s: Suggestion, op?: ExpOperation): void {
  const doc = exp.oaDoc;
  if (!doc) return;
  if (!doc.paths || typeof doc.paths !== 'object') doc.paths = {};
  if (!doc['x-apis-io'] || typeof doc['x-apis-io'] !== 'object') doc['x-apis-io'] = {};
  const x = asObj(doc['x-apis-io']);
  if (!x.operations) x.operations = {};
  if (!Array.isArray(x.prompts)) x.prompts = [];
  if (!Array.isArray(x.resources)) x.resources = [];
  doc['x-apis-io'] = x;
  const paths = asObj(doc.paths);
  const ops = asObj(x.operations);
  // Mutate an existing operation (found by operationId) across whatever method it lives under.
  const onOp = (operationId: string, apply: (o: Record<string, unknown>) => void) => {
    for (const pi of Object.values(paths)) {
      const item = asObj(pi);
      for (const mk of Object.keys(item)) {
        const o = asObj(item[mk]);
        if (o.operationId === operationId) apply(o);
      }
    }
  };

  if (kind === 'tool' && op?.operationId) {
    // Attach an MCP tool to an existing operation (inline suggestion). A chosen tier also sets the
    // operation's tier (a tool's tier IS its operation's tier).
    onOp(op.operationId, (o) => { o['x-mcp-tool'] = s.mcpTool || ''; if (s.tier) o['x-tier'] = s.tier; });
    const mapped = asObj(ops[op.operationId]);
    mapped.mcpTool = s.mcpTool || '';
    mapped.tier = s.tier || mapped.tier || (op.tier === 'unknown' ? 'free' : op.tier);
    ops[op.operationId] = mapped;
  } else if (kind === 'path') {
    // Add a brand-new operation (global suggestion).
    const p = s.path || '/new'; const m = (s.method || 'GET').toLowerCase(); const id = s.operationId || 'newOp';
    const pathItem = asObj(paths[p]); paths[p] = pathItem;
    pathItem[m] = {
      operationId: id, summary: s.summary || '', tags: ['Suggested'],
      'x-tier': s.tier || 'free', 'x-mcp-tool': s.mcpTool || '',
      ...(s.agentSkill ? { 'x-agent-skill': s.agentSkill } : {}),
      responses: { '200': { description: s.summary || 'Suggested operation.' } },
    };
    doc.paths = paths;
    ops[id] = { tier: s.tier || 'free', mcpTool: s.mcpTool || '', ...(s.agentSkill ? { agentSkill: s.agentSkill } : {}) };
  } else if (kind === 'prompt') {
    const uses = [...(s.uses || [])];
    if (op?.mcpTool && !uses.includes(op.mcpTool)) uses.push(op.mcpTool);
    (x.prompts as unknown[]).push({ name: s.name, tier: s.tier || 'free', description: s.description || '', uses });
  } else if (kind === 'resource') {
    const operation = op?.operationId || s.operation;
    (x.resources as unknown[]).push({ uri: s.uri, tier: s.tier || 'free', description: s.description || '', ...(operation ? { operation } : {}) });
  } else { // skill — attach to the focus (or suggested) operation
    const id = op?.operationId || s.operationId; const slug = s.name;
    if (id) { onOp(id, (o) => { o['x-agent-skill'] = slug; }); const mapped = asObj(ops[id]); mapped.agentSkill = slug; ops[id] = mapped; }
  }
}
