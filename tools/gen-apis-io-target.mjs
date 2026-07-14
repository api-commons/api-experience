// Generates the "APIs.io — target surface" example the API Experience tool loads by default:
// a ROADMAP (not the live contract) for a robust API → MCP (tools + prompts + resources) →
// Agent-Skill buildout. Emits public/examples/apis-io-target-openapi.yml + apis-io-target.json.
// Re-run: `node tools/gen-apis-io-target.mjs`. Design rationale: planning/apis-io-experience-roadmap.md.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stringify as toYAML } from 'yaml';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'examples');
mkdirSync(dir, { recursive: true });

// [operationId, METHOD, path, tier, mcpTool, agentSkill, summary]
const NEW = 'NEW';
const OPS = [
  // --- Discovery (free) — existing ---
  ['search', 'GET', '/search', 'free', 'apis_io_search', 'find-api', 'Unified search across apis, providers, tags, and artifacts.'],
  ['listProviders', 'GET', '/providers', 'free', 'find_providers', 'discover-apis-io', 'List and filter providers.'],
  ['getProvider', 'GET', '/providers/{slug}', 'free', 'get_provider', 'discover-apis-io', 'One provider with its APIs and links.'],
  ['listProviderApis', 'GET', '/providers/{slug}/apis', 'free', 'get_provider', 'discover-apis-io', 'The APIs a provider publishes.'],
  ['listApis', 'GET', '/apis', 'free', 'find_apis', 'find-api', 'Cross-provider API discovery.'],
  ['getApi', 'GET', '/apis/{aid}', 'free', 'get_api', 'fetch-api-spec', 'Full detail for one API, artifacts optionally inlined.'],
  ['listTags', 'GET', '/tags', 'free', 'find_tags', 'search-apis', 'Browse/rank the tag taxonomy.'],
  ['getTag', 'GET', '/tags/{slug}', 'free', 'get_tag', 'search-apis', 'One tag with providers, APIs, and neighbors.'],
  ['getRatingRubric', 'GET', '/ratings/rubric', 'free', 'get_rating_rubric', '', 'The rating rubric — bands, facet weights, trend thresholds.'],
  // --- Artifact collections (free) — existing ---
  ['listOpenapis', 'GET', '/openapis', 'free', 'find_artifacts', 'fetch-api-spec', 'OpenAPI specifications across the catalog.'],
  ['listAsyncapis', 'GET', '/asyncapis', 'free', 'find_artifacts', 'fetch-api-spec', 'AsyncAPI specifications across the catalog.'],
  ['listArazzo', 'GET', '/arazzo', 'free', 'find_artifacts', 'fetch-api-spec', 'Arazzo workflows across the catalog.'],
  ['listPostman', 'GET', '/postman', 'free', 'find_artifacts', 'fetch-api-spec', 'Postman collections across the catalog.'],
  ['listCollections', 'GET', '/collections', 'free', 'find_artifacts', 'fetch-api-spec', 'API collections across the catalog.'],
  ['listGraphql', 'GET', '/graphql', 'free', 'find_artifacts', 'fetch-api-spec', 'GraphQL schemas across the catalog.'],
  ['listJsonSchemas', 'GET', '/json-schemas', 'free', 'find_artifacts', 'fetch-api-spec', 'JSON Schemas across the catalog.'],
  ['listJsonStructures', 'GET', '/json-structures', 'free', 'find_artifacts', 'fetch-api-spec', 'JSON Structures across the catalog.'],
  ['listJsonLd', 'GET', '/json-ld', 'free', 'find_artifacts', 'fetch-api-spec', 'JSON-LD contexts across the catalog.'],
  ['listVocabularies', 'GET', '/vocabularies', 'free', 'find_artifacts', 'search-apis', 'Vocabularies across the catalog.'],
  ['listRules', 'GET', '/rules', 'free', 'find_artifacts', 'audit-api-estate', 'Governance rulesets across the catalog.'],
  ['listExamples', 'GET', '/examples', 'free', 'find_artifacts', 'fetch-api-spec', 'Request/response payload examples across the catalog.'],
  ['listFinops', 'GET', '/finops', 'free', 'find_artifacts', 'audit-api-estate', 'FinOps artifacts across the catalog.'],
  ['listPlans', 'GET', '/plans', 'free', 'find_artifacts', 'audit-api-estate', 'Pricing plans across the catalog.'],
  ['listRateLimits', 'GET', '/rate-limits', 'free', 'find_artifacts', 'audit-api-estate', 'Rate-limit policies across the catalog.'],
  ['listChannels', 'GET', '/channels', 'free', 'find_artifacts', 'fetch-api-spec', 'AsyncAPI event channels across the catalog.'],
  ['listMcpServers', 'GET', '/mcp', 'free', 'find_artifacts', 'discover-mcp-servers', 'Published MCP servers across the catalog.'],
  ['listSkills', 'GET', '/skills', 'free', 'find_artifacts', 'discover-apis-io', 'Published Agent Skills across the catalog.'],
  ['listScopes', 'GET', '/scopes', 'free', 'find_artifacts', 'audit-api-estate', 'OAuth scope sets across the catalog.'],
  ['listSecurity', 'GET', '/security', 'free', 'find_artifacts', 'audit-api-estate', 'Security scheme definitions across the catalog.'],
  // --- Curated dimensions (pro) — existing ---
  ['listIndustries', 'GET', '/industries', 'pro', 'find_industries', 'discover-apis-io', 'List and filter industries.'],
  ['getIndustry', 'GET', '/industries/{slug}', 'pro', 'get_industry', 'shortlist-vendors', 'One industry with ranked providers.'],
  ['listRegions', 'GET', '/regions', 'pro', 'find_regions', 'discover-apis-io', 'List and filter regions.'],
  ['getRegion', 'GET', '/regions/{slug}', 'pro', 'get_region', 'shortlist-vendors', 'One region with ranked providers.'],
  ['listAreas', 'GET', '/areas', 'pro', 'find_areas', 'discover-apis-io', 'List and filter areas.'],
  ['getArea', 'GET', '/areas/{slug}', 'pro', 'get_area', 'shortlist-vendors', 'One area with ranked providers.'],
  // --- Ratings + synthesis (pro) — existing ---
  ['listRatings', 'GET', '/ratings', 'pro', 'find_ratings', 'shortlist-vendors', 'Ranked ratings leaderboard.'],
  ['getProviderRating', 'GET', '/providers/{slug}/rating', 'pro', 'get_provider_rating', 'shortlist-vendors', "A provider's full rating breakdown."],
  ['compareProviders', 'GET', '/compare', 'pro', 'compare_providers', 'audit-api-estate', 'Compare providers side by side.'],
  ['gapAnalysis', 'GET', '/gaps', 'pro', 'gap_analysis', 'audit-api-estate', 'Artifact + score gap analysis.'],
  ['whatsChanged', 'GET', '/changes', 'pro', 'whats_changed', 'track-api-changes', 'What changed in the catalog since a date.'],
  ['recommendStack', 'GET', '/stack', 'free', 'recommend_stack', 'assemble-api-stack', 'Design a recommended API stack per capability (free preview / Pro full).'],
  // --- Proposed additions (roadmap) ---
  ['getProviderArtifacts', 'GET', '/providers/{slug}/artifacts', 'free', 'get_provider_artifacts', 'fetch-api-spec', NEW + ' Every artifact a provider publishes, in one call.'],
  ['getApiArtifacts', 'GET', '/apis/{aid}/artifacts', 'free', 'get_api_artifacts', 'fetch-api-spec', NEW + ' Every artifact for one API, in one call.'],
  ['getOpenapi', 'GET', '/openapis/{aid}', 'free', 'get_openapi', 'integrate-provider', NEW + " A provider's primary OpenAPI inline in one call — the top agent intent."],
  ['getProviderOnboarding', 'GET', '/providers/{slug}/onboarding', 'free', 'get_provider_onboarding', 'integrate-provider', NEW + ' The getting-started / onboarding descriptor for a provider (auth, base URL, first call).'],
  ['findSimilarProviders', 'GET', '/providers/{slug}/similar', 'free', 'find_similar_providers', 'shortlist-vendors', NEW + ' Providers most similar to this one (tags, industry, artifact coverage) — alternatives.'],
  ['findSimilarApis', 'GET', '/apis/{aid}/similar', 'free', 'find_similar_apis', 'find-api', NEW + ' APIs most similar to this one — "more like this".'],
  ['getIndustryLeaders', 'GET', '/industries/{slug}/leaders', 'pro', 'get_industry_leaders', 'shortlist-vendors', NEW + ' Top-rated providers in an industry.'],
  ['getRegionLeaders', 'GET', '/regions/{slug}/leaders', 'pro', 'get_region_leaders', 'shortlist-vendors', NEW + ' Top-rated providers in a region.'],
  ['getAreaLeaders', 'GET', '/areas/{slug}/leaders', 'pro', 'get_area_leaders', 'shortlist-vendors', NEW + ' Top-rated providers in a curated area.'],
  ['getRatingHistory', 'GET', '/providers/{slug}/rating/history', 'pro', 'get_rating_history', 'audit-api-estate', NEW + " A provider's rating trend over time."],
  ['findRatingMovers', 'GET', '/ratings/movers', 'pro', 'find_rating_movers', 'track-api-changes', NEW + ' The biggest rating movers (up/down) this period.'],
  ['industryGapAnalysis', 'GET', '/gaps/industry/{slug}', 'pro', 'industry_gap_analysis', 'audit-api-estate', NEW + ' Artifacts commonly missing across an entire industry.'],
  ['exportStack', 'GET', '/stack/export', 'pro', 'export_stack', 'assemble-api-stack', NEW + ' Export a designed capability stack as an adoptable APIs.json + Arazzo.'],
];

const PROMPTS = [
  ['find_api', 'free', 'Find an API for a task or use case, ranked with links.', ['apis_io_search']],
  ['explain_artifact', 'free', 'Explain one API artifact and how to use it.', ['get_api']],
  ['provider_overview', 'free', 'Summarize what one provider offers.', ['get_provider']],
  ['integrate_provider', 'free', 'NEW — Walk through integrating a provider: pull its OpenAPI, onboarding, and auth, then produce concrete first-integration steps.', ['get_provider', 'get_openapi', 'get_provider_onboarding']],
  ['api_readiness_check', 'free', 'NEW — Assess whether an API is ready to adopt: its artifacts, rating, and what is missing.', ['get_api', 'get_api_artifacts', 'get_provider_rating']],
  ['design_api_stack', 'pro', 'PRO — Design a recommended API stack for a team/domain, exportable as APIs.json.', ['find_providers', 'apis_io_search', 'find_industries', 'find_ratings', 'recommend_stack']],
  ['vendor_shortlist', 'pro', 'PRO — Build a scored vendor shortlist for one capability.', ['find_providers', 'apis_io_search', 'find_ratings', 'get_provider_rating']],
  ['audit_api_estate', 'pro', 'NEW · PRO — Inventory and score a set of providers, surfacing artifact and governance gaps.', ['find_providers', 'compare_providers', 'gap_analysis', 'find_ratings']],
  ['find_alternatives', 'pro', 'NEW · PRO — Migration flow: find alternatives to a provider and compare them head to head.', ['find_similar_providers', 'compare_providers', 'get_provider_rating']],
  ['build_agent_toolset', 'pro', 'NEW · PRO — For a task or domain, assemble the providers, MCP tools, and skills an agent needs.', ['apis_io_search', 'find_artifacts', 'recommend_stack']],
  ['track_provider_changes', 'pro', 'NEW · PRO — Set up change monitoring for a chosen set of providers.', ['whats_changed', 'get_provider']],
];

const RESOURCES = [
  ['apis://catalog', 'free', 'Service root — network-wide artifact counts.', null],
  ['apis://ratings/rubric', 'free', 'The scoring rubric.', 'getRatingRubric'],
  ['apis://llms.txt', 'free', 'The apis.io llms.txt index for grounding.', null],
  ['apis://provider/{slug}', 'free', "One provider's profile.", 'getProvider'],
  ['apis://provider/{slug}/dossier', 'pro', 'PRO — the full provider dossier.', 'getProvider'],
  ['apis://provider/{slug}/openapi', 'free', "NEW — a provider's primary OpenAPI inline, ready to attach.", 'getOpenapi'],
  ['apis://tag/{slug}', 'free', 'NEW — a tag brief: linked providers, APIs, neighbors.', 'getTag'],
  ['apis://industry/{slug}', 'pro', 'NEW · PRO — an industry brief: ranked member providers.', 'getIndustry'],
  ['apis://region/{slug}', 'pro', 'NEW · PRO — a region brief: ranked member providers.', 'getRegion'],
  ['apis://area/{slug}', 'pro', 'NEW · PRO — a curated area index.', 'getArea'],
  ['apis://stack', 'pro', 'NEW · PRO — a designed capability stack as an attachable APIs.json.', 'recommendStack'],
  ['apis://changes', 'pro', 'NEW · PRO — the recent catalog-changes feed.', 'whatsChanged'],
];

const tagFor = (o) => o[5] === 'assemble-api-stack' || o[2].startsWith('/compare') || o[2].startsWith('/gaps') || o[2].startsWith('/stack') || o[2].endsWith('/leaders') || o[2].includes('/rating') || o[2].startsWith('/changes') || o[2].startsWith('/ratings/movers')
  ? 'Synthesis'
  : o[2].startsWith('/industries') || o[2].startsWith('/regions') || o[2].startsWith('/areas') ? 'Dimensions'
  : o[5] && o[6].startsWith(NEW) ? 'Proposed' : 'Discovery';

const paths = {};
const operations = {};
for (const [id, method, p, tier, tool, skill, summary] of OPS) {
  const m = method.toLowerCase();
  paths[p] = paths[p] || {};
  paths[p][m] = {
    operationId: id,
    summary: summary.replace(NEW + ' ', ''),
    tags: [summary.startsWith(NEW) ? 'Proposed' : tagFor([id, method, p, tier, tool, skill, summary])],
    'x-tier': tier,
    'x-mcp-tool': tool,
    ...(skill ? { 'x-agent-skill': skill } : {}),
    responses: { 200: { description: summary.replace(NEW + ' ', '') } },
  };
  operations[id] = { tier, mcpTool: tool, ...(skill ? { agentSkill: skill } : {}) };
}

const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'APIs.io API — target surface (roadmap)',
    version: '2.0.0-target',
    description:
      'A ROADMAP for a robust API → MCP (tools + prompts + resources) → Agent-Skill surface for apis.io — the live contract plus proposed additions (tagged Proposed). Rendered by the API Experience tool so the whole target buildout is visible at once. Not the live contract; see https://apis.io/apis.json for what is deployed today.',
  },
  servers: [{ url: 'https://apis.io/api/v1', description: 'Production server (live operations).' }],
  'x-apis-io': {
    tiers: {
      free: { label: 'Free', description: 'Raw discovery — search, providers, apis, tags, and every artifact-type collection.' },
      pro: { label: 'Pro', description: 'Curated dimensions, rating data, and synthesis composites.', plans: 'https://apis.io/developer/plans/' },
    },
    mcp: { endpoint: 'https://apis.io/mcp', serverCard: 'https://apis.io/.well-known/mcp/server-card.json' },
    agentSkills: { index: 'https://apis.io/.well-known/agent-skills/index.json' },
    prompts: PROMPTS.map(([name, tier, description, uses]) => ({ name, tier, description, uses })),
    resources: RESOURCES.map(([uri, tier, description, operation]) => ({ uri, tier, description, ...(operation ? { operation } : {}) })),
    operations,
  },
  paths,
};

const descriptor = {
  specificationVersion: '0.21',
  name: 'APIs.io (target surface)',
  description: 'Proposed robust API → MCP → Agent-Skill buildout for apis.io — a roadmap, not the live contract.',
  image: 'https://apis.io/assets/branding/apisio-social-card.png',
  url: 'https://apis.io/apis.json',
  created: '2024-04-13',
  modified: '2026-07-14',
  apis: [{
    aid: 'apis-io:api',
    name: 'APIs.io API (target)',
    description: 'The proposed robust surface — 54 operations, 11 MCP prompts, 12 resources, and 10 Agent Skills.',
    humanURL: 'https://apis.io/developer/',
    baseURL: 'https://apis.io/api/v1',
    properties: [
      // Inline the OpenAPI so the example is self-contained (no relative-path fetch from the page root).
      { type: 'OpenAPI', data: openapi },
      { type: 'Documentation', url: 'https://apis.io/developer/' },
      { type: 'MCPServer', url: 'https://apis.io/mcp' },
      { type: 'MCPServerCard', url: 'https://apis.io/.well-known/mcp/server-card.json' },
      { type: 'AgentSkills', url: 'https://apis.io/.well-known/agent-skills/index.json' },
      { type: 'Plans', url: 'https://apis.io/developer/plans/' },
      { type: 'Pricing', url: 'https://apis.io/developer/plans/' },
    ],
  }],
};

writeFileSync(path.join(dir, 'apis-io-target-openapi.yml'), toYAML(openapi));
writeFileSync(path.join(dir, 'apis-io-target.json'), JSON.stringify(descriptor, null, 2));
console.log(`Wrote target: ${OPS.length} ops, ${PROMPTS.length} prompts, ${RESOURCES.length} resources.`);
const skills = [...new Set(OPS.map((o) => o[5]).filter(Boolean))];
console.log(`Skills referenced (${skills.length}):`, skills.join(', '));
console.log(`New ops: ${OPS.filter((o) => o[6].startsWith(NEW)).length}, new prompts: ${PROMPTS.filter((p) => p[2].startsWith('NEW')).length}, new resources: ${RESOURCES.filter((r) => r[2].startsWith('NEW')).length}`);
