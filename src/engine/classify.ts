import { chatJson } from '../llm/client.js';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'classify' });

export interface Classification {
  /** "claim_check" when there are checkable assertions, else "vibe_check". */
  mode: 'claim_check' | 'vibe_check';
  /** Display ticker like "$LUNAR" (best-effort). */
  ticker: string;
  /** Normalised, individually-checkable claims pulled from the shill text. */
  claims: string[];
}

interface ClassifyInput {
  claim: string;
  xUrl: string | null;
  hasAddress: boolean;
}

const SYSTEM = `You are the intake stage of an on-chain lie detector for crypto shills.
Given a shill claim about a token, extract structured data. Respond with ONLY a JSON object:
{
  "ticker": "$SYMBOL or $TOKEN if unknown",
  "claims": ["each distinct checkable assertion as a short string"],
  "mode": "claim_check" | "vibe_check"
}
Rules:
- "claims" must be specific, verifiable assertions (e.g. "LP is locked", "fully audited",
  "10M TVL", "ownership renounced"). Drop vague hype ("going to the moon").
- mode = "claim_check" if there is at least one checkable claim, else "vibe_check".
- Never invent claims that aren't in the text.`;

/**
 * LLM intake: turn raw shill text into a ticker + a list of checkable claims.
 * Degrades to a regex/heuristic extraction when the LLM is unavailable so the
 * pipeline still runs without an API key.
 */
export async function classify(input: ClassifyInput): Promise<Classification> {
  const text = input.claim.trim();

  if (text.length > 0) {
    const out = await chatJson<Partial<Classification>>({
      system: SYSTEM,
      user: input.xUrl ? `Source: ${input.xUrl}\n\nClaim:\n${text}` : `Claim:\n${text}`,
      maxTokens: 500,
    });
    if (out && Array.isArray(out.claims)) {
      return {
        mode: out.mode === 'vibe_check' ? 'vibe_check' : out.claims.length > 0 ? 'claim_check' : 'vibe_check',
        ticker: normaliseTicker(out.ticker) ?? guessTicker(text),
        claims: out.claims.filter((c): c is string => typeof c === 'string' && c.trim().length > 0),
      };
    }
    log.warn('LLM classify unavailable — using heuristic extraction');
  }

  // Heuristic fallback: ticker via regex, treat the whole claim as one assertion.
  return {
    mode: text.length > 0 ? 'claim_check' : 'vibe_check',
    ticker: guessTicker(text),
    claims: text.length > 0 ? [text] : [],
  };
}

function guessTicker(text: string): string {
  return normaliseTicker(text.match(/\$[A-Za-z0-9]{2,10}/)?.[0]) ?? '$TOKEN';
}

function normaliseTicker(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^\$?/, '').toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(cleaned)) return null;
  return `$${cleaned}`;
}
