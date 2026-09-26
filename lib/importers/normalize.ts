import { round2 } from "@/lib/calculations/money";
import { parseDateTime, combineDateTime, type DateOrder } from "./datetime";
import { parseDirection, parseNumber, parseSide } from "./values";
import { missingRequired, type RowKind } from "./fields";

export type NormalizedExecution = {
  row: number; // 1-based data row number (header excluded)
  accountId: string;
  contract: string;
  instrumentId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  executedAt: string; // ISO
  sequence: number;
  commission: number;
  otherFees: number;
  feesProvided: boolean;
  externalId: string | null;
  orderId: string | null;
};

export type RowIssue = { row: number; field: string | null; message: string };

export type NormalizeContext = {
  kind: RowKind;
  mapping: Record<string, string | null>;
  timezone: string;
  dateOrder: DateOrder;
  defaultAccountId: string;
  resolveInstrument: (contract: string) => { id: string; symbol: string; tickSize: number; tickValue: number } | null;
  resolveAccount: (value: string) => string | null;
};

export type NormalizeResult = {
  executions: NormalizedExecution[];
  errors: RowIssue[];
  warnings: RowIssue[];
  invalidRows: number;
  totalRows: number;
};

export class MappingError extends Error {}

export function normalizeRows(rows: Record<string, unknown>[], ctx: NormalizeContext): NormalizeResult {
  const missing = missingRequired(ctx.mapping, ctx.kind);
  if (missing.length) {
    throw new MappingError(`Map these required columns before continuing: ${missing.join(", ")}.`);
  }
  const m = ctx.mapping;
  const get = (row: Record<string, unknown>, key: string) => {
    const col = m[key];
    if (!col) return undefined;
    const v = row[col];
    return v == null ? undefined : typeof v === "string" ? v.trim() : v;
  };

  const executions: NormalizedExecution[] = [];
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const invalid = new Set<number>();
  const unknownInstruments = new Map<string, number>();
  const unknownAccounts = new Map<string, number>();

  rows.forEach((row, idx) => {
    const n = idx + 1;
    const fail = (field: string | null, message: string) => {
      errors.push({ row: n, field, message });
      invalid.add(n);
    };
    // Skip entirely blank lines silently
    if (Object.values(row).every((v) => v == null || String(v).trim() === "")) return;

    // Account routing
    let accountId = ctx.defaultAccountId;
    const acctRaw = get(row, "account");
    if (m.account && acctRaw != null && String(acctRaw) !== "") {
      const found = ctx.resolveAccount(String(acctRaw));
      if (!found) {
        unknownAccounts.set(String(acctRaw), (unknownAccounts.get(String(acctRaw)) ?? 0) + 1);
        invalid.add(n);
        return;
      }
      accountId = found;
    }

    const contractRaw = get(row, "contract");
    if (contractRaw == null || String(contractRaw) === "") return fail("contract", "Symbol is empty.");
    const contract = String(contractRaw).toUpperCase().replace(/^[/@]/, "");
    const inst = ctx.resolveInstrument(contract);
    if (!inst) {
      unknownInstruments.set(contract, (unknownInstruments.get(contract) ?? 0) + 1);
      invalid.add(n);
      return;
    }

    const commission = parseNumber(get(row, "commission"));
    const otherFees = parseNumber(get(row, "fees"));
    const feesProvided = !!(m.commission || m.fees);
    const externalId = get(row, "externalId") != null && String(get(row, "externalId")) !== "" ? String(get(row, "externalId")) : null;

    if (ctx.kind === "EXECUTIONS") {
      let qty = parseNumber(get(row, "quantity"));
      if (qty == null || qty === 0) return fail("quantity", `Quantity "${get(row, "quantity") ?? ""}" isn't a number.`);
      let side = parseSide(get(row, "side"));
      if (!side) {
        if (m.side && get(row, "side") != null && String(get(row, "side")) !== "") {
          return fail("side", `Side "${get(row, "side")}" isn't recognised. Use Buy/Sell (or B/S).`);
        }
        side = qty > 0 ? "BUY" : "SELL";
      }
      qty = Math.abs(qty);
      if (!Number.isInteger(qty)) return fail("quantity", `Quantity ${qty} must be a whole number of contracts.`);
      const price = parseNumber(get(row, "price"));
      if (price == null || price <= 0) return fail("price", `Price "${get(row, "price") ?? ""}" isn't a valid price.`);
      const rawTime = m.time ? get(row, "time") : combineDateTime(get(row, "date"), get(row, "timeOfDay"));
      const at = parseDateTime(rawTime, ctx.timezone, ctx.dateOrder);
      if (!at) return fail(m.time ? "time" : "date", `Timestamp "${rawTime ?? ""}" couldn't be read. Check the date format setting.`);
      executions.push({
        row: n,
        accountId,
        contract,
        instrumentId: inst.id,
        symbol: inst.symbol,
        side,
        quantity: qty,
        price,
        executedAt: at.toISOString(),
        sequence: n,
        commission: round2(Math.abs(commission ?? 0)),
        otherFees: round2(Math.abs(otherFees ?? 0)),
        feesProvided,
        externalId,
        orderId: get(row, "orderId") != null ? String(get(row, "orderId")) : null,
      });
      return;
    }

    // ROUND_TRIPS
    const qtyRaw = parseNumber(get(row, "quantity"));
    if (qtyRaw == null || qtyRaw === 0) return fail("quantity", `Quantity "${get(row, "quantity") ?? ""}" isn't a number.`);
    const qty = Math.abs(qtyRaw);
    if (!Number.isInteger(qty)) return fail("quantity", `Quantity ${qty} must be a whole number of contracts.`);

    let direction: "LONG" | "SHORT" | null;
    let entryPrice: number | null;
    let exitPrice: number | null;
    let entryAt: Date | null;
    let exitAt: Date | null;
    const useExplicit = !!(m.entryPrice && m.exitPrice && m.entryTime && m.exitTime);
    if (useExplicit) {
      direction = parseDirection(get(row, "direction"));
      if (!direction) return fail("direction", `Direction "${get(row, "direction") ?? ""}" isn't recognised. Use Long/Short.`);
      entryPrice = parseNumber(get(row, "entryPrice"));
      exitPrice = parseNumber(get(row, "exitPrice"));
      entryAt = parseDateTime(get(row, "entryTime"), ctx.timezone, ctx.dateOrder);
      exitAt = parseDateTime(get(row, "exitTime"), ctx.timezone, ctx.dateOrder);
    } else {
      const buyPrice = parseNumber(get(row, "buyPrice"));
      const sellPrice = parseNumber(get(row, "sellPrice"));
      const buyAt = parseDateTime(get(row, "buyTime"), ctx.timezone, ctx.dateOrder);
      const sellAt = parseDateTime(get(row, "sellTime"), ctx.timezone, ctx.dateOrder);
      if (!buyAt) return fail("buyTime", `Buy time "${get(row, "buyTime") ?? ""}" couldn't be read.`);
      if (!sellAt) return fail("sellTime", `Sell time "${get(row, "sellTime") ?? ""}" couldn't be read.`);
      direction = buyAt.getTime() <= sellAt.getTime() ? "LONG" : "SHORT";
      entryPrice = direction === "LONG" ? buyPrice : sellPrice;
      exitPrice = direction === "LONG" ? sellPrice : buyPrice;
      entryAt = direction === "LONG" ? buyAt : sellAt;
      exitAt = direction === "LONG" ? sellAt : buyAt;
    }
    if (entryPrice == null || entryPrice <= 0) return fail("entryPrice", "Entry price is missing or invalid.");
    if (exitPrice == null || exitPrice <= 0) return fail("exitPrice", "Exit price is missing or invalid.");
    if (!entryAt) return fail("entryTime", "Entry time couldn't be read. Check the date format setting.");
    if (!exitAt) return fail("exitTime", "Exit time couldn't be read. Check the date format setting.");
    if (exitAt < entryAt) return fail("exitTime", "Exit time is before entry time.");

    // Optional verification against the file's own P&L
    const filePnl = parseNumber(get(row, "pnl"));
    if (filePnl != null) {
      const gross = ((exitPrice - entryPrice) / inst.tickSize) * inst.tickValue * qty * (direction === "LONG" ? 1 : -1);
      const netCalc = gross - Math.abs(commission ?? 0) - Math.abs(otherFees ?? 0);
      if (Math.abs(gross - filePnl) > 1 && Math.abs(netCalc - filePnl) > 1) {
        warnings.push({
          row: n,
          field: "pnl",
          message: `File P&L ${filePnl.toFixed(2)} differs from calculated ${gross.toFixed(2)} for ${inst.symbol}. Check the instrument's tick value.`,
        });
      }
    }

    const half = (v: number | null) => round2(Math.abs(v ?? 0) / 2);
    const base = {
      row: n,
      accountId,
      contract,
      instrumentId: inst.id,
      symbol: inst.symbol,
      quantity: qty,
      feesProvided,
      orderId: null,
    };
    const entrySide = direction === "LONG" ? "BUY" : "SELL";
    const exitSide = direction === "LONG" ? "SELL" : "BUY";
    const cEntry = half(commission);
    const fEntry = half(otherFees);
    executions.push(
      {
        ...base,
        side: entrySide,
        price: entryPrice,
        executedAt: entryAt.toISOString(),
        sequence: n * 2,
        commission: cEntry,
        otherFees: fEntry,
        externalId: externalId ? `${externalId}:entry` : null,
      },
      {
        ...base,
        side: exitSide,
        price: exitPrice,
        executedAt: exitAt.toISOString(),
        sequence: n * 2 + 1,
        commission: round2(Math.abs(commission ?? 0) - cEntry),
        otherFees: round2(Math.abs(otherFees ?? 0) - fEntry),
        externalId: externalId ? `${externalId}:exit` : null,
      },
    );
  });

  for (const [sym, count] of unknownInstruments) {
    errors.push({
      row: 0,
      field: "contract",
      message: `Unknown instrument "${sym}" (${count} row${count > 1 ? "s" : ""}). Add it under Settings → Instruments, then re-run the preview.`,
    });
  }
  for (const [acct, count] of unknownAccounts) {
    errors.push({
      row: 0,
      field: "account",
      message: `No account matches "${acct}" (${count} row${count > 1 ? "s" : ""}). Set that account's "Broker account ID" to ${acct}, or unmap the Account column to import everything into the selected account.`,
    });
  }

  return { executions, errors, warnings, invalidRows: invalid.size, totalRows: rows.length };
}
