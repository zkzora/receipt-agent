import { lookup } from 'node:dns/promises';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { fetchJson } from '../evidence/http.js';
import type { OffchainSourceKind } from '../../schema/output.js';

const log = logger.child({ mod: 'offchain.web' });

const UA = 'Mozilla/5.0 (compatible; RECEIPT-AI/1.0; +https://receipt.ai)';

/** Hosts we will NEVER fetch (SPEC: X/Twitter is reference-only, never scraped). */
const TWITTER_RE = /(^|\.)(x\.com|twitter\.com|t\.co|mobile\.twitter\.com)$/i;
const URL_RE = /\bhttps?:\/\/[^\s"'<>)\]}]+/gi;

export function isTwitterUrl(u: string): boolean {
  try {
    return TWITTER_RE.test(new URL(u).hostname);
  } catch {
    return false;
  }
}

/** Pull unique http(s) URLs out of free text (the pasted claim, the source link). */
export function harvestUrls(texts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(URL_RE)) out.add(m[0].replace(/[.,);!?]+$/, ''));
  }
  return [...out];
}

export function classifyUrl(url: string, subject: string): OffchainSourceKind {
  let host = '';
  let path = '';
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return 'reference';
  }
  if (/(^|\.)github\.com$/.test(host)) return 'github';
  if (/(^|\.)gitbook\.io$/.test(host) || /^docs?\./.test(host) || path.startsWith('/docs')) return 'docs';
  const ticker = subject.replace(/^\$/, '').toLowerCase();
  if (ticker.length >= 3 && host.includes(ticker)) return 'official_site';
  return 'reference';
}

// ── SSRF guard ─────────────────────────────────────────────────────────────
// Resolve the host and refuse anything that lands on a private / loopback /
// link-local / CGNAT address, so a malicious "official site" can't make the
// engine fetch internal infrastructure.
function ipIsPrivate(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

async function isSafePublicHost(host: string): Promise<boolean> {
  const lower = host.toLowerCase();
  if (!lower || lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) return false;
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !ipIsPrivate(a.address));
  } catch {
    return false;
  }
}

export interface ReadablePage {
  url: string;
  title: string;
  text: string;
}

/**
 * Safely fetch a public page and reduce it to plain text. Manual redirect
 * following (≤3 hops) re-checks the host each hop so a redirect can't escape the
 * SSRF guard. Caps time, bytes and characters. Returns null on any problem —
 * off-chain evidence is best-effort and must never throw into the pipeline.
 */
export async function fetchReadable(rawUrl: string): Promise<ReadablePage | null> {
  const { fetchTimeoutMs, maxBytes, maxChars } = config.offchain;
  let url = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (isTwitterUrl(url) || !(await isSafePublicHost(u.hostname))) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
    let res: Response;
    try {
      res = await fetch(u, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain' },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      url = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|application\/(xhtml|json)/i.test(ct)) return null;

    const raw = (await res.text()).slice(0, maxBytes);
    return { url: u.toString(), title: extractTitle(raw), text: htmlToText(raw, maxChars) };
  }
  return null;
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? collapse(stripEntities(m[1])).slice(0, 120) : '';
}

function htmlToText(html: string, maxChars: number): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return collapse(stripEntities(stripped)).slice(0, maxChars);
}

function stripEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// ── Pluggable web search ─────────────────────────────────────────────────────
export interface SearchHit {
  url: string;
  title: string;
}

/**
 * Optional discovery of sites the claim didn't link. Keyed providers only
 * (Brave / Serper return clean JSON); with no key this is a no-op — we will not
 * scrape an HTML SERP, which from a datacenter IP returns unrelated junk and
 * would poison the HONESTY axis. Always guarded → [] on any failure.
 */
export async function webSearch(query: string): Promise<SearchHit[]> {
  const { searchProvider, searchApiKey } = config.offchain;
  if (searchProvider === 'none' || !searchApiKey) return [];
  try {
    if (searchProvider === 'brave') {
      const r = await fetchJson<{ web?: { results?: { url: string; title: string }[] } }>(
        'https://api.search.brave.com/res/v1/web/search?count=8&q=' + encodeURIComponent(query),
        { headers: { Accept: 'application/json', 'X-Subscription-Token': searchApiKey }, timeoutMs: 8_000 },
      );
      return (r.web?.results ?? []).filter((x) => x.url).map((x) => ({ url: x.url, title: x.title ?? '' }));
    }
    if (searchProvider === 'serper') {
      const r = await fetchJson<{ organic?: { link: string; title: string }[] }>(
        'https://google.serper.dev/search',
        {
          method: 'POST',
          headers: { 'X-API-KEY': searchApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, num: 8 }),
          timeoutMs: 8_000,
        },
      );
      return (r.organic ?? []).filter((x) => x.link).map((x) => ({ url: x.link, title: x.title ?? '' }));
    }
  } catch (err) {
    log.warn({ err: (err as Error).message, provider: searchProvider }, 'web search failed');
  }
  return [];
}
