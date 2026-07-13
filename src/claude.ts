// Browser-direct call to the Claude Messages API. The user pastes their own key (Settings); we
// send it straight to api.anthropic.com with the documented direct-browser-access header, so the
// tool stays 100% backend-free. Structured JSON is guaranteed via output_config.format, so callers
// get a validated object, not free text to parse.
//
// Security note surfaced in the UI: the key is stored only in this browser (localStorage) and is
// sent only to api.anthropic.com. No server of ours ever sees it.

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-8';

export interface ClaudeCall {
  token: string;
  system: string;            // the guide skill
  prompt: string;            // the task + current API context
  schema: Record<string, unknown>; // JSON Schema the response must conform to
  maxTokens?: number;
}

// Returns the parsed object matching `schema`. Throws Error(message) on any failure.
export async function callClaudeJSON<T = unknown>({ token, system, prompt, schema, maxTokens = 4000 }: ClaudeCall): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': token,
        'anthropic-version': '2023-06-01',
        // Opt in to first-party browser calls with a user-provided key.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
        // Constrain the whole response to our schema — no prose, no parsing guesswork.
        output_config: { format: { type: 'json_schema', schema } },
      }),
    });
  } catch (e) {
    throw new Error(`Network error calling Claude (often CORS or connectivity): ${e instanceof Error ? e.message : String(e)}`);
  }

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw;
    try { detail = JSON.parse(raw)?.error?.message || raw; } catch { /* keep raw */ }
    if (res.status === 401) throw new Error('Claude rejected the API key (401). Check the token in Settings.');
    if (res.status === 429) throw new Error('Rate limited by Claude (429). Wait a moment and retry.');
    throw new Error(`Claude API error ${res.status}: ${detail}`);
  }

  let body: { stop_reason?: string; content?: { type: string; text?: string }[] };
  try { body = JSON.parse(raw); } catch { throw new Error('Could not parse the Claude response envelope.'); }
  if (body.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  const text = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text || '').join('');
  if (!text.trim()) throw new Error('Claude returned an empty response.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Claude response was not valid JSON for the requested schema.');
  }
}

export const CLAUDE_MODEL = MODEL;
