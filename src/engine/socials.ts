import type { SocialLink } from '../schema/output.js';

/**
 * Turn the DexScreener-registered links (websites + socials) into a typed,
 * deduped list of the CA's socials — the degen shortcut to a token's own pages
 * without hunting through DexScreener. Descriptive only; never gates a verdict.
 */
export function extractSocials(links: string[]): SocialLink[] {
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const raw of links) {
    const url = raw.trim();
    if (!url) continue;
    const kind = classify(url);
    const key = url.toLowerCase().replace(/\/+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, url });
  }
  // Stable, degen-useful order: X first, then TG/Discord, site, repo last.
  const rank: Record<SocialLink['kind'], number> = { x: 0, telegram: 1, discord: 2, website: 3, github: 4 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

function classify(url: string): SocialLink['kind'] {
  const u = url.toLowerCase();
  if (/\b(?:twitter|x)\.com\//.test(u)) return 'x';
  if (/\bt\.me\//.test(u) || /telegram\.(?:me|org)/.test(u)) return 'telegram';
  if (/\bdiscord\.(?:gg|com)\//.test(u)) return 'discord';
  if (/\bgithub\.com\//.test(u)) return 'github';
  return 'website';
}
