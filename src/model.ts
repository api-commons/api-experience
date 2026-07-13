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
