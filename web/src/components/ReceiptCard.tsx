import type { Verdict } from '../lib/types.ts';
import { VERDICT_LABELS, verdictClass } from '../lib/types.ts';

interface Props {
  body: string;
  verdict: Verdict;
  /** Run the paper-feed animation on the body (hero print). */
  feed?: boolean;
  /** Slam the rubber stamp in. */
  slam?: boolean;
  /** Bump to replay the feed/slam animations (remounts the animated nodes). */
  replayKey?: number;
  variant?: 'art' | 'grid';
}

/** A printed receipt: perforated newsprint slip with a rotated verdict stamp. */
export function ReceiptCard({
  body,
  verdict,
  feed = false,
  slam = true,
  replayKey = 0,
  variant = 'grid',
}: Props) {
  return (
    <div className={`receipt ${variant === 'grid' ? 'receipt--in-grid' : ''}`}>
      <div className="receipt__perf receipt__perf--top" />
      <div className="receipt__brand">▮ RECEIPT.AI</div>
      <div className="receipt__tagline">show me the receipts</div>
      <pre
        key={`body-${replayKey}`}
        className={`receipt__body ${feed ? 'receipt__body--feeding' : ''}`}
      >
        {body}
      </pre>
      <div
        key={`stamp-${replayKey}`}
        className={`receipt__stamp ${verdictClass(verdict)} ${slam ? 'receipt__stamp--slam' : ''}`}
      >
        {VERDICT_LABELS[verdict]}
      </div>
      <div className="receipt__perf receipt__perf--bottom" />
    </div>
  );
}
