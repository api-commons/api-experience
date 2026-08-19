// Normalize any APIs.json (0.11 → 0.21) into one tolerant internal model.
// Older files use a subset of the fields; newer files add identifiers,
// promoted collections, and inline data properties. Nothing here throws on
// missing or oddly-shaped fields — the renderer degrades gracefully.

export interface PropertyItem {
  type?: string;
  name?: string;
  description?: string;
  mediaType?: string;
  url?: string;
  data?: unknown;
  tags?: unknown[];
}

export interface Contact {
  FN?: string;
  email?: string;
  organizationName?: string;
  url?: string;
  photo?: string;
  [k: string]: unknown;
}

export interface ApiItem {
  aid?: string;
  name: string;
  description?: string;
  image?: string;
  humanURL?: string;
  baseURL?: string;
  created?: string;
  modified?: string;
  tags?: unknown[];
  properties: PropertyItem[];
  prompts: PropertyItem[];
  rules: PropertyItem[];
  workflows: PropertyItem[];
  contact: Contact[];
  meta: { key?: string; value?: unknown }[];
  anchor: string;
}

export interface NamedUrl {
  name?: string;
  url?: string;
}

export interface ApisDoc {
  raw: Record<string, unknown>;
  specificationVersion: string;
  name: string;
  description?: string;
  image?: string;
  url?: string;
  created?: string;
  modified?: string;
  aid?: string;
  type?: string;
  kind?: string;
  visibility?: string;
  rating?: string;
  position?: string;
  access?: string;
  tags?: unknown[];
  apis: ApiItem[];
  common: PropertyItem[];
  prompts: PropertyItem[];
  rules: PropertyItem[];
  workflows: PropertyItem[];
  include: NamedUrl[];
  overlays: NamedUrl[];
  network: NamedUrl[];
  maintainers: Contact[];
  unknownKeys: string[];
}

const ROOT_KEYS = new Set([
  'aid', 'visibility', 'rating', 'type', 'kind', 'position', 'access',
  'name', 'description', 'url', 'image', 'created', 'modified',
  'specificationVersion', 'apis', 'maintainers', 'tags', 'include',
  'common', 'prompts', 'rules', 'workflows', 'overlays', 'network',
]);

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function asProps(v: unknown): PropertyItem[] {
  return asArray<Record<string, unknown>>(v)
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      type: str(p.type),
      name: str(p.name),
      description: str(p.description),
      mediaType: str(p.mediaType),
      url: str(p.url),
      data: p.data,
      tags: asArray(p.tags),
    }));
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;
}

function asNamedUrls(v: unknown): NamedUrl[] {
  return asArray<Record<string, unknown>>(v)
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({ name: str(x.name), url: str(x.url) }));
}

function asContacts(v: unknown): Contact[] {
  return asArray<unknown>(v)
    .map((m) => (typeof m === 'string' ? { FN: m } : m && typeof m === 'object' ? (m as Contact) : null))
    .filter(Boolean) as Contact[];
}

export function normalize(raw: unknown): ApisDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Not an APIs.json document: expected a top-level JSON object.');
  }
  const r = raw as Record<string, unknown>;
  const usedAnchors = new Set<string>();

  const apis: ApiItem[] = asArray<Record<string, unknown>>(r.apis)
    .filter((a) => a && typeof a === 'object')
    .map((a, i) => {
      const name = str(a.name) || `API ${i + 1}`;
      let anchor = 'api-' + (str(a.aid) || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      while (usedAnchors.has(anchor)) anchor += '-' + i;
      usedAnchors.add(anchor);
      return {
        aid: str(a.aid),
        name,
        description: str(a.description),
        image: str(a.image),
        humanURL: str(a.humanURL),
        baseURL: str(a.baseURL),
        created: str(a.created),
        modified: str(a.modified),
        tags: asArray(a.tags),
        properties: asProps(a.properties),
        prompts: asProps(a.prompts),
        rules: asProps(a.rules),
        workflows: asProps(a.workflows),
        contact: asContacts(a.contact),
        meta: asArray(a.meta) as ApiItem['meta'],
        anchor,
      };
    });

  return {
    raw: r,
    specificationVersion: str(r.specificationVersion) || 'unknown',
    name: str(r.name) || 'Untitled APIs.json',
    description: str(r.description),
    image: str(r.image),
    url: str(r.url),
    created: str(r.created),
    modified: str(r.modified),
    aid: str(r.aid),
    type: str(r.type),
    kind: str(r.kind),
    visibility: str(r.visibility),
    rating: str(r.rating),
    position: str(r.position),
    access: str(r.access),
    tags: asArray(r.tags),
    apis,
    common: asProps(r.common),
    prompts: asProps(r.prompts),
    rules: asProps(r.rules),
    workflows: asProps(r.workflows),
    include: asNamedUrls(r.include),
    overlays: asNamedUrls(r.overlays),
    network: asNamedUrls(r.network),
    maintainers: asContacts(r.maintainers),
    unknownKeys: Object.keys(r).filter((k) => !ROOT_KEYS.has(k)),
  };
}

// People paste an OpenAPI URL into a tool called "API Experience" — it is the obvious thing to try.
// An OpenAPI IS a top-level object, so it sailed through normalize(), produced apis: [], and
// rendered an empty page with no error: indistinguishable from a broken tool. Wrap a bare
// OpenAPI in a synthetic one-API index instead, carrying the parsed document inline so no second
// fetch is needed. The APIs.json path is unchanged.
export function isOpenApiDoc(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.apis)) return false;                       // a real APIs.json wins
  return (typeof r.openapi === 'string' || typeof r.swagger === 'string')
    && typeof r.paths === 'object' && r.paths !== null;
}

export function wrapOpenApi(doc: Record<string, unknown>, label: string): Record<string, unknown> {
  const info = (doc.info || {}) as Record<string, unknown>;
  const servers = Array.isArray(doc.servers) ? (doc.servers as Record<string, unknown>[]) : [];
  const x = (doc['x-apis-io'] || {}) as Record<string, unknown>;
  const ext = (doc.externalDocs || {}) as Record<string, unknown>;
  const contact = (info.contact || {}) as Record<string, unknown>;
  const name = typeof info.title === 'string' ? info.title : label;
  const properties: Record<string, unknown>[] = [{ type: 'OpenAPI', data: doc }];
  // The spec can name its own MCP endpoint and skills index; without an APIs.json to carry them
  // as properties, these are the only place that linkage exists.
  const mcpEndpoint = (x.mcp as Record<string, unknown> | undefined)?.endpoint;
  const skillsIndex = (x.agentSkills as Record<string, unknown> | undefined)?.index;
  if (typeof mcpEndpoint === 'string') properties.push({ type: 'MCPServer', url: mcpEndpoint });
  if (typeof skillsIndex === 'string') properties.push({ type: 'AgentSkills', url: skillsIndex });
  if (typeof ext.url === 'string') properties.push({ type: 'Documentation', url: ext.url });
  return {
    name,
    description: info.summary || info.description,
    specificationVersion: '0.21',
    type: 'Index',
    'x-generated-from': `bare OpenAPI loaded from ${label}`,
    apis: [{
      name,
      description: info.summary || info.description,
      baseURL: typeof servers[0]?.url === 'string' ? servers[0].url : undefined,
      humanURL: typeof ext.url === 'string' ? ext.url : contact.url,
      properties,
      contact: contact.name || contact.email
        ? [{ FN: contact.name, email: contact.email }]
        : [],
    }],
  };
}
