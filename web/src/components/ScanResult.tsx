import type { Analysis, OnchainFinding, FindingStatus } from '../lib/types.ts';
import {
  VERDICT_COLORS,
  VERDICT_LABELS,
  AXIS_STATUS_COLORS,
  CLAIM_VERDICT_COLORS,
} from '../lib/types.ts';
import './scan.css';

const SCAN_LABEL: Record<Analysis['scan_mode'], string> = {
  full: 'FULL VERIFY',
  degen: 'DEGEN SCAN',
  lp: 'LP SCAN',
};

const DOT: Record<FindingStatus, string> = {
  ok: '#14F195',
  flag: '#FF5C6C',
  unavailable: '#6b7280',
};

/** Evidence groups, in display order. A finding lands in the first group whose
 *  metric list contains it; anything unmatched falls to "Other". */
const GROUPS: { key: string; label: string; metrics: string[] }[] = [
  {
    key: 'safety',
    label: 'Safety',
    metrics: [
      'mint permission', 'mint authority', 'freeze permission', 'freeze authority',
      'security score', 'honeypot', 'contract', 'tax b/s', 'verified',
    ],
  },
  {
    key: 'liquidity',
    label: 'Liquidity',
    metrics: ['true TVL', 'FDV', 'pair age', 'LP burned', 'LP status', 'liquidity'],
  },
  {
    key: 'distribution',
    label: 'Distribution',
    metrics: ['top-5 holders', 'largest non-AMM wallet', 'holders'],
  },
  {
    key: 'degen',
    label: 'Degen signals',
    metrics: ['dex paid', 'trading fees (24h)', 'dev sold', 'launch-slot wallets (heuristic)'],
  },
];

function shortAddr(a: string | null): string {
  if (!a) return '—';
  if (a.length <= 13) return a;
  return `${a.slice(0, 5)}…${a.slice(-4)}`;
}
function shortHash(h: string): string {
  return h.length <= 12 ? h : `${h.slice(0, 6)}…${h.slice(-4)}`;
}

function groupFindings(findings: OnchainFinding[]) {
  const buckets = new Map<string, OnchainFinding[]>();
  const other: OnchainFinding[] = [];
  for (const f of findings) {
    const g = GROUPS.find((grp) => grp.metrics.includes(f.metric));
    if (g) {
      const arr = buckets.get(g.key) ?? [];
      arr.push(f);
      buckets.set(g.key, arr);
    } else {
      other.push(f);
    }
  }
  const ordered = GROUPS.filter((g) => buckets.get(g.key)?.length).map((g) => ({
    label: g.label,
    items: buckets.get(g.key) as OnchainFinding[],
  }));
  if (other.length) ordered.push({ label: 'Other', items: other });
  return ordered;
}

function Row({ f }: { f: OnchainFinding }) {
  return (
    <div className="sr-row">
      <span className="sr-dot" style={{ background: DOT[f.status] }} />
      <span className="sr-metric">{f.metric}</span>
      <span className="sr-value" data-status={f.status}>
        {f.status === 'unavailable' ? 'unavailable' : f.value}
      </span>
    </div>
  );
}

export function ScanResult({ result }: { result: Analysis }) {
  const color = VERDICT_COLORS[result.verdict];
  const groups = groupFindings(result.onchain_findings);
  const ts = new Date(result.attestation.timestamp);
  const hhmm = `${String(ts.getUTCHours()).padStart(2, '0')}:${String(ts.getUTCMinutes()).padStart(2, '0')}Z`;

  return (
    <article className="sr" style={{ ['--verdict' as string]: color }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sr-head">
        <div className="sr-badges">
          <span className="sr-badge sr-badge--tier">{SCAN_LABEL[result.scan_mode]}</span>
          <span className={`sr-badge sr-badge--chain sr-badge--${result.chain}`}>
            {result.chain === 'solana' ? 'SOLANA' : 'BASE'}
          </span>
        </div>

        <div className="sr-head-main">
          <div className="sr-subject">
            <h3 className="sr-ticker">{result.subject}</h3>
            <span className="sr-addr">{shortAddr(result.subject_address)}</span>
          </div>
          <div className="sr-verdict">
            <span className="sr-verdict-label">{VERDICT_LABELS[result.verdict]}</span>
            <span className="sr-conf">confidence {result.confidence}</span>
          </div>
        </div>

        {/* ── 3-axis pills (the at-a-glance summary) ─────────────── */}
        <div className="sr-axes">
          {result.axes.map((a) => (
            <div className="sr-axis" key={a.axis}>
              <span className="sr-axis-dot" style={{ background: AXIS_STATUS_COLORS[a.status] }} />
              <div className="sr-axis-text">
                <span className="sr-axis-name">{a.axis}</span>
                <span className="sr-axis-detail">{a.detail}</span>
              </div>
              <span className="sr-axis-status" style={{ color: AXIS_STATUS_COLORS[a.status] }}>
                {a.status}
              </span>
            </div>
          ))}
        </div>
      </header>

      {/* ── Narrative (what the project says it is) ─────────────── */}
      {result.offchain?.narrative && (
        <div className="sr-narrative">
          <span className="sr-narrative-tag">NARRATIVE</span>
          <p>{result.offchain.narrative}</p>
        </div>
      )}

      {/* ── Claims (only when present) ─────────────────────────── */}
      {result.claim_checks.length > 0 && (
        <details className="sr-group" open>
          <summary>
            Claims checked <span className="sr-count">{result.claim_checks.length}</span>
          </summary>
          <div className="sr-claims">
            {result.claim_checks.map((c, i) => (
              <div className="sr-claim" key={i}>
                <span className="sr-claim-dot" style={{ background: CLAIM_VERDICT_COLORS[c.status] }} />
                <div className="sr-claim-body">
                  <span className="sr-claim-text">“{c.claim}”</span>
                  <span className="sr-claim-note">
                    <b style={{ color: CLAIM_VERDICT_COLORS[c.status] }}>{c.status}</b>
                    {c.note ? ` · ${c.note}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── On-chain evidence, grouped + collapsible ───────────── */}
      <div className="sr-grid">
        {groups.map((g) => (
          <details className="sr-group" key={g.label} open>
            <summary>
              {g.label} <span className="sr-count">{g.items.length}</span>
            </summary>
            <div className="sr-rows">
              {g.items.map((f, i) => (
                <Row f={f} key={i} />
              ))}
            </div>
          </details>
        ))}

        {result.deployer_findings.length > 0 && (
          <details className="sr-group" open>
            <summary>
              Deployer <span className="sr-count">{result.deployer_findings.length}</span>
            </summary>
            <div className="sr-rows">
              {result.deployer_findings.map((d, i) => (
                <div className="sr-fact" key={i}>{d.fact}</div>
              ))}
            </div>
          </details>
        )}

        {result.offchain && result.offchain.sources.length > 0 && (
          <details className="sr-group">
            <summary>
              Sources checked{' '}
              <span className="sr-count">
                {result.offchain.sources.length + result.offchain.skipped.length}
              </span>
            </summary>
            <div className="sr-rows">
              {result.offchain.sources.map((s, i) => (
                <div className="sr-row" key={`s${i}`}>
                  <span className="sr-dot" style={{ background: s.fetched ? '#14F195' : '#6b7280' }} />
                  <span className="sr-metric">{hostOf(s.url)}</span>
                  <span className="sr-value">{s.fetched ? 'read' : 'no read'}</span>
                </div>
              ))}
              {result.offchain.skipped.map((u, i) => (
                <div className="sr-row" key={`k${i}`}>
                  <span className="sr-dot" style={{ background: '#6b7280' }} />
                  <span className="sr-metric">{hostOf(u)}</span>
                  <span className="sr-value">X · ref</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ── Caveat (only when hedged) ──────────────────────────── */}
      {result.caveats && (result.verdict === 'MIXED' || result.verdict === 'INSUFFICIENT') && (
        <p className="sr-caveat">{result.caveats}</p>
      )}

      {/* ── Footer: proof + share ──────────────────────────────── */}
      <footer className="sr-foot">
        <div className="sr-attest">
          <span className="sr-attest-dot" />
          attested {shortHash(result.attestation.hash)} · {hhmm}
        </div>
        <div className="sr-foot-right">
          <span className="sr-nfa">not financial advice</span>
          <button className="sr-dl" type="button" disabled title="wire receipt_image to enable">
            ↓ Receipt PNG
          </button>
        </div>
      </footer>
    </article>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? url;
  }
}
