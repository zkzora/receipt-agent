import { chatJson } from '../../llm/client.js';
import { logger } from '../../logger.js';
import type { OffchainSource } from '../../schema/output.js';

const log = logger.child({ mod: 'offchain.narrative' });

const SYSTEM = `You read the text of a crypto project's OWN public pages (website / GitHub /
docs) and summarise, in ONE neutral sentence, what the project claims to be — its stated
purpose or narrative. This is descriptive context, NOT a judgement of safety or truth.

Respond with ONLY JSON:
{ "narrative": "<one plain sentence, or empty string if the pages don't describe it>" }

Rules:
- Base it strictly on what the pages actually say. Do NOT invent, hype, or infer beyond the text.
- Report the claimed purpose plainly, prefixed with "Claims to be…" (e.g. "Claims to be a
  decentralized perps DEX on Solana."). No adjectives of your own.
- If the pages carry no usable description, return an empty string. Never guess.
- Keep it under 200 characters.`;

/**
 * Detect the token's stated narrative from its OWN sources — runs even when the
 * buyer supplied no claim, so an address-only scan still surfaces "what this
 * project says it is". Feeds context only (HONESTY), never the SAFETY verdict.
 * Returns null when there's no readable source or the LLM is unavailable.
 */
export async function summarizeNarrative(
  subject: string | null,
  address: string,
  sources: OffchainSource[],
): Promise<string | null> {
  const fetched = sources.filter((s) => s.fetched && s.excerpt.trim().length > 0);
  if (fetched.length === 0) return null;

  const lines: string[] = [`Token: ${subject ?? 'ticker unknown'} (${address})`, '', 'Project pages:'];
  fetched.forEach((s, i) => {
    lines.push(`\n[${i + 1}] ${s.kind} — ${s.url}`);
    if (s.title) lines.push(`title: ${s.title}`);
    lines.push(s.excerpt);
  });

  const out = await chatJson<{ narrative?: string }>({
    system: SYSTEM,
    user: lines.join('\n'),
    maxTokens: 160,
  });
  const narrative = typeof out?.narrative === 'string' ? out.narrative.trim() : '';
  if (!narrative) {
    log.info('no narrative detected from sources');
    return null;
  }
  return narrative.slice(0, 220);
}
