/**
 * financial-reconciliation — PURE cross-metric financial validator (FINANCIAL_CALC_HARDENING_V1, Lot B).
 * Enforces that the commercial pipeline stages are NEVER summed as independent revenue (anti-double-count) and
 * reconciles them honestly. REUSES `economic-unit` as the money primitive (exact integer minor units; same-unit
 * add/sub/compare; `requireSameUnit` catches incompatible currencies — no implicit FX). No new money abstraction.
 *
 * Stages are lifecycle steps of the SAME transaction: pipeline (unsigned) · signed · invoiced · collected · costs.
 * Rules: collected≤invoiced≤signed is VALID (partial ok); collected>invoiced ⇒ AMBIGUOUS if credits allowed else
 * INCONSISTENT; invoiced>signed ⇒ AMBIGUOUS if scope-change allowed else INCONSISTENT; pipeline never ordered nor
 * summed with realized stages; duplicate txn id ⇒ DUPLICATE; missing operand ⇒ INCOMPLETE (unknown ≠ 0); unit
 * mismatch ⇒ INCONSISTENT. margin = (invoiced||signed) − costs (exact). Fabricates no amount; explains every verdict.
 */
const EU = require("./economic-unit");

function isQ(q: any): boolean { return EU.isQuantity(q); }
function cmp(a: any, b: any): any {
  if (!isQ(a) || !isQ(b)) return { ok: false, reason: "operand missing or not a Quantity" };
  try { return { ok: true, cmp: EU.compare(a, b) }; }
  catch (e: any) { return { ok: false, reason: String(e.message || e) }; }
}

function revenueFor(stages: any, basis: any): any {
  const s = stages && typeof stages === "object" ? stages : {};
  const allowed: any = { collected: "collected (cash)", signed: "signed (committed)", invoiced: "invoiced (billed)" };
  if (!allowed[basis]) {
    return { ok: false, reason: `revenue basis must be one of collected|signed|invoiced — summing stages double-counts the same transaction` };
  }
  const q = s[basis];
  if (!isQ(q)) return { ok: false, reason: `no ${basis} amount available (unknown ≠ 0)` };
  return { ok: true, basis, amount: q, formatted: EU.format(q) };
}

function duplicateTxnIds(txns: any): any[] {
  const seen = new Set(), dups = new Set();
  for (const t of Array.isArray(txns) ? txns : []) {
    const id = t && t.id;
    if (id === undefined || id === null || id === "") continue;
    if (seen.has(id)) dups.add(id); else seen.add(id);
  }
  return [...dups];
}

function reconcile(stages: any, opts: any): any {
  const s = stages && typeof stages === "object" ? stages : {};
  const o = opts && typeof opts === "object" ? opts : {};
  const checks: any[] = [];
  const add = (name: string, status: string, reason: string) => checks.push({ name, status, reason });

  const rel: any[] = [
    ["collected≤invoiced", s.collected, s.invoiced, o.creditsAllowed, "credits/overpayment"],
    ["invoiced≤signed", s.invoiced, s.signed, o.scopeChangeAllowed, "scope change"],
  ];
  for (const [name, lo, hi, excAllowed, excLabel] of rel) {
    if (lo === undefined && hi === undefined) { add(name, "INCOMPLETE", "both operands absent"); continue; }
    if (!isQ(lo) || !isQ(hi)) { add(name, "INCOMPLETE", "missing operand (unknown ≠ 0)"); continue; }
    const c = cmp(lo, hi);
    if (!c.ok) { add(name, "INCONSISTENT", c.reason); continue; }
    if (c.cmp <= 0) add(name, "VALID", "within expected order (partial is allowed)");
    else add(name, excAllowed ? "AMBIGUOUS" : "INCONSISTENT", excAllowed ? `${name.split("≤")[0]} exceeds ${name.split("≤")[1]} — explainable by ${excLabel}` : `${name.split("≤")[0]} exceeds ${name.split("≤")[1]} without an allowed explanation`);
  }

  const base = isQ(s.invoiced) ? s.invoiced : (isQ(s.signed) ? s.signed : null);
  if (!base || !isQ(s.costs)) add("margin", "INCOMPLETE", "need (invoiced|signed) + costs as Quantities");
  else {
    try { const m = EU.sub(base, s.costs); add("margin", "VALID", `margin = ${EU.format(m)}${m.minor < 0 ? " (NEGATIVE — loss, reported not hidden)" : ""}`); }
    catch (e: any) { add("margin", "INCONSISTENT", String(e.message || e)); }
  }

  add("no-cross-stage-sum", "VALID", "stages are lifecycle steps of one transaction; summing them is refused (use revenueFor)");

  const dups = duplicateTxnIds(o.txns);
  if (dups.length) add("duplicate-transactions", "DUPLICATE", `duplicate transaction id(s): ${dups.join(", ")}`);

  const has = (st: string) => checks.some((c) => c.status === st);
  const verdict = has("DUPLICATE") ? "DUPLICATE" : has("INCONSISTENT") ? "INCONSISTENT" : has("AMBIGUOUS") ? "AMBIGUOUS" : has("INCOMPLETE") ? "INCOMPLETE" : "OK";
  const counts = checks.reduce((m: any, c: any) => { m[c.status] = (m[c.status] || 0) + 1; return m; }, {});
  return { verdict, checks, counts, duplicates: dups };
}

module.exports = { reconcile, revenueFor, duplicateTxnIds };
export {};
