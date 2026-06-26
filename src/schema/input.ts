import { z } from 'zod';

/** An EVM address on Base (0x + 40 hex). */
export const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 40-char hex address');

/** The same address, matched anywhere inside free text (a pasted shill/CA drop). */
const EMBEDDED_ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

/**
 * Pull the first EVM contract address out of arbitrary text. Buyers frequently
 * paste the whole shill ("…CA: 0x… Chain: #BASE…") into `claim` instead of the
 * structured `subject_address` field, so we recover it here. Case is preserved
 * so an EIP-55 checksum survives. Returns null when no 0x40-hex token is present.
 */
export function extractAddress(text: string | undefined | null): string | null {
  return text?.match(EMBEDDED_ADDRESS_RE)?.[0] ?? null;
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
  const result = InputSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, reason: result.error.issues.map((i) => i.message).join('; ') };
  }
  const v = result.data;
  // Regex pre-pass: if no explicit subject_address was supplied, recover one from
  // the claim text (a pasted CA). This is what keeps a real "CA drop" order from
  // falling through to INSUFFICIENT — a valid 0x address is always enough to act.
  if (!v.subject_address) {
    const embedded = extractAddress(v.claim);
    if (embedded) v.subject_address = embedded;
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
