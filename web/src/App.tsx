import { ScanPanel } from './components/ScanPanel.tsx';

/** The CROO Agent Store listing where buyers can also hire RECEIPT (settles in
 *  USDC on Base). Override at build time with VITE_CROO_URL once published. */
const CROO_URL =
  (import.meta.env.VITE_CROO_URL as string | undefined) ?? 'https://agent.croo.network';

export function App() {
  return (
    <>
      {/* ===================== NAV ===================== */}
      <nav className="nav">
        <a className="nav__brand" href="#top">
          <img className="nav__logo" src="/receipt-logo.png" alt="" aria-hidden />
          RECEIPT
        </a>
        <div className="nav__links">
          <a href="#scan">Scan</a>
          <a href="#how">How it works</a>
          <a href="#tiers">Tiers</a>
          <a href="https://x.com/Receipt_Agent" target="_blank" rel="noreferrer">
            Follow us
          </a>
        </div>
        <a className="btn" href="#scan">
          Scan a token →
        </a>
      </nav>

      {/* ===================== HERO ===================== */}
      <header id="top" className="hero">
        <div className="hero__inner">
          <div className="hero__tag">On-chain lie detector · Solana &amp; Base</div>
          <h1 className="hero__h1">
            Don&apos;t trust the shill.
            <br />
            <span className="grad-text">Show me the receipts.</span>
          </h1>
          <p className="hero__lead">
            RECEIPT reads any token against the chain — mint &amp; freeze authority, liquidity, holders,
            deployer, bundle snipers — and stamps a verdict on three axes. Three tiers, pump.fun-aware,
            0.1 USDC a scan.
          </p>
          <div className="hero__cta">
            <a className="btn" href="#scan">
              Scan a token →
            </a>
            <a className="btn btn--ghost" href="#how">
              How it works
            </a>
          </div>
        </div>
      </header>

      {/* ===================== LIVE SCAN ===================== */}
      <ScanPanel />

      {/* ===================== HOW IT WORKS ===================== */}
      <section id="how" className="section">
        <div className="wrap">
          <div className="eyebrow">How it works</div>
          <h2 className="h2">Three steps. Every number traceable.</h2>
          <div className="steps">
            <div className="card">
              <div className="step__num">[ 01 ]</div>
              <div className="step__title">Pick a tier</div>
              <p className="step__copy">
                Verify a shill, run a Solana Degen scan, or a fast LP scan — each 0.1 USDC.
              </p>
            </div>
            <div className="card">
              <div className="step__num">[ 02 ]</div>
              <div className="step__title">Drop a token</div>
              <p className="step__copy">
                Paste a mint (or a shill claim + contract, or a tweet). RECEIPT detects the chain and
                reads it live — Solana or Base.
              </p>
            </div>
            <div className="card">
              <div className="step__num">[ 03 ]</div>
              <div className="step__title">Get the receipt</div>
              <p className="step__copy">
                A verdict across SAFETY, HONESTY and DISTRIBUTION — every finding sourced, the result
                hashed on-chain. Screenshot it, reply to the shill.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== TIERS ===================== */}
      <section id="tiers" className="section">
        <div className="wrap">
          <div className="eyebrow">Tiers</div>
          <h2 className="h2">Pick your depth.</h2>
          <p className="lead">Flat 0.1 USDC per scan — the tier decides what gets read.</p>
          <div className="tiers">
            <div className="card tier">
              <div className="tier__head">
                <span className="tier__name">Verify</span>
                <span className="tier__price">0.1 USDC</span>
              </div>
              <p className="tier__desc">Flagship shill fact-check — Solana &amp; Base.</p>
              <ul className="tier__list">
                <li>Mint / freeze authority, honeypot, tax</li>
                <li>True liquidity + LP burned/locked</li>
                <li>Top-holder concentration</li>
                <li>Shill claims cross-checked vs chain + project pages</li>
              </ul>
            </div>
            <div className="card tier">
              <div className="tier__head">
                <span className="tier__name">Degen Scan</span>
                <span className="tier__price">0.1 USDC</span>
              </div>
              <p className="tier__desc">Everything + degen alpha — Solana.</p>
              <ul className="tier__list">
                <li>DexScreener paid / boost status</li>
                <li>24h trading-fee revenue</li>
                <li>Dev-sold tracking</li>
                <li>Launch-slot bundle-sniper heuristic</li>
                <li>pump.fun / PumpSwap aware</li>
              </ul>
            </div>
            <div className="card tier">
              <div className="tier__head">
                <span className="tier__name">LP Scan</span>
                <span className="tier__price">0.1 USDC</span>
              </div>
              <p className="tier__desc">Fast liquidity read — Solana.</p>
              <ul className="tier__list">
                <li>True TVL &amp; pool depth</li>
                <li>LP burned vs locked</li>
                <li>Holder concentration</li>
                <li>No LLM — instant, deterministic</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== VERDICT LADDER ===================== */}
      <section className="section">
        <div className="wrap">
          <div className="eyebrow">The verdict</div>
          <h2 className="h2">Three axes. No hand-waving.</h2>
          <div className="ladder">
            <div className="rung">
              <span className="stamp stamp--based">BASED</span>
              <p className="rung__copy">SAFETY, HONESTY and DISTRIBUTION all clear on hard on-chain data.</p>
            </div>
            <div className="rung">
              <span className="stamp stamp--bullshit">BULLSHIT</span>
              <p className="rung__copy">Claims contradicted, or scam mechanics on-chain.</p>
            </div>
            <div className="rung">
              <span className="stamp stamp--redflags">RED FLAGS</span>
              <p className="rung__copy">Risk signals stacked — dev sold, bundle cohort, thin liquidity.</p>
            </div>
            <div className="rung">
              <span className="stamp stamp--mixed">MIXED</span>
              <p className="rung__copy">Safe on-chain, but a claim doesn&apos;t hold — or simply unconfirmable.</p>
            </div>
          </div>
          <p className="lead" style={{ marginTop: 28 }}>
            Hard stamps fire only on objective on-chain evidence. We flag the claim, not the person.
            Automated analysis — not financial advice.
          </p>
        </div>
      </section>

      {/* ===================== BUILT ON CROO ===================== */}
      <section id="croo" className="section">
        <div className="wrap">
          <div className="eyebrow">Built on CROO</div>
          <h2 className="h2">An agent that gets hired — and hires.</h2>
          <p className="lead">
            RECEIPT is a callable agent on the CROO Agent Store, settling in USDC via CAP. Other agents
            — trading bots, snipers, scam-alert feeds — can hire it as their verification layer, and it
            hires its own sub-agents to gather evidence. Every check carries a tamper-proof attestation.
          </p>
          <div className="chips">
            <span className="chip chip--grad">SOLANA</span>
            <span className="chip">BASE</span>
            <span className="chip">USDC</span>
            <span className="chip">CAP</span>
            <span className="chip">OPEN-SOURCE / MIT</span>
          </div>
          <div className="hero__cta" style={{ justifyContent: 'flex-start', marginTop: 30 }}>
            <a className="btn btn--ghost" href={CROO_URL} target="_blank" rel="noreferrer">
              Hire RECEIPT on CROO →
            </a>
          </div>
        </div>
      </section>

      {/* ===================== FINAL CTA ===================== */}
      <section id="final" className="final">
        <h2 className="final__kicker">Got a shill in your timeline?</h2>
        <div className="hero__cta">
          <a className="btn" href="#scan">
            Scan it now →
          </a>
        </div>
        <p className="final__sign">
          Don&apos;t trust it. <span className="grad-text">Show me the receipts.</span>
        </p>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="footer">
        <div className="footer__inner">
          <div>
            <div className="footer__brand">
              <img className="nav__logo" src="/receipt-logo.png" alt="" aria-hidden /> RECEIPT
            </div>
            <p className="footer__copy">
              Automated on-chain analysis. Not financial or legal advice. Verdicts reflect whether a
              claim matches verifiable on-chain data at the time of check.
            </p>
          </div>
          <div className="footer__links">
            <a href="#scan">Scan a token</a>
            <a href="https://x.com/Receipt_Agent" target="_blank" rel="noreferrer">
              Follow us on X
            </a>
            <a href={CROO_URL} target="_blank" rel="noreferrer">
              CROO Agent Store
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
