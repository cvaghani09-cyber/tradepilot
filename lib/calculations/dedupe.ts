import { createHash } from "node:crypto";

export type FingerprintFields = {
  accountId: string;
  contract: string;
  executedAt: Date;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
};

export function baseFingerprint(f: FingerprintFields): string {
  const key = [
    f.accountId,
    f.contract.trim().toUpperCase(),
    f.executedAt.toISOString(),
    f.side,
    f.quantity,
    f.price.toFixed(6),
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/**
 * Fingerprints for a batch. Identical fills within the same batch (same time, side,
 * quantity and price — common with split fills) get an occurrence suffix so they
 * stay distinct from each other, while re-importing the same file still collides.
 */
export function batchFingerprints(rows: readonly FingerprintFields[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = baseFingerprint(r);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

export type ExistingExecutionKey = { id: string; fingerprint: string; externalId: string | null };
export type IncomingExecutionKey = { fingerprint: string; externalId?: string | null };

/**
 * Returns, for each incoming row, the id of the existing execution it duplicates (or null).
 * A row is a duplicate when its external execution id matches, or when its fingerprint
 * (account, contract, timestamp, side, quantity, price) matches.
 */
export function findDuplicates(
  incoming: readonly IncomingExecutionKey[],
  existing: readonly ExistingExecutionKey[],
): (string | null)[] {
  const byExt = new Map<string, string>();
  const byFp = new Map<string, string>();
  for (const e of existing) {
    if (e.externalId) byExt.set(e.externalId, e.id);
    byFp.set(e.fingerprint, e.id);
  }
  return incoming.map((r) => {
    if (r.externalId && byExt.has(r.externalId)) return byExt.get(r.externalId)!;
    return byFp.get(r.fingerprint) ?? null;
  });
}
