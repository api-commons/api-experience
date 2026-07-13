# API Experience

**A DX/AX visual layer for any [APIs.json](https://apisjson.org).**

Live at **[experience.apicommons.org](https://experience.apicommons.org)** — an [API Commons](https://apicommons.org) tool, alongside [API Documentation](https://documentation.apicommons.org), [API Discovery](https://discover.apicommons.org), and [API Reusability](https://reusability.apicommons.org).

An API is no longer just its REST surface. The same catalog now ships an **MCP server** and **Agent Skills** on top of it — and a developer or an agent moves through a chain: **REST operation → MCP tool → Agent Skill**. This tool reads an APIs.json, follows the OpenAPI it references, and *shows* that chain, so you can see the developer- and agent-experience of your systems and iterate on the gaps.

- **Journey view** — every operation flowing to its MCP tool and Agent Skill, method-coloured, with a free/paid tier badge.
- **Coverage scorecard** — how many operations have an MCP tool, how many have an Agent Skill, the free/Pro split, and exactly which operations have a gap in the chain.
- **Free vs. paid, rendered** — the tool is free and open; it *visualizes* the tiers encoded in the OpenAPI (`x-tier`), so you see which operations are open discovery and which are paid synthesis.

Nothing leaves the browser — there is no backend.

## How it reads the chain

The truth lives in the OpenAPI as extensions (see [apis.io's own descriptor](https://apis.io/apis.json) for the reference implementation):

- a top-level **`x-apis-io.operations`** map — `{ operationId: { tier, mcpTool, agentSkill } }`, and/or
- per-operation **`x-tier`** (`free` | `pro`), **`x-mcp-tool`**, **`x-agent-skill`** (these win over the map).

API-level artifacts — the MCP server, the Agent Skills index, pricing, plans, auth — come from the APIs.json `properties`. Anything missing becomes a gap the coverage view surfaces on purpose.

Any OpenAPI works; without the `x-` extensions the journey still renders (operations + whatever tiers you provide), and the coverage view shows the MCP/skill columns as gaps to fill.

## Three ways to use it

**1. Hosted.** Open [experience.apicommons.org](https://experience.apicommons.org), drop in a file, pick an example (apis.io, API Evangelist), or link to any APIs.json:

```
https://experience.apicommons.org/?url=https://apis.io/apis.json
```

**2. Zip it up with your apis.json.** `npm run build` produces a self-contained `dist/apis-json-viewer.html`. Rename it `index.html`, put it next to any `apis.json`, and serve or zip the folder — it finds the sibling file automatically.

**3. Bundle a single file.** `npm run bundle` inlines a chosen apis.json into one portable HTML file (works over `file://`, email, anywhere).

## Develop

```bash
npm install
npm run dev        # local dev server
npm run typecheck
npm run build      # dist/ + self-contained dist/apis-json-viewer.html
```

Vite + TypeScript, one dependency (`yaml`), no framework. Reuses the APIs.json normalizer and the API Commons house theme from the sibling tools.
