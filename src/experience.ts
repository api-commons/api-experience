// Build the DX/AX "experience" model from an APIs.json + the OpenAPI(s) it references.
//
// The experience chain is: REST operation -> MCP tool -> Agent Skill, plus the free/paid tier.
// The truth lives in the OpenAPI as extensions authored per Part A:
//   - top-level `x-apis-io.operations`: { operationId: { tier, mcpTool, agentSkill } }
//   - per-operation `x-tier` / `x-mcp-tool` / `x-agent-skill` (win over the map)
// API-level artifacts (MCP server, Agent Skills index, pricing, plans, auth) come from the
// APIs.json `properties`. Nothing throws; missing pieces become gaps the coverage view surfaces.

import { parse as parseYAML } from 'yaml';
import type { ApisDoc, ApiItem, PropertyItem } from './model';

export type Tier = 'free' | 'pro' | 'unknown';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

// Property-type aliases (case-insensitive) for the artifacts we care about.
const TYPES = {
  openapi: ['openapi', 'swagger', 'openapispec', 'oas'],
  mcp: ['mcpserver', 'mcp', 'mcpservercard', 'modelcontextprotocol', 'mcp server'],
  skills: ['agentskills', 'agentskill', 'agent skill', 'skills', 'skill'],
  pricing: ['pricing'],
  plans: ['plans', 'plan'],
  auth: ['authentication', 'security', 'auth'],
};

export interface ExpOperation {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  tags: string[];
  tier: Tier;
  mcpTool?: string;
  agentSkill?: string;
}

export interface ExpApi {
  api: ApiItem;
  name: string;
  anchor: string;
  openApiUrl?: string;
  hasOpenApi: boolean;
  openApiError?: string;
  operations: ExpOperation[];
  mcpServer?: string;
  agentSkills?: string;
  pricing?: string;
  plans?: string;
  auth?: string;
}

export interface Coverage {
  apis: number;
  apisWithOpenApi: number;
  totalOps: number;
  withMcp: number;
  withSkill: number;
  free: number;
  pro: number;
}

export interface ExperienceModel {
  doc: ApisDoc;
  apis: ExpApi[];
  coverage: Coverage;
}

const lc = (s: unknown) => String(s ?? '').toLowerCase().trim();
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function findProp(props: PropertyItem[], aliases: string[]): PropertyItem | undefined {
  return props.find((p) => aliases.includes(lc(p.type)));
}

// Resolve one API's OpenAPI: inline `data` wins, else fetch the `url`.
async function loadOpenApi(prop: PropertyItem): Promise<{ doc?: Record<string, unknown>; url?: string; error?: string }> {
  if (prop.data !== undefined && prop.data !== null) {
    if (typeof prop.data === 'object') return { doc: prop.data as Record<string, unknown> };
    if (typeof prop.data === 'string') {
      try { return { doc: parseAny(prop.data) }; } catch (e) { return { error: `inline data: ${msg(e)}` }; }
    }
  }
  if (prop.url) {
    try {
      const res = await fetch(prop.url, { headers: { accept: 'application/yaml, application/json, text/plain, */*' } });
      if (!res.ok) return { url: prop.url, error: `HTTP ${res.status} fetching OpenAPI` };
      return { url: prop.url, doc: parseAny(await res.text()) };
    } catch (e) {
      return { url: prop.url, error: `${msg(e)} (often CORS — the OpenAPI host must allow cross-origin reads)` };
    }
  }
  return { error: 'no url or inline data' };
}

function parseAny(text: string): Record<string, unknown> {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return obj(JSON.parse(t));
  return obj(parseYAML(t));
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Pull the operation list + extensions out of a parsed OpenAPI document.
function extractOperations(doc: Record<string, unknown>): ExpOperation[] {
  const map = obj(obj(doc['x-apis-io']).operations); // operationId -> {tier, mcpTool, agentSkill}
  const paths = obj(doc.paths);
  const out: ExpOperation[] = [];
  for (const [path, pathItemRaw] of Object.entries(paths)) {
    const pathItem = obj(pathItemRaw);
    for (const method of METHODS) {
      const op = obj(pathItem[method]);
      if (!Object.keys(op).length) continue;
      const operationId = typeof op.operationId === 'string' ? op.operationId : undefined;
      const mapped = operationId ? obj(map[operationId]) : {};
      const tierRaw = lc(op['x-tier'] ?? mapped.tier);
      const tier: Tier = tierRaw === 'free' || tierRaw === 'pro' ? tierRaw : 'unknown';
      out.push({
        method: method.toUpperCase(),
        path,
        operationId,
        summary: typeof op.summary === 'string' ? op.summary : undefined,
        tags: Array.isArray(op.tags) ? (op.tags as unknown[]).map(String) : [],
        tier,
        mcpTool: str(op['x-mcp-tool'] ?? mapped.mcpTool),
        agentSkill: str(op['x-agent-skill'] ?? mapped.agentSkill),
      });
    }
  }
  return out;
}
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export async function buildExperience(doc: ApisDoc): Promise<ExperienceModel> {
  const apis: ExpApi[] = [];
  for (const api of doc.apis) {
    const props = api.properties;
    const oaProp = findProp(props, TYPES.openapi);
    const exp: ExpApi = {
      api,
      name: api.name,
      anchor: api.anchor,
      hasOpenApi: false,
      operations: [],
      mcpServer: findProp(props, TYPES.mcp)?.url,
      agentSkills: findProp(props, TYPES.skills)?.url,
      pricing: findProp(props, TYPES.pricing)?.url,
      plans: findProp(props, TYPES.plans)?.url,
      auth: findProp(props, TYPES.auth)?.url,
    };
    if (oaProp) {
      const { doc: oaDoc, url, error } = await loadOpenApi(oaProp);
      exp.openApiUrl = url || oaProp.url;
      if (oaDoc) {
        exp.hasOpenApi = true;
        exp.operations = extractOperations(oaDoc);
      } else {
        exp.openApiError = error;
      }
    }
    apis.push(exp);
  }

  const allOps = apis.flatMap((a) => a.operations);
  const coverage: Coverage = {
    apis: apis.length,
    apisWithOpenApi: apis.filter((a) => a.hasOpenApi).length,
    totalOps: allOps.length,
    withMcp: allOps.filter((o) => o.mcpTool).length,
    withSkill: allOps.filter((o) => o.agentSkill).length,
    free: allOps.filter((o) => o.tier === 'free').length,
    pro: allOps.filter((o) => o.tier === 'pro').length,
  };
  return { doc, apis, coverage };
}
