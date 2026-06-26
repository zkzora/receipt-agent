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
 * Shill-claim signals worth spending an LLM call on. A bare "CA + chain" drop
 * (e.g. a DexScreener post) carries none of these, so we skip the LLM entirely
 * and go straight to a vibe_check on the address — the LLM is only needed to pull
 * out *falsifiable* assertions for claim_check mode.
 */
const CLAIM_SIGNAL_RE =
  /\b(audit(ed)?|kyc|doxx?ed|renounce[d]?|ownership|mint(ing)?|lp|liquidity|lock(ed)?|burn(ed|t)?|safu|honeypot|rug|tax|fees?|tvl|backed|insured|partnership|verified|whitelist|presale|vesting)\b/i;

/**
 * LLM intake: turn raw shill text into a ticker + a list of checkable claims.
 *
 * The ticker + the on-chain subject are recovered deterministically (regex), so
 * the LLM is never a gate: when the text has no claim signals — or the LLM is
 * unavailable — we still return a usable vibe_check. The LLM only runs to extract
 * falsifiable claims (audited / locked / renounced / TVL …) for claim_check mode.
 */
export async function classify(input: ClassifyInput): Promise<Classification> {
  const text = input.claim.trim();
  const ticker = guessTicker(text);

  // Nothing checkable to assert (pure CA drop) → don't spend an LLM call.
  if (!CLAIM_SIGNAL_RE.test(text)) {
    return { mode: 'vibe_check', ticker, claims: [] };
  }

  const out = await chatJson<Partial<Classification>>({
    system: SYSTEM,
    user: input.xUrl ? `Source: ${input.xUrl}\n\nClaim:\n${text}` : `Claim:\n${text}`,
    maxTokens: 500,
  });
  if (out && Array.isArray(out.claims)) {
    const claims = out.claims.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
    return {
      mode: claims.length > 0 ? 'claim_check' : 'vibe_check',
      ticker: normaliseTicker(out.ticker) ?? ticker,
      claims,
    };
  }

  // LLM unavailable: degrade to a vibe_check on the address rather than forcing
  // the whole blob into one unverifiable "claim".
  log.warn('LLM classify unavailable — degrading to vibe_check');
  return { mode: 'vibe_check', ticker, claims: [] };
}

/** Ticker from "$XOCHI", or a labelled "Token: XOCHI" / "Ticker: XOCHI". */
function guessTicker(text: string): string {
  const dollar = text.match(/\$[A-Za-z][A-Za-z0-9]{1,9}/)?.[0];
  const labelled = text.match(/(?:token|ticker|symbol)\s*[:#-]?\s*\$?([A-Za-z][A-Za-z0-9]{1,9})/i)?.[1];
  return normaliseTicker(dollar) ?? normaliseTicker(labelled) ?? '$TOKEN';
}

function normaliseTicker(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^\$?/, '').toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(cleaned)) return null;
  return `$${cleaned}`;
}
