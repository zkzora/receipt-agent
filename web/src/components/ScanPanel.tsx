import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import type { Analysis, ScanMode } from '../lib/types.ts';
import { DEMO_RESULTS } from '../data/demoResults.ts';
import { ScanResult } from './ScanResult.tsx';
import { payForScan, type PaymentConfig } from '../lib/pay.ts';

/** Agent API base. Set VITE_API_URL to your VPS HTTPS endpoint in production. */
const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';

const TIERS: { key: ScanMode; name: string; placeholder: string }[] = [
  { key: 'full', name: 'Verify', placeholder: 'Paste a shill claim + token CA…' },
  { key: 'degen', name: 'Degen Scan', placeholder: 'Paste a Solana token mint (CA)…' },
  { key: 'lp', name: 'LP Scan', placeholder: 'Paste a Solana token mint to audit liquidity…' },
];

type Status = 'idle' | 'paying' | 'scanning';

export function ScanPanel() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const [tier, setTier] = useState<ScanMode>('degen');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Analysis | null>(DEMO_RESULTS.degen);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(true);
  const [payment, setPayment] = useState<PaymentConfig | null>(null);

  const active = TIERS.find((t) => t.key === tier)!;
  const busy = status !== 'idle';
  const priceLabel = payment ? `${payment.priceUsdc} USDC per scan` : 'free preview';

  // Ask the agent whether payment is required (null = free / rate-limited).
  useEffect(() => {
    fetch(`${API}/`)
      .then((r) => r.json())
      .then((d: { payment?: PaymentConfig | null }) => setPayment(d.payment ?? null))
      .catch(() => setPayment(null));
  }, []);

  function selectTier(t: ScanMode) {
    setTier(t);
    setError(null);
    if (isDemo) setResult(DEMO_RESULTS[t]);
  }

  async function onScan() {
    const q = input.trim();
    if (!q) {
      setResult(DEMO_RESULTS[tier]);
      setIsDemo(true);
      setError(null);
      return;
    }
    setError(null);

    // Pay first when the agent requires it.
    let paymentTx: string | undefined;
    if (payment) {
      if (!connected || !publicKey) {
        setVisible(true); // open the wallet picker (Phantom / Jupiter / …)
        return;
      }
      try {
        setStatus('paying');
        paymentTx = await payForScan(connection, publicKey, sendTransaction, payment);
      } catch (e) {
        setStatus('idle');
        setError(payError(e));
        return;
      }
    }

    try {
      setStatus('scanning');
      const res = await fetch(`${API}/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: q, mode: tier, paymentTx }),
      });
      if (res.status === 402) throw new Error('Payment not verified — try again.');
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
      setStatus('idle');
    }
  }

  const btnLabel =
    status === 'paying'
      ? 'Paying…'
      : status === 'scanning'
        ? 'Scanning…'
        : payment && !connected
          ? 'Connect & Scan →'
          : payment
            ? `Pay ${payment.priceUsdc} & Scan →`
            : 'Scan →';

  return (
    <section id="scan" className="scan-panel">
      <div className="scan-inner">
        <div className="scan-top">
          <div className="scan-eyebrow">Try it — {priceLabel}</div>
          <WalletMultiButton />
        </div>
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
              disabled={busy}
            >
              <span className="scan-tab-name">{t.name}</span>
              <span className="scan-tab-price">{payment ? `${payment.priceUsdc} USDC` : 'free'}</span>
            </button>
          ))}
        </div>

        <div className="scan-form">
          <input
            className="scan-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && onScan()}
            placeholder={active.placeholder}
            spellCheck={false}
            disabled={busy}
          />
          <button className="scan-go" type="button" onClick={onScan} disabled={busy}>
            {btnLabel}
          </button>
        </div>

        {error ? (
          <p className="scan-hint scan-hint--err">{error}</p>
        ) : (
          <p className="scan-hint">
            {status === 'paying'
              ? 'confirm the 0.1 USDC payment in your wallet…'
              : isDemo
                ? `demo preview · example ${active.name} result — paste a token and scan for a live read`
                : `live result · ${active.name}`}
          </p>
        )}

        {result && <ScanResult result={result} />}
      </div>
    </section>
  );
}

function payError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|rejected the request|declined/i.test(msg)) return 'Payment rejected in your wallet.';
  if (/insufficient|0x1\b/i.test(msg)) return 'Not enough USDC (or SOL for fees) in your wallet.';
  return msg.length > 130 ? `${msg.slice(0, 129)}…` : msg;
}
