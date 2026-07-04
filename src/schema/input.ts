import { z } from 'zod';

/** An EVM address on Base (0x + 40 hex). */
export const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 40-char hex address');

/**
 * The same address, matched anywhere inside free text (a pasted shill/CA drop).
 * Bounded on both sides so a mistyped address — one hex char short or long — is
 * never truncated/matched as if it were a valid 40-char address; an unanchored
 * regex would happily match the first 40 of a 41-char run and silently proceed
 * on the wrong address.
 */
const EMBEDDED_ADDRESS_RE = /(?<![a-fA-F0-9])0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;

/** Any 0x-prefixed hex run, valid length or not — used to catch a mistyped
 *  address so we can surface an honest error instead of quietly ignoring it. */
const HEX_TOKEN_RE = /0x[a-fA-F0-9]+/;

/**
 * Pull the first EVM contract address out of arbitrary text. Buyers frequently
 * paste the whole shill ("…CA: 0x… Chain: #BASE…") into `claim` instead of the
 * structured `subject_address` field, so we recover it here. Case is preserved
 * so an EIP-55 checksum survives. Returns null when no exact 0x40-hex token is
 * present (see `findMalformedAddress` for detecting a near-miss).
 */
export function extractAddress(text: string | undefined | null): string | null {
  return text?.match(EMBEDDED_ADDRESS_RE)?.[0] ?? null;
}

/**
 * Detect a 0x-prefixed hex token that is NOT exactly 40 hex chars — a mistyped
 * contract address (one digit dropped/added, or a truncated paste). Only
 * meaningful to call once `extractAddress` has failed to find a valid one.
 */
export function findMalformedAddress(
  text: string | undefined | null,
): { candidate: string; hexLength: number } | null {
  const m = text?.match(HEX_TOKEN_RE);
  if (!m) return null;
  const hexLength = m[0].length - 2;
  if (hexLength === 40) return null;
  return { candidate: m[0], hexLength };
}

/**
 * CAP service requirements (input). The buyer must supply EITHER an X/tweet URL
 * OR a manual (claim + subject_address) pair. URL auto-extraction is best-effort;
 * the manual path is the reliable primary path for the demo (see SPEC §2, §7).
 */
export const InputSchema = z
  .object({
    x_url: z.string().url().optional(),
    claim: z.string().min(1).max(2000).optional(),
    subject_address: AddressSchema.optional(),
    chain: z.string().default('base'),
  })
  .strip();

export type ReceiptInput = z.infer<typeof InputSchema>;

/** Resolution of an input into a runnable request, or an `insufficient` signal. */
export type ParsedInput =
  | { ok: true; value: ReceiptInput; hasUrl: boolean; hasManual: boolean }
  | { ok: false; reason: string };

/**
 * Validate + decide whether there is enough to act on. We never *reject* an order
 * for being thin — instead it resolves to an INSUFFICIENT receipt downstream
 * (SPEC §4.3 / §5). This returns `ok:false` only for malformed payloads.
 */
export function parseInput(raw: unknown): ParsedInput {
  // CROO delivers the buyer's order as `{ text: "…" }`. Our schema `.strip()`s any
  // unknown key, so an un-normalized `text` is discarded *before* extractAddress()
  // can recover a pasted CA — every CROO order then falls to INSUFFICIENT. Map
  // `text` → `claim` up front (only when it's a usable string, and only if no
  // explicit `claim` was supplied) so the rest of the pipeline sees it.
  if (
    raw &&
    typeof raw === 'object' &&
    'text' in raw &&
    !('claim' in raw) &&
    typeof (raw as { text?: unknown }).text === 'string'
  ) {
    raw = { ...(raw as object), claim: (raw as { text: string }).text };
  }

  const result = InputSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, reason: result.error.issues.map((i) => i.message).join('; ') };
  }
  const v = result.data;
  // Regex pre-pass: if no explicit subject_address was supplied, recover one from
  // any free-text field (a pasted CA). This is what keeps a real "CA drop" order
  // from falling through to INSUFFICIENT — a valid 0x address is always enough to
  // act. We scan EVERY candidate string (claim, x_url, and CROO's raw `text`) and
  // take the first that yields an address; `??` alone would stop at the first
  // non-null field even when it has no address in it.
  if (!v.subject_address) {
    const rawText =
      raw && typeof raw === 'object' && typeof (raw as { text?: unknown }).text === 'string'
        ? (raw as { text: string }).text
        : null;
    const embedded =
      extractAddress(v.claim) ?? extractAddress(v.x_url) ?? extractAddress(rawText);
    if (embedded) {
      v.subject_address = embedded;
    } else {
      // No valid 40-char address, but there may be a mistyped one (wrong length)
      // in the text — surface that honestly instead of silently falling through
      // to "no address provided", which reads as if none was ever attempted.
      const malformed =
        findMalformedAddress(v.claim) ?? findMalformedAddress(v.x_url) ?? findMalformedAddress(rawText);
      if (malformed) {
        return {
          ok: false,
          reason: `Address format invalid — expected 0x + 40 hex characters, got ${malformed.hexLength} characters`,
        };
      }
    }
  }
  const hasUrl = Boolean(v.x_url);
  const hasManual = Boolean(v.claim && v.subject_address);
  return { ok: true, value: v, hasUrl, hasManual };
}

/** True when the payload carries nothing checkable → INSUFFICIENT path. */
export function isInsufficientInput(v: ReceiptInput): boolean {
  const hasUrl = Boolean(v.x_url);
  const hasManual = Boolean(v.claim && v.subject_address);
  const hasAddressOnly = Boolean(v.subject_address);
  return !hasUrl && !hasManual && !hasAddressOnly;
}
