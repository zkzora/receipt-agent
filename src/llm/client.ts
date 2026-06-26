import { config } from '../config.js';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'llm' });

/**
 * Minimal OpenAI-compatible chat client.
 *
 * The classify + judge steps are the ONLY LLM calls in the pipeline. The repo is
 * configured for OpenRouter (`OPENAI_API_BASE` + `OPENAI_API_KEY`), which speaks
 * the OpenAI `/chat/completions` shape, so we hit it directly with `fetch` rather
 * than pulling in an SDK. Every call degrades gracefully: on a missing key,
 * network error, or unparseable response it returns `null` and the caller falls
 * back to deterministic behaviour. The verdict never depends on the LLM being up.
 */
export function hasLlm(): boolean {
  return config.llm.apiKey.length > 0;
}

export interface ChatOptions {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

export async function chat(opts: ChatOptions): Promise<string | null> {
  if (!hasLlm()) {
    log.warn('OPENAI_API_KEY not set — skipping LLM step, using deterministic fallback');
    return null;
  }

  const url = `${config.llm.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = JSON.stringify({
    model: config.llm.model,
    temperature: config.llm.temperature,
    max_tokens: opts.maxTokens ?? 800,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  });

  for (let attempt = 0; attempt <= config.llm.maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.llm.apiKey}`,
          // Optional OpenRouter attribution headers; harmless on other backends.
          'x-title': 'RECEIPT',
          'http-referer': 'https://croo.network',
        },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as ChatCompletion;
      const content = json.choices?.[0]?.message?.content ?? null;
      if (!content) throw new Error('empty completion');
      return content;
    } catch (err) {
      log.warn({ err: String(err), attempt }, 'LLM call failed');
      if (attempt === config.llm.maxRetries) return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Chat + tolerant JSON parse. Models occasionally wrap JSON in prose or code
 * fences, so we extract the outermost `{ … }` block rather than trusting the
 * whole string. Returns `null` when unavailable or unparseable.
 */
export async function chatJson<T>(opts: ChatOptions): Promise<T | null> {
  const text = await chat(opts);
  if (text == null) return null;
  const parsed = extractJson(text);
  if (parsed == null) {
    log.warn({ sample: text.slice(0, 120) }, 'LLM response was not parseable JSON');
    return null;
  }
  return parsed as T;
}

function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
