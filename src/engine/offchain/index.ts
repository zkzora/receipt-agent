import { config } from '../../config.js';
import { logger } from '../../logger.js';
import type { OffchainSnapshot, OffchainSource } from '../../schema/output.js';
import { assessClaims } from './assess.js';
import { classifyUrl, fetchReadable, harvestUrls, isTwitterUrl, webSearch } from './web.js';

const log = logger.child({ mod: 'offchain' });

export interface OffchainInput {
  subject: string;
  address: string;
  claims: string[];
  /** Raw pasted claim text — URLs the shill linked are harvested from here. */
  claimText: string;
  /** The X/Twitter source link, if any — recorded as a reference, never fetched. */
  xUrl: string | null;
  /** Project-registered links discovered on-chain-adjacent (DexScreener
   *  websites/socials). Keyless, authoritative — the primary discovery source. */
  discovered?: string[];
}

/** Fetch priority — keep the meaty pages (repo/site/docs) ahead of the cap. */
const KIND_RANK: Record<string, number> = {
  official_site: 0,
  github: 1,
  docs: 2,
  search_result: 3,
  reference: 4,
};

/**
 * The off-chain evidence pass. Reads the project's OWN public pages (those the
 * claim linked, plus optional keyed web search) and asks the LLM whether each
 * claim is backed by them. Hard rule: X/Twitter is never fetched — only recorded.
 * Feeds the HONESTY axis exclusively; the result can never change SAFETY.
 *
 * Returns null when off-chain is disabled or there was simply nothing to do, so
 * the rest of the pipeline behaves exactly as before (no regression).
 */
export async function gatherOffchain(input: OffchainInput): Promise<OffchainSnapshot | null> {
  if (!config.offchain.enabled) return null;
  const t0 = Date.now();

  // 1. Gather URLs from three sources: project-registered (DexScreener), the
  //    pasted claim, and (optional) keyed search. Then split off X/Twitter — it
  //    is recorded as a reference and NEVER fetched, no matter where it came from.
  const discovered = input.discovered ?? [];
  const harvested = harvestUrls([input.claimText, input.xUrl]);
  const all = [...discovered, ...harvested, ...(input.xUrl ? [input.xUrl] : [])];
  const skipped = [...new Set(all.filter(isTwitterUrl))];

  // 2. Optional discovery (keyed search only — no-op without a key).
  const query = `${input.subject} ${input.address} official site`.trim();
  const searched = await webSearch(query);
  const searchUrls = searched.map((s) => s.url).filter((u) => !isTwitterUrl(u));
  const searchTitle = new Map(searched.map((s) => [s.url, s.title]));

  // 3. Candidate list. Source tier dominates the ordering so the AUTHORITATIVE
  //    project-registered links (DexScreener) — including the dev's repo — are
  //    never displaced by a looser web-search guess; kind is the tiebreak within
  //    a tier. Search results only fill slots the authoritative links left open.
  const discSafe = discovered.filter((u) => !isTwitterUrl(u));
  const linkSafe = harvested.filter((u) => !isTwitterUrl(u));
  const srcTier = new Map<string, number>();
  const setTier = (urls: string[], tier: number) => {
    for (const u of urls) if (!srcTier.has(urlKey(u))) srcTier.set(urlKey(u), tier);
  };
  setTier(discSafe, 0);
  setTier(linkSafe, 1);
  setTier(searchUrls, 2);
  const score = (u: string) =>
    (srcTier.get(urlKey(u)) ?? 2) * 10 + (KIND_RANK[classifyUrl(u, input.subject)] ?? 9);
  const ranked = dedupe([...discSafe, ...linkSafe, ...searchUrls]).sort((a, b) => score(a) - score(b));
  const candidates = ranked.slice(0, config.offchain.maxSources);

  if (candidates.length === 0 && skipped.length === 0) {
    return null; // nothing off-chain to record at all
  }

  // 4. Fetch each candidate safely + in parallel; keep only what we could read.
  const fetched = await Promise.all(candidates.map((u) => fetchReadable(u)));
  const sources: OffchainSource[] = candidates.map((url, i) => {
    const page = fetched[i];
    return {
      url,
      kind: classifyUrl(url, input.subject),
      title: page?.title || searchTitle.get(url) || '',
      fetched: page != null,
      excerpt: page?.text ?? '',
    };
  });

  // 5. Verify claims against what we actually read.
  const assessments = await assessClaims(input.subject, input.address, input.claims, sources);

  // Drop the bulky full text from non-assessable rows but keep a short excerpt
  // for the receipt's provenance trail.
  for (const s of sources) if (s.fetched) s.excerpt = s.excerpt.slice(0, 280);

  const provider =
    [
      discovered.some((u) => !isTwitterUrl(u)) ? 'dexscreener' : null,
      harvested.some((u) => !isTwitterUrl(u)) ? 'linked' : null,
      searchUrls.length ? config.offchain.searchProvider : null,
    ]
      .filter(Boolean)
      .join('+') || 'none';

  const snapshot: OffchainSnapshot = {
    provider,
    query,
    searched_at: new Date().toISOString(),
    sources,
    skipped,
    assessments,
  };

  log.info(
    {
      ms: Date.now() - t0,
      discovered: discovered.filter((u) => !isTwitterUrl(u)).length,
      linked: harvested.filter((u) => !isTwitterUrl(u)).length,
      searched: searchUrls.length,
      candidates: candidates.length,
      fetched: sources.filter((s) => s.fetched).length,
      skipped: skipped.length,
      assessed: assessments.length,
    },
    'off-chain pass complete',
  );
  return snapshot;
}

function urlKey(u: string): string {
  return u.toLowerCase().replace(/\/+$/, '');
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const key = urlKey(u);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}
