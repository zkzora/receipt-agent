import { ReceiptCard } from './components/ReceiptCard.tsx';
import { Dither } from './components/Dither.tsx';
import { DEMO_RECEIPTS } from './data/demoReceipts.ts';

const BLUE = '#0026FF';
const PAPER = '#F2F0E9';

/** The CROO Agent Store listing where buyers place paid (USDC) orders. Override
 *  at build time with VITE_CROO_URL once the listing is published. */
const CROO_URL =
  (import.meta.env.VITE_CROO_URL as string | undefined) ?? 'https://agent.croo.network';

const HERO_RECEIPT = DEMO_RECEIPTS[0]; // the BULLSHIT example

export function App() {
  return (
    <>
      {/* ===================== NAV ===================== */}
      <nav className="nav">
        <a className="nav__brand" href="#top">
          ▮&nbsp;RECEIPT
        </a>
        <div className="nav__links">
          <a href="#how">How it works</a>
          <a href="#receipt">The Receipt</a>
          <a href="#croo">Built on CROO</a>
        </div>
        <a className="nav__cta" href={CROO_URL} target="_blank" rel="noreferrer">
          [ Verify a shill ]
        </a>
      </nav>

      {/* ===================== HERO ===================== */}
      <header id="top" className="hero">
        <span className="corner" style={{ top: 14, left: 14 }}>
          +
        </span>
        <span className="corner" style={{ top: 14, right: 14 }}>
          +
        </span>
        <span className="corner" style={{ bottom: 14, left: 14 }}>
          +
        </span>
        <span className="corner" style={{ bottom: 14, right: 14 }}>
          +
        </span>

        <div className="hero__inner">
          <div className="hero__col">
            <div className="tag">[ ON-CHAIN LIE DETECTOR FOR CRYPTO TWITTER ]</div>
            <h1 className="hero__h1">
              <span className="solid">
                Don&apos;t trust
                <br />
                the shill.
              </span>
              <span className="outline">
                Show me the
                <br />
                receipts.
              </span>
            </h1>
            <p className="hero__lead">
              RECEIPT is an on-chain agent that reads a Crypto Twitter shill against the chain —
              contract, liquidity, holders, deployer, and the project&apos;s own pages — and prints a
              verdict on three axes. Hire it on CROO; it settles in USDC on Base.
            </p>
            <div className="hero__cta">
              <a className="cta-btn" href={CROO_URL} target="_blank" rel="noreferrer">
                [ Verify a shill on CROO → ]
              </a>
              <a className="cta-btn cta-btn--ghost" href="#how">
                How it works
              </a>
            </div>
          </div>

          <div className="hero__art">
            <div className="hero__art-frame">
              <ReceiptCard
                body={HERO_RECEIPT.body}
                verdict={HERO_RECEIPT.verdict}
                slam
                variant="art"
              />
              <p className="receipt__status">a real RECEIPT verdict — every number traceable.</p>
            </div>
          </div>
        </div>
      </header>

      <Dither scatter={BLUE} bg={PAPER} />

      {/* ===================== THE PROBLEM ===================== */}
      <section className="section section--paper">
        <div className="wrap" style={{ maxWidth: 1100 }}>
          <div className="eyebrow eyebrow--blue">[ THE PROBLEM ]</div>
          <h2 className="h2" style={{ maxWidth: '18ch', marginBottom: 40 }}>
            Everyone&apos;s a tier-1 insider until the liquidity&apos;s gone.
          </h2>
          <div className="problem__grid">
            <div className="quotebox">
              <div className="quotebox__label">[ THE SHILL ]</div>
              <p className="quotebox__quote">
                &ldquo;$XYZ — backed by tier-1 angels, fully audited, 10M TVL, all organic.&rdquo;
              </p>
            </div>
            <div>
              <p className="problem__copy">
                Four thousand people ape in ninety seconds. The contract was unverified. True TVL
                was <strong>$42k</strong>. Five wallets held <strong>68%</strong>. The deployer had
                rugged <strong className="red">seven tokens</strong> before this one. Nobody checked
                — because checking meant six tabs and twenty minutes you didn&apos;t have.
              </p>
            </div>
          </div>
          <p className="problem__punch">
            RECEIPT does it in <span>one order.</span>
          </p>
        </div>
      </section>

      {/* ===================== HOW IT WORKS ===================== */}
      <section id="how" className="section section--paper how">
        <div className="wrap">
          <div className="eyebrow eyebrow--blue" style={{ margin: '48px 0 36px' }}>
            [ HOW IT WORKS ]
          </div>
          <div className="steps">
            <div className="step">
              <div className="step__num">[ 01 ]</div>
              <div className="step__title">Hire</div>
              <p className="step__copy">
                Place an order on the CROO Agent Store with the shill&apos;s tweet or contract.
                RECEIPT pulls the ticker and address straight from it.
              </p>
            </div>
            <div className="step">
              <div className="step__num">[ 02 ]</div>
              <div className="step__title">Check</div>
              <p className="step__copy">
                It reads the chain: contract status, honeypot, tax, liquidity, holder concentration,
                deployer history — and reads the project&apos;s own site + repo — then matches every
                claim against the evidence.
              </p>
            </div>
            <div className="step">
              <div className="step__num">[ 03 ]</div>
              <div className="step__title">Receipt</div>
              <p className="step__copy">
                You get a receipt: BASED, BULLSHIT, or MIXED, broken out into SAFETY, HONESTY and
                DISTRIBUTION. Every number traceable. The result hashed on-chain.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Dither scatter={PAPER} bg={BLUE} />

      {/* ===================== THE RECEIPT ===================== */}
      <section id="receipt" className="section section--blue">
        <div className="wrap">
          <div className="eyebrow eyebrow--white">[ THE RECEIPT ]</div>
          <h2 className="h2" style={{ maxWidth: '20ch', marginBottom: 48 }}>
            Screenshot it. Reply to the shill. Watch.
          </h2>
          <div className="gallery">
            {DEMO_RECEIPTS.map((r) => (
              <ReceiptCard key={r.verdict} body={r.body} verdict={r.verdict} slam variant="grid" />
            ))}
          </div>
          <p className="note">Every receipt is a meme and a fact-check. Built to be posted.</p>
        </div>
      </section>

      <Dither scatter={BLUE} bg={PAPER} />

      {/* ===================== WHAT IT CHECKS ===================== */}
      <section className="section section--paper">
        <div className="wrap">
          <div className="eyebrow eyebrow--blue" style={{ marginBottom: 36 }}>
            [ WHAT IT CHECKS ]
          </div>
          <div className="checks">
            <Check title="CONTRACT" copy="Verified or unverified on Basescan." />
            <Check title="HONEYPOT" copy="Can you actually sell, or only buy?" />
            <Check title="TAX" copy="Buy/sell tax and hidden fees." />
            <Check title="LIQUIDITY" copy="Real TVL vs the claim. Locked or not." />
            <Check title="HOLDERS" copy="Top-wallet concentration." />
            <Check
              title="DEPLOYER HISTORY"
              copy="Past deploys, past rugs, how the wallet was funded."
            />
            <Check
              dark
              title="CLAIM MATCH"
              copy="Do the shill's words match the chain — and the project's own pages?"
            />
          </div>
        </div>
      </section>

      <Dither scatter={PAPER} bg={BLUE} />

      {/* ===================== THE VERDICT ===================== */}
      <section className="section section--blue">
        <div className="wrap" style={{ maxWidth: 1180 }}>
          <div className="eyebrow eyebrow--white">[ THE VERDICT ]</div>
          <h2 className="h2" style={{ maxWidth: '18ch', marginBottom: 52 }}>
            Three axes. No hand-waving.
          </h2>
          <div className="verdicts">
            <div className="verdict">
              <div className="verdict__stamp v-based">BASED</div>
              <p className="verdict__copy">
                SAFETY, HONESTY and DISTRIBUTION all clear against hard on-chain data.
              </p>
            </div>
            <div className="verdict">
              <div className="verdict__stamp v-bullshit">BULLSHIT</div>
              <p className="verdict__copy">Claims contradicted, or scam mechanics on-chain.</p>
            </div>
            <div className="verdict">
              <div className="verdict__stamp verdict__stamp--sm v-mixed">MIXED / UNVERIFIED</div>
              <p className="verdict__copy">
                Safe on-chain but a claim doesn&apos;t hold — or simply unconfirmable.
              </p>
            </div>
          </div>
          <p className="disclaimer">
            Hard stamps fire only on objective on-chain evidence. We flag the claim, not the person.
            Automated on-chain analysis — not financial or legal advice.
          </p>
        </div>
      </section>

      <Dither scatter={BLUE} bg={PAPER} />

      {/* ===================== BUILT ON CROO ===================== */}
      <section id="croo" className="section section--paper">
        <div className="wrap" style={{ maxWidth: 1040 }}>
          <div className="eyebrow eyebrow--blue">[ BUILT ON CROO ]</div>
          <h2 className="h2" style={{ maxWidth: '20ch', marginBottom: 30 }}>
            An agent that gets hired — and hires.
          </h2>
          <p className="croo__copy">
            RECEIPT is a callable agent on the CROO Agent Store, settling in USDC on Base via CAP.
            Other agents — trading bots, snipers, scam-alert feeds — can hire RECEIPT as their
            verification layer. And RECEIPT hires its own sub-agents to gather evidence. Every check
            is a real on-chain order with a tamper-proof attestation.
          </p>
          <div className="chips">
            <span className="chip">USDC</span>
            <span className="chip">BASE</span>
            <span className="chip">CAP</span>
            <span className="chip chip--dark">OPEN-SOURCE / MIT</span>
          </div>
          <div className="hero__cta" style={{ marginTop: 32 }}>
            <a className="cta-btn" href={CROO_URL} target="_blank" rel="noreferrer">
              [ Hire RECEIPT on CROO → ]
            </a>
          </div>
        </div>
      </section>

      <Dither scatter={PAPER} bg={BLUE} />

      {/* ===================== WHY RECEIPT ===================== */}
      <section className="section section--blue">
        <div className="wrap">
          <div className="eyebrow eyebrow--white" style={{ marginBottom: 40 }}>
            [ WHY RECEIPT ]
          </div>
          <div className="why">
            <div className="why__cell">
              <div className="why__title">
                A tweet,
                <br />
                not a contract.
              </div>
              <p className="why__copy">
                Other tools want a contract address you already have. RECEIPT starts where you
                actually are: staring at a shill.
              </p>
            </div>
            <div className="why__cell">
              <div className="why__title">
                A receipt,
                <br />
                not a dashboard.
              </div>
              <p className="why__copy">
                No 0–100 score to squint at. A verdict you can screenshot and post.
              </p>
            </div>
            <div className="why__cell">
              <div className="why__title">
                Composable,
                <br />
                on-chain.
              </div>
              <p className="why__copy">
                Not a website widget. An agent other agents can call, settling on-chain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FINAL CTA ===================== */}
      <section id="final" className="section--blue final">
        <span className="corner" style={{ top: 16, left: 16 }}>
          +
        </span>
        <span className="corner" style={{ top: 16, right: 16 }}>
          +
        </span>
        <div className="wrap">
          <h2 className="final__kicker">Got a shill in your timeline?</h2>
          <div className="hero__cta hero__cta--center">
            <a className="cta-btn cta-btn--lg" href={CROO_URL} target="_blank" rel="noreferrer">
              [ Verify it on CROO → ]
            </a>
          </div>
          <p className="final__sign">
            Don&apos;t trust it.
            <br />
            <span className="outline">Show me the receipts.</span>
          </p>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="footer">
        <div className="footer__inner">
          <div>
            <div className="footer__brand">▮&nbsp;RECEIPT</div>
            <p className="footer__copy">
              Automated on-chain analysis. Not financial or legal advice. Verdicts reflect whether a
              claim matches verifiable on-chain data at the time of check.
            </p>
          </div>
          <div className="footer__links">
            <a href="#">GitHub (MIT)</a>
            <a href="#">X / @receipt_ai</a>
            <a href={CROO_URL} target="_blank" rel="noreferrer">
              CROO Agent Store
            </a>
            <a href="#">Docs</a>
          </div>
        </div>
        <div aria-hidden className="footer__zip" />
      </footer>
    </>
  );
}

function Check({ title, copy, dark }: { title: string; copy: string; dark?: boolean }) {
  return (
    <div className={`check ${dark ? 'check--dark' : ''}`}>
      <div className="check__title">{title}</div>
      <p className="check__copy">{copy}</p>
    </div>
  );
}
