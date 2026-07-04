import { chatJson } from '../../llm/client.js';
import { logger } from '../../logger.js';
import type { OffchainAssessment, OffchainSource } from '../../schema/output.js';

const log = logger.child({ mod: 'offchain.assess' });

const SYSTEM = `You verify a crypto project's stated claims against the text of the
project's OWN public pages (its website / GitHub / docs). You are NOT judging whether
the token is safe — only whether each claim is backed by what these pages actually say.

Respond with ONLY JSON:
{ "assessments": [ { "claim": "<verbatim claim>", "status": "supported" | "contradicted" | "unverifiable", "evidence": "<short quote/paraphrase from a source, or empty>", "source_url": "<the url it came from, or null>" } ] }

Rules:
- "supported": a source page explicitly backs the claim. Cite the source_url + evidence.
- "contradicted": a source page explicitly states the opposite. Cite the source_url + evidence.
- "unverifiable": the pages don't address it. This is the DEFAULT — use it whenever you
  are not certain. Marketing copy that merely repeats the claim is NOT proof; an audit
  claim needs a named auditor or report link, not just the word "audited".
- Never infer from absence. Never use a source_url that isn't in the provided list.
- Be conservative: a false "supported"/"contradicted" is worse than "unverifiable".`;

export async function assessClaims(
  subject: string | null,
  address: string,
  claims: string[],
  sources: OffchainSource[],
): Promise<OffchainAssessment[]> {
  const fetched = sources.filter((s) => s.fetched && s.excerpt.trim().length > 0);
  if (claims.length === 0 || fetched.length === 0) return [];

  const allowed = new Set(fetched.map((s) => s.url));
  const user = buildPrompt(subject, address, claims, fetched);

  const out = await chatJson<{ assessments?: Partial<OffchainAssessment>[] }>({
    system: SYSTEM,
    user,
    maxTokens: 900,
  });
  if (!out || !Array.isArray(out.assessments)) {
    log.warn('off-chain assessment unavailable (no LLM / bad shape)');
    return [];
  }

  const claimSet = new Set(claims);
  return out.assessments
    .map((a) => normalise(a, claimSet, allowed))
    .filter((a): a is OffchainAssessment => a !== null);
}

/** Validate a model row; downgrade unsupported provenance to "unverifiable". */
function normalise(
  a: Partial<OffchainAssessment>,
  claims: Set<string>,
  allowed: Set<string>,
): OffchainAssessment | null {
  if (typeof a.claim !== 'string' || !claims.has(a.claim)) return null;
  let status: OffchainAssessment['status'] =
    a.status === 'supported' || a.status === 'contradicted' ? a.status : 'unverifiable';
  const evidence = typeof a.evidence === 'string' ? a.evidence.trim() : '';
  const sourceUrl = typeof a.source_url === 'string' && allowed.has(a.source_url) ? a.source_url : null;
  // A verdict that doesn't cite a real source + evidence is not trustworthy.
  if (status !== 'unverifiable' && (!sourceUrl || evidence.length === 0)) {
    status = 'unverifiable';
  }
  return { claim: a.claim, status, evidence: evidence.slice(0, 240), source_url: sourceUrl };
}

function buildPrompt(subject: string | null, address: string, claims: string[], sources: OffchainSource[]): string {
  const lines: string[] = [`Token: ${subject ?? 'ticker unknown'} (Base ${address})`, '', 'Claims to verify:'];
  claims.forEach((c) => lines.push(`- ${c}`));
  lines.push('', 'Project pages (verbatim text excerpts):');
  sources.forEach((s, i) => {
    lines.push(`\n[${i + 1}] ${s.kind} — ${s.url}`);
    if (s.title) lines.push(`title: ${s.title}`);
    lines.push(s.excerpt);
  });
  return lines.join('\n');
}
