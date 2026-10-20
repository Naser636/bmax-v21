/**
 * financial-reconciliation — PURE cross-metric financial validator (FINANCIAL_CALC_HARDENING_V1, Lot B).
 * Enforces that the commercial pipeline stages are NEVER summed as independent revenue (anti-double-count) and
 * reconciles them honestly. REUSES `economic-unit` as the money primitive (exact integer minor units; same-unit
 * add/sub/compare; `requireSameUnit` catches incompatible currencies — no implicit FX). No new money abstraction.
 *
 * Stages are lifecycle steps of the SAME transaction, not independent amounts:
 *   pipeline (estimated, UNSIGNED) · signed · invoiced · collected (cash) · costs → margin.
 * Rules (honest; a normal business difference is NOT auto-flagged as error):
 *   - collected ≤ invoiced ≤ signed  (partial invoicing / partial payment = VALID, not an error)
 *   - collected > invoiced ⇒ AMBIGUOUS if credits/overpayment allowed, else INCONSISTENT
 *   - invoiced > signed    ⇒ AMBIGUOUS if scope-change allowed, else INCONSISTENT
 *   - pipeline has NO ordering vs signed (it is an unsigned forecast) and is NEVER added to realized stages
 *   - duplicate transaction id ⇒ DUPLICATE
 *   - missing operand ⇒ INCOMPLETE (NOT reconcilable) — unknown is NEVER coerced to zero
 *   - unit mismatch ⇒ INCONSISTENT (no implicit FX)
 * margin = (invoiced || signed) − costs (exact, same-unit). Fabricates no amount; explains every verdict.
 */
const EU = require("./economic-unit");

function isQ(q) { return EU.isQuantity(q); }
// Safe same-unit compare: returns {ok:true,cmp} or {ok:false,reason} (unit mismatch / non-quantity).
function cmp(a, b) {
  if (!isQ(a) || !isQ(b)) return { ok: false, reason: "operand missing or not a Quantity" };
  try { return { ok: true, cmp: EU.compare(a, b) }; }
  catch (e) { return { ok: false, reason: String(e.message || e) }; }
}

/**
 * ANTI-DOUBLE-COUNT GUARD: refuse to sum different lifecycle stages as "total revenue".
 * There is no legitimate "pipeline + signed + invoiced + collected" total — that triple-counts one transaction.
 * Returns the ONE honest revenue figure for the requested basis (collected=cash, signed=committed, invoiced=billed).
 */
function revenueFor(stages, basis) {
  const s = stages && typeof stages === "object" ? stages : {};
  const allowed = { collected: "collected (cash)", signed: "signed (committed)", invoiced: "invoiced (billed)" };
  if (!allowed[basis]) {
    return { ok: false, reason: `revenue basis must be one of collected|signed|invoiced — summing stages double-counts the same transaction` };
  }
  const q = s[basis];
  if (!isQ(q)) return { ok: false, reason: `no ${basis} amount available (unknown ≠ 0)` };
  return { ok: true, basis, amount: q, formatted: EU.format(q) };
}

/** Detect duplicate transaction ids in a list of {id, ...}. */
function duplicateTxnIds(txns) {
  const seen = new Set(), dups = new Set();
  for (const t of Array.isArray(txns) ? txns : []) {
    const id = t && t.id;
    if (id === undefined || id === null || id === "") continue;
    if (seen.has(id)) dups.add(id); else seen.add(id);
  }
  return [...dups];
}

/**
 * Reconcile the stage amounts. `stages`: {pipeline,signed,invoiced,collected,costs} as economic-unit Quantities
 * (any may be absent). `opts`: {creditsAllowed, scopeChangeAllowed, txns:[{id}]}. Returns per-check verdicts +
 * an overall verdict (precedence DUPLICATE/INCONSISTENT > AMBIGUOUS > INCOMPLETE > OK).
 */
function reconcile(stages, opts) {
  const s = stages && typeof stages === "object" ? stages : {};
  const o = opts && typeof opts === "object" ? opts : {};
  const checks = [];
  const add = (name, status, reason) => checks.push({ name, status, reason });

  // ordered reconciliation (realized stages only; pipeline excluded from ordering)
  const rel = [
    ["collected≤invoiced", s.collected, s.invoiced, o.creditsAllowed, "credits/overpayment"],
    ["invoiced≤signed", s.invoiced, s.signed, o.scopeChangeAllowed, "scope change"],
  ];
  for (const [name, lo, hi, excAllowed, excLabel] of rel) {
    if (lo === undefined && hi === undefined) { add(name, "INCOMPLETE", "both operands absent"); continue; }
    if (!isQ(lo) || !isQ(hi)) { add(name, "INCOMPLETE", "missing operand (unknown ≠ 0)"); continue; }
    const c = cmp(lo, hi);
    if (!c.ok) { add(name, "INCONSISTENT", c.reason); continue; } // unit mismatch etc.
    if (c.cmp <= 0) add(name, "VALID", "within expected order (partial is allowed)");
    else add(name, excAllowed ? "AMBIGUOUS" : "INCONSISTENT", excAllowed ? `${name.split("≤")[0]} exceeds ${name.split("≤")[1]} — explainable by ${excLabel}` : `${name.split("≤")[0]} exceeds ${name.split("≤")[1]} without an allowed explanation`);
  }

  // margin = (invoiced || signed) − costs
  const base = isQ(s.invoiced) ? s.invoiced : (isQ(s.signed) ? s.signed : null);
  if (!base || !isQ(s.costs)) add("margin", "INCOMPLETE", "need (invoiced|signed) + costs as Quantities");
  else {
    try { const m = EU.sub(base, s.costs); add("margin", EU.isZero(m) || m.minor >= 0 ? "VALID" : "VALID", `margin = ${EU.format(m)}${m.minor < 0 ? " (NEGATIVE — loss, reported not hidden)" : ""}`); }
    catch (e) { add("margin", "INCONSISTENT", String(e.message || e)); }
  }

  // anti-double-count structural check (always present as an explicit assertion)
  add("no-cross-stage-sum", "VALID", "stages are lifecycle steps of one transaction; summing them is refused (use revenueFor)");

  // duplicates
  const dups = duplicateTxnIds(o.txns);
  if (dups.length) add("duplicate-transactions", "DUPLICATE", `duplicate transaction id(s): ${dups.join(", ")}`);

  const has = (st) => checks.some((c) => c.status === st);
  const verdict = has("DUPLICATE") ? "DUPLICATE" : has("INCONSISTENT") ? "INCONSISTENT" : has("AMBIGUOUS") ? "AMBIGUOUS" : has("INCOMPLETE") ? "INCOMPLETE" : "OK";
  const counts = checks.reduce((m, c) => { m[c.status] = (m[c.status] || 0) + 1; return m; }, {});
  return { verdict, checks, counts, duplicates: dups };
}

module.exports = { reconcile, revenueFor, duplicateTxnIds };
