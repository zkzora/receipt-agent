import { useState } from 'react';
import type { Analysis, ScanMode } from '../lib/types.ts';
import { DEMO_RESULTS } from '../data/demoResults.ts';
import { ScanResult } from './ScanResult.tsx';

/** Agent API base. Set VITE_API_URL to your VPS HTTPS endpoint in production
 *  (e.g. https://api.receipt.xyz); defaults to the local agent for dev. */
const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';

const TIERS: { key: ScanMode; name: string; price: string; placeholder: string }[] = [
  { key: 'full', name: 'Verify', price: '0.1 USDC', placeholder: 'Paste a shill claim + token CA…' },
  { key: 'degen', name: 'Degen Scan', price: '0.1 USDC', placeholder: 'Paste a Solana token mint (CA)…' },
  { key: 'lp', name: 'LP Scan', price: '0.1 USDC', placeholder: 'Paste a Solana token mint to audit liquidity…' },
];

export function ScanPanel() {
  const [tier, setTier] = useState<ScanMode>('degen');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Analysis | null>(DEMO_RESULTS.degen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(true);

  const active = TIERS.find((t) => t.key === tier)!;

  function selectTier(t: ScanMode) {
    setTier(t);
    setError(null);
    if (isDemo) setResult(DEMO_RESULTS[t]);
  }

  async function onScan() {
    const q = input.trim();
    if (!q) {
      // No input → preview the example result for this tier.
      setResult(DEMO_RESULTS[tier]);
      setIsDemo(true);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: q, mode: tier }),
      });
      if (res.status === 429) throw new Error('Rate limit reached — try again in a bit.');
      if (!res.ok) throw new Error(`Scan failed (${res.status}).`);
      const data = (await res.json()) as Analysis;
      setResult(data);
      setIsDemo(false);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Can't reach the agent — is it running / VITE_API_URL set?"
          : e instanceof Error
            ? e.message
            : 'Scan failed.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="scan" className="scan-panel">
      <div className="scan-inner">
        <div className="scan-eyebrow">Try it — 0.1 USDC per scan</div>
        <h2 className="scan-title">Show me the receipts.</h2>
        <p className="scan-sub">
          Pick a tier, drop a token — RECEIPT reads the chain and stamps a verdict on Solana &amp; Base.
        </p>

        <div className="scan-tabs" role="tablist">
          {TIERS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={t.key === tier}
              className={`scan-tab${t.key === tier ? ' active' : ''}`}
              onClick={() => selectTier(t.key)}
            >
              <span className="scan-tab-name">{t.name}</span>
              <span className="scan-tab-price">{t.price}</span>
            </button>
          ))}
        </div>

        <div className="scan-form">
          <input
            className="scan-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && onScan()}
            placeholder={active.placeholder}
            spellCheck={false}
          />
          <button className="scan-go" type="button" onClick={onScan} disabled={loading}>
            {loading ? 'Scanning…' : 'Scan →'}
          </button>
        </div>

        {error ? (
          <p className="scan-hint scan-hint--err">{error}</p>
        ) : (
          <p className="scan-hint">
            {isDemo
              ? `demo preview · example ${active.name} result — paste a token and hit Scan for a live read`
              : `live result · ${active.name}`}
          </p>
        )}

        {result && <ScanResult result={result} />}
      </div>
    </section>
  );
}
