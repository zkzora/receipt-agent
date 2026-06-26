import { z } from 'zod';

/** An EVM address on Base (0x + 40 hex). */
export const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 40-char hex address');

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
