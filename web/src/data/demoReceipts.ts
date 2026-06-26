import type { Verdict } from '../lib/types.ts';

export interface DemoReceipt {
  verdict: Verdict;
  body: string;
}

/**
 * Static, pre-rendered example receipts for the marketing showcase. These mirror
 * the live agent's real output format — per-claim line items, on-chain reality,
 * off-chain SOURCES CHECKED, and the three-axis breakdown (SAFETY / HONESTY /
 * DISTRIBUTION) beneath the stamp. They are illustrative, not live lookups.
 */
export const DEMO_RECEIPTS: DemoReceipt[] = [
  {
    verdict: 'BULLSHIT',
    body: `=========================
 SUBJECT  : $LUNAR
 ADDRESS  : 0x9f2a…c81d
 SOURCE   : x.com/…
-------------------------
 CLAIMS CHECKED
  > "fully audited"
    [FALSE] unverified
  > "10M TVL"
    [FALSE] true TVL $42K
  > "LP locked"
    [UNVERIFIABLE]
-------------------------
 ON-CHAIN REALITY
  > contract . UNVERIFIED
  > true TVL ...... $42K
  > top-5 holders .. 68%
  > honeypot ...... none
  > tax b/s ... 4% / 35%
-------------------------
 SOURCES CHECKED
  > lunar.example [read]
  > x.com ..... [X·ref]
-------------------------
 VERDICT   [ BULLSHIT ]
  SAFETY ......... FAIL
  HONESTY ........ FAIL
  DISTRIBUTION ... WARN
 CONFIDENCE   HIGH
-------------------------
 attested 0x7c…e4
 not financial advice
=========================`,
  },
  {
    verdict: 'BASED',
    body: `=========================
 SUBJECT  : $BASEDX
 ADDRESS  : 0x44b1…0fa2
 SOURCE   : x.com/…
-------------------------
 CLAIMS CHECKED
  > "renounced"
    [TRUE] no mint auth
  > "0 tax"
    [TRUE] buy/sell 0%
  > "LP locked"
    [TRUE] lock confirmed
-------------------------
 ON-CHAIN REALITY
  > contract ... VERIFIED
  > tax b/s ... 0% / 0%
  > top-5 holders .. 31%
  > honeypot ...... none
  > LP locked ...... yes
-------------------------
 SOURCES CHECKED
  > basedx.xyz .. [read]
  > github.com .. [read]
-------------------------
 VERDICT     [ BASED ]
  SAFETY ......... PASS
  HONESTY ........ PASS
  DISTRIBUTION ... PASS
 CONFIDENCE   HIGH
-------------------------
 attested 0x1a…9b
 not financial advice
=========================`,
  },
  {
    verdict: 'MIXED',
    body: `=========================
 SUBJECT  : $NEWGEM
 ADDRESS  : 0xab12…ef90
 SOURCE   : x.com/…
-------------------------
 CLAIMS CHECKED
  > "audited"
    [TRUE] source verified
  > "LP locked"
    [FALSE] LP not locked
  > "tier-1 backed"
    [UNVERIFIABLE]
-------------------------
 ON-CHAIN REALITY
  > contract ... VERIFIED
  > tax b/s ... 0% / 0%
  > top-5 holders .. 41%
  > honeypot ...... none
  > LP locked ....... NO
-------------------------
 SOURCES CHECKED
  > newgem.xyz .. [read]
  > x.com ..... [X·ref]
-------------------------
 VERDICT     [ MIXED ]
  SAFETY ......... PASS
  HONESTY ........ FAIL
  DISTRIBUTION ... PASS
 CONFIDENCE  MEDIUM
-------------------------
 attested 0x5d…2c
 not financial advice
=========================`,
  },
];
