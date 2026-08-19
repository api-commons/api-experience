// The load pipeline: what a pasted document is recognised as, and what the tool derives from it.
//
// These guard two regressions that both presented as "the tool is broken" with no error on screen:
//   1. A bare OpenAPI rendered blank. It is a top-level object, so it passed normalize(), produced
//      an empty `apis` array, and drew an empty page.
//   2. A relative property URL (`openapi/foo-openapi.yml` — how much of the api-evangelist catalog
//      is written) was fetched against the tool's own origin instead of the index's location.
//
// Everything here is offline: OpenAPIs are supplied inline via a property's `data`, and the one
// test that must exercise fetch() stubs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalize, isOpenApiDoc, wrapOpenApi } from '../src/model';
import { buildExperience } from '../src/experience';

const SPEC = {
  openapi: '3.1.0',
  info: { title: 'Example API', summary: 'A summary.', contact: { name: 'Kin Lane', email: 'info@example.com' } },
  servers: [{ url: 'https://api.example.com/v1' }],
  externalDocs: { url: 'https://developer.example.com' },
  'x-apis-io': {
    mcp: { endpoint: 'https://mcp.example.com/mcp' },
    agentSkills: { index: 'https://example.com/.well-known/agent-skills/index.json' },
    operations: {
      listThings: { tier: 'free', mcpTool: 'find_things' },
      getThing: { tier: 'pro', mcpTool: 'get_thing' },
    },
    prompts: [{ name: 'explore', tier: 'free', description: 'Explore.', uses: ['find_things'] }],
    resources: [{ uri: 'ex://thing/{id}', tier: 'pro', description: 'One thing.', operation: 'getThing' }],
  },
  paths: {
    '/things': { get: { operationId: 'listThings', summary: 'List things.' } },
    '/things/{id}': { get: { operationId: 'getThing', summary: 'Get a thing.' } },
  },
};

const APIS_JSON = {
  name: 'Example',
  apis: [{ name: 'Example API', properties: [{ type: 'OpenAPI', data: SPEC }] }],
};

test('isOpenApiDoc recognises a bare OpenAPI', () => {
  assert.equal(isOpenApiDoc(SPEC), true);
  assert.equal(isOpenApiDoc({ swagger: '2.0', paths: {} }), true);
});

test('isOpenApiDoc leaves an APIs.json alone, even one that also carries openapi keys', () => {
  assert.equal(isOpenApiDoc(APIS_JSON), false);
  // A real index always wins: the `apis` array is the deciding signal.
  assert.equal(isOpenApiDoc({ openapi: '3.1.0', paths: {}, apis: [] }), false);
});

test('isOpenApiDoc rejects things that are not documents', () => {
  for (const bad of [null, undefined, 'a string', 42, [], { info: {} }, { openapi: '3.1.0' }]) {
    assert.equal(isOpenApiDoc(bad), false, `expected false for ${JSON.stringify(bad)}`);
  }
});

test('wrapOpenApi carries the spec inline and lifts its identity', () => {
  const wrapped = wrapOpenApi(SPEC as Record<string, unknown>, 'test-label') as any;
  assert.equal(wrapped.name, 'Example API');
  assert.equal(wrapped.apis.length, 1);
  const api = wrapped.apis[0];
  assert.equal(api.baseURL, 'https://api.example.com/v1');
  assert.equal(api.humanURL, 'https://developer.example.com');
  assert.deepEqual(api.contact, [{ FN: 'Kin Lane', email: 'info@example.com' }]);

  const oa = api.properties.find((p: any) => p.type === 'OpenAPI');
  assert.ok(oa, 'an OpenAPI property is present');
  assert.equal(oa.data, SPEC, 'the parsed document rides along inline — no second fetch');
  assert.equal(oa.url, undefined);

  // Without an APIs.json, x-apis-io is the only place the MCP + skills linkage exists.
  assert.equal(api.properties.find((p: any) => p.type === 'MCPServer').url, 'https://mcp.example.com/mcp');
  assert.ok(api.properties.find((p: any) => p.type === 'AgentSkills'));
});

test('a wrapped bare OpenAPI builds the same experience as an APIs.json would', async () => {
  const fromBare = await buildExperience(normalize(wrapOpenApi(SPEC as Record<string, unknown>, 'x')));
  const fromIndex = await buildExperience(normalize(APIS_JSON));

  for (const [label, model] of [['bare', fromBare], ['index', fromIndex]] as const) {
    const api = model.apis[0];
    assert.equal(api.hasOpenApi, true, `${label}: OpenAPI resolved`);
    assert.equal(api.operations.length, 2, `${label}: both operations derived`);
    assert.deepEqual(api.operations.map((o) => o.tier).sort(), ['free', 'pro'], `${label}: tiers`);
    assert.equal(api.operations.find((o) => o.operationId === 'listThings')!.mcpTool, 'find_things');
    assert.equal(api.prompts.length, 1, `${label}: prompts`);
    assert.equal(api.resources.length, 1, `${label}: resources`);
    // x-apis-io supplies these when no APIs.json property does.
    assert.equal(api.mcpServer, 'https://mcp.example.com/mcp', `${label}: mcp endpoint`);
    assert.ok(api.agentSkills, `${label}: skills index`);
  }
});

test('an APIs.json property beats the x-apis-io fallback', async () => {
  const doc = normalize({
    name: 'Example',
    apis: [{
      name: 'Example API',
      properties: [
        { type: 'OpenAPI', data: SPEC },
        { type: 'MCPServer', url: 'https://mcp.override.example/mcp' },
      ],
    }],
  });
  const model = await buildExperience(doc);
  assert.equal(model.apis[0].mcpServer, 'https://mcp.override.example/mcp');
});

test('a relative property URL resolves against the index, not the tool origin', async () => {
  const asked: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    asked.push(String(input));
    return { ok: true, url: String(input), text: async () => JSON.stringify(SPEC) } as any;
  }) as typeof fetch;

  try {
    const doc = normalize({
      name: 'Example',
      apis: [{ name: 'Example API', properties: [{ type: 'OpenAPI', url: 'openapi/example-openapi.yml' }] }],
    });
    const model = await buildExperience(doc, 'https://example.com/some/path/apis.yml');
    assert.deepEqual(asked, ['https://example.com/some/path/openapi/example-openapi.yml']);
    assert.equal(model.apis[0].hasOpenApi, true);
    assert.equal(model.apis[0].openApiUrl, 'https://example.com/some/path/openapi/example-openapi.yml');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('with no base, an absolute property URL is fetched unchanged', async () => {
  const asked: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    asked.push(String(input));
    return { ok: true, url: String(input), text: async () => JSON.stringify(SPEC) } as any;
  }) as typeof fetch;

  try {
    const doc = normalize({
      name: 'Example',
      apis: [{ name: 'Example API', properties: [{ type: 'OpenAPI', url: 'https://cdn.example.com/spec.yml' }] }],
    });
    await buildExperience(doc);
    assert.deepEqual(asked, ['https://cdn.example.com/spec.yml']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a document describing no APIs normalises to an empty list, which the UI reports', () => {
  // main.ts turns this into a real error naming both accepted shapes, rather than drawing a blank
  // page — the failure mode that made a pasted OpenAPI look like a broken tool.
  assert.equal(normalize({ name: 'Nothing here' }).apis.length, 0);
});
