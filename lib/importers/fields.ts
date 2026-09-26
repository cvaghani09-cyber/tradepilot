export type RowKind = "EXECUTIONS" | "ROUND_TRIPS";

export type FieldDef = { key: string; label: string; required?: boolean; hint?: string; synonyms: string[] };

const common: FieldDef[] = [
  { key: "account", label: "Account", hint: "Optional — routes rows to accounts by account number or name", synonyms: ["account", "accountid", "account id", "account name", "acct", "account number", "accountnumber"] },
  { key: "contract", label: "Symbol / contract", required: true, synonyms: ["symbol", "contract", "instrument", "product", "ticker", "contract name", "market", "sym"] },
  { key: "commission", label: "Commission", synonyms: ["commission", "commissions", "comm", "brokerage"] },
  { key: "fees", label: "Other fees", hint: "Exchange / clearing / NFA fees combined", synonyms: ["fees", "fee", "exchange fees", "exchange fee", "total fees", "other fees", "clearing fees", "reg fees"] },
  { key: "externalId", label: "Execution / fill ID", hint: "Improves duplicate detection", synonyms: ["fill id", "fillid", "execution id", "executionid", "exec id", "trade id", "tradeid", "id", "transaction id", "deal id"] },
];

export const EXECUTION_FIELDS: FieldDef[] = [
  ...common.slice(0, 2),
  { key: "side", label: "Side (Buy/Sell)", hint: "Optional if quantity is signed", synonyms: ["side", "b/s", "buy/sell", "action", "direction", "type", "bs", "buysell", "order side"] },
  { key: "quantity", label: "Quantity", required: true, synonyms: ["qty", "quantity", "filled qty", "filledqty", "fill qty", "size", "contracts", "shares", "lots", "filled"] },
  { key: "price", label: "Fill price", required: true, synonyms: ["price", "fill price", "avg price", "avgprice", "avg fill price", "execution price", "exec price", "filled price", "avgfillprice"] },
  { key: "time", label: "Timestamp", hint: "Or map separate date + time columns", synonyms: ["timestamp", "time", "fill time", "filltime", "date/time", "datetime", "execution time", "exec time", "transaction time", "trade time", "date time"] },
  { key: "date", label: "Date (if separate)", synonyms: ["date", "trade date", "fill date"] },
  { key: "timeOfDay", label: "Time (if separate)", synonyms: ["time of day"] },
  { key: "orderId", label: "Order ID", synonyms: ["order id", "orderid", "order #", "order number"] },
  ...common.slice(2),
];

export const ROUND_TRIP_FIELDS: FieldDef[] = [
  ...common.slice(0, 2),
  { key: "direction", label: "Direction (Long/Short)", hint: "Not needed when using buy/sell columns", synonyms: ["direction", "side", "long/short", "position", "type"] },
  { key: "quantity", label: "Quantity", required: true, synonyms: ["qty", "quantity", "size", "contracts", "lots"] },
  { key: "entryPrice", label: "Entry price", synonyms: ["entry price", "entryprice", "open price", "entry", "avg entry"] },
  { key: "exitPrice", label: "Exit price", synonyms: ["exit price", "exitprice", "close price", "exit", "avg exit"] },
  { key: "entryTime", label: "Entry time", synonyms: ["entry time", "entrytime", "open time", "opened", "entry date", "open date"] },
  { key: "exitTime", label: "Exit time", synonyms: ["exit time", "exittime", "close time", "closed", "exit date", "close date"] },
  { key: "buyPrice", label: "Buy price", synonyms: ["buy price", "buyprice", "bought price"] },
  { key: "sellPrice", label: "Sell price", synonyms: ["sell price", "sellprice", "sold price"] },
  { key: "buyTime", label: "Buy time", synonyms: ["bought timestamp", "boughttimestamp", "buy time", "buytime", "bought time"] },
  { key: "sellTime", label: "Sell time", synonyms: ["sold timestamp", "soldtimestamp", "sell time", "selltime", "sold time"] },
  { key: "pnl", label: "P&L (for verification)", hint: "Not imported — used to flag instrument spec mismatches", synonyms: ["pnl", "p&l", "p/l", "profit", "net pnl", "realized pnl", "profit/loss", "gross pnl"] },
  ...common.slice(2),
];

export function fieldsFor(kind: RowKind) {
  return kind === "EXECUTIONS" ? EXECUTION_FIELDS : ROUND_TRIP_FIELDS;
}

const norm = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

/** Guess whether a header row describes fills or completed round trips. */
export function detectRowKind(headers: string[]): RowKind {
  const h = headers.map(norm);
  const has = (...names: string[]) => names.some((n) => h.includes(n));
  const roundTrip =
    (has("entry price", "entryprice", "open price") && has("exit price", "exitprice", "close price")) ||
    (has("buy price", "buyprice") && has("sell price", "sellprice")) ||
    has("boughttimestamp", "bought timestamp");
  return roundTrip ? "ROUND_TRIPS" : "EXECUTIONS";
}

/** Auto-map CSV headers to fields by synonym (exact first, then contains). */
export function detectMapping(headers: string[], kind: RowKind): Record<string, string | null> {
  const fields = fieldsFor(kind);
  const used = new Set<string>();
  const mapping: Record<string, string | null> = {};
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const pass of ["exact", "contains"] as const) {
    for (const f of fields) {
      if (mapping[f.key]) continue;
      const hit = normalized.find(
        (h) =>
          !used.has(h.raw) &&
          f.synonyms.some((syn) => (pass === "exact" ? h.n === syn : h.n.includes(syn) && syn.length >= 4)),
      );
      if (hit) {
        mapping[f.key] = hit.raw;
        used.add(hit.raw);
      }
    }
  }
  for (const f of fields) mapping[f.key] ??= null;
  // A lone "date" column that's really a full timestamp: leave to validation
  return mapping;
}

export function missingRequired(mapping: Record<string, string | null>, kind: RowKind): string[] {
  const missing = fieldsFor(kind)
    .filter((f) => f.required && !mapping[f.key])
    .map((f) => f.label);
  if (kind === "EXECUTIONS") {
    if (!mapping.time && !mapping.date) missing.push("Timestamp (or Date)");
  } else {
    const explicit = mapping.entryPrice && mapping.exitPrice && mapping.entryTime && mapping.exitTime;
    const buySell = mapping.buyPrice && mapping.sellPrice && mapping.buyTime && mapping.sellTime;
    if (!explicit && !buySell) missing.push("Entry/exit price + time (or buy/sell price + time)");
    if (explicit && !buySell && !mapping.direction) missing.push("Direction");
  }
  return missing;
}
