#!/usr/bin/env node
"use strict";
/* M7 (Phase 10 security + resource bounding) — research-budget battery. Proves per-grant egress QUOTA gating
 * (calls + bytes), boundary correctness, fail-closed on corrupt usage, the unbounded-grant security signal, and the
 * MONOTONIC composition with M4 govern() — a govern() DENY is NEVER loosened by any budget; an ALLOW is downgraded to
 * DENY when the quota is exhausted. Composes REAL M4 govern() and M6 research-ledger usage. Holds NO egress authority. */
const B = require("./research-budget.js");
const GOV = require("./research-governor.js");
const LED = require("./research-ledger.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const NOW = Date.parse("2026-11-11T00:00:00Z");
const REQ = { query: "q", urls: ["https://example.com/a"] };
const G = (extra: any = {}) => ({ authorized: true, allowedDomains: ["example.com"], expiresMs: NOW + 100000, ...extra });
const GB = G({ budget: { maxCalls: 3, maxBytes: 1000 } });

function main() {
  // 1. no budget declared ⇒ ok but UNBOUNDED surfaced (security signal, not silent permit)
  const nb = B.withinBudget(G(), { calls: 10 }, {});
  check("no declared budget ⇒ ok + unbounded:true (surfaced), remaining null", nb.ok === true && nb.unbounded === true && nb.remaining.calls === null);

  // 2. under budget ⇒ ok + remaining
  const u1 = B.withinBudget(GB, { calls: 1, bytes: 100 }, {});
  check("under budget ⇒ ok, remaining calls 2 / bytes 900", u1.ok === true && u1.remaining.calls === 2 && u1.remaining.bytes === 900);

  // 3. boundary: the LAST allowed call (usage 2, max 3) ⇒ ok
  check("boundary: usage 2 of max 3 ⇒ this (3rd) call ok", B.withinBudget(GB, { calls: 2 }, {}).ok === true);
  // 4. exhausted: usage == maxCalls ⇒ next call DENIED
  const ex = B.withinBudget(GB, { calls: 3 }, {});
  check("usage 3 of max 3 ⇒ QUOTA_CALLS_EXHAUSTED", ex.ok === false && ex.reasons.includes("QUOTA_CALLS_EXHAUSTED"));

  // 5. bytes: next call's bytes would overflow ⇒ DENY
  check("bytes overflow ⇒ QUOTA_BYTES_EXHAUSTED", B.withinBudget(GB, { calls: 0, bytes: 900 }, { bytes: 200 }).reasons.includes("QUOTA_BYTES_EXHAUSTED"));
  // 6. bytes boundary: exactly at max ⇒ ok
  check("bytes boundary: 800 + 200 == max 1000 ⇒ ok", B.withinBudget(GB, { calls: 0, bytes: 800 }, { bytes: 200 }).ok === true);

  // 7/8. corrupt usage (negative / non-object) with a declared budget ⇒ fail-closed USAGE_CORRUPT
  check("negative usage + declared budget ⇒ USAGE_CORRUPT (fail-closed)", (() => { const r = B.withinBudget(GB, { calls: -5 }, {}); return r.ok === false && r.reasons.includes("USAGE_CORRUPT"); })());
  check("non-object usage + declared budget ⇒ USAGE_CORRUPT (fail-closed)", (() => { const r = B.withinBudget(GB, "nope", {}); return r.ok === false && r.reasons.includes("USAGE_CORRUPT"); })());

  // 9. zero-call grant ⇒ always exhausted (even with zero usage)
  check("maxCalls:0 ⇒ zero-call grant always exhausted", B.withinBudget(G({ budget: { maxCalls: 0 } }), { calls: 0 }, {}).ok === false);
  // 10. remaining never negative
  check("remaining never negative (usage 5 > max 3 ⇒ remaining 0)", B.withinBudget(GB, { calls: 5 }, {}).remaining.calls === 0);

  // 11. governWithBudget: ALLOW grant + under budget ⇒ ALLOW (+ budget view)
  const gaOK = B.governWithBudget(REQ, GB, NOW, { calls: 1 }, {});
  check("govern ALLOW + under budget ⇒ ALLOW", gaOK.decision === "ALLOW" && gaOK.budget.ok === true);
  // 12. governWithBudget: ALLOW grant + exhausted ⇒ DOWNGRADE to DENY (QUOTA_*)
  const gaEx = B.governWithBudget(REQ, GB, NOW, { calls: 3 }, {});
  check("govern ALLOW + exhausted ⇒ DOWNGRADED DENY QUOTA_CALLS_EXHAUSTED", gaEx.decision === "DENY" && gaEx.reasons.includes("QUOTA_CALLS_EXHAUSTED"));

  // 13. MONOTONIC (adversarial): a govern DENY is NEVER loosened — even with an enormous budget
  const noGrant = B.governWithBudget(REQ, { budget: { maxCalls: 1e9 } }, NOW, { calls: 0 }, {});
  check("no grant + huge budget ⇒ still DENY (budget never rescues a DENY)", noGrant.decision === "DENY" && noGrant.reasons.includes("EGRESS_NOT_AUTHORIZED"));
  // 14. MONOTONIC: expired grant + huge budget ⇒ still DENY GRANT_EXPIRED
  const expired = B.governWithBudget(REQ, G({ expiresMs: NOW - 1, budget: { maxCalls: 1e9 } }), NOW, { calls: 0 }, {});
  check("expired grant + huge budget ⇒ still DENY GRANT_EXPIRED (monotonic)", expired.decision === "DENY" && expired.reasons.includes("GRANT_EXPIRED"));

  // 15. compose REAL M6 ledger usage ⇒ 2 ALLOW decisions recorded ⇒ derived usage calls=2 ⇒ fits max 3
  let led = LED.emptyLedger();
  const allowRes = GOV.govern(REQ, G(), NOW);
  led = LED.recordDecision(led, allowRes, {}).ledger;
  led = LED.recordDecision(led, allowRes, {}).ledger;
  const usage = B.usageFromLedgerSummary(LED.summarize(led));
  check("usage derived from M6 ledger summary (allow=2) ⇒ calls 2, fits max 3", usage.calls === 2 && B.withinBudget(GB, usage, {}).ok === true);

  // 16. unbounded grant via governWithBudget ⇒ ALLOW but budget.unbounded surfaced
  const unb = B.governWithBudget(REQ, G(), NOW, { calls: 999 }, {});
  check("unbounded grant ⇒ ALLOW with budget.unbounded:true (security signal surfaced)", unb.decision === "ALLOW" && unb.budget.unbounded === true);

  // 17. frozen outputs
  check("outputs frozen (withinBudget + governWithBudget + nested)", Object.isFrozen(u1) && Object.isFrozen(u1.remaining) && Object.isFrozen(gaOK) && Object.isFrozen(gaEx.reasons));
  // 18. deterministic
  check("deterministic", JSON.stringify(B.governWithBudget(REQ, GB, NOW, { calls: 1 }, {})) === JSON.stringify(B.governWithBudget(REQ, GB, NOW, { calls: 1 }, {})));

  // ===== Regression locks for independent-validator findings (symmetric fail-closed) =====
  // R1: a PRESENT-but-corrupt req.bytes (Infinity/NaN/negative/string) no longer passes as a 0-byte call — fail-closed
  for (const badBytes of [Infinity, NaN, -100, "500"]) {
    const r = B.withinBudget(GB, { calls: 0, bytes: 0 }, { bytes: badBytes as any });
    check(`R1: corrupt req.bytes (${String(badBytes)}) ⇒ REQ_BYTES_INVALID (fail-closed, no byte-gate bypass)`, r.ok === false && r.reasons.includes("REQ_BYTES_INVALID"));
  }
  // R2: a corrupt/typo'd budget cap no longer silently becomes unbounded — fail-closed BUDGET_INVALID
  for (const bc of [{ maxCalls: "3" }, { maxCalls: Infinity }, { maxCalls: NaN }, { maxBytes: -1 }]) {
    const r = B.withinBudget(G({ budget: bc as any }), { calls: 999 }, {});
    check(`R2: corrupt budget ${JSON.stringify(bc)} ⇒ BUDGET_INVALID (not unbounded)`, r.ok === false && r.declared === true && r.unbounded === false && r.reasons.includes("BUDGET_INVALID"));
  }
  // R3: maxBytes:0 is a HARD block (like maxCalls:0), even for a 0-byte call
  check("R3: maxBytes:0 ⇒ hard block (QUOTA_BYTES_EXHAUSTED even for a 0-byte call)", B.withinBudget(G({ budget: { maxBytes: 0 } }), { calls: 0, bytes: 0 }, {}).ok === false);
  // R4: a throwing getter on usage must NOT throw out of the gate — fail-closed DENY; a govern DENY stays DENY
  const evilUsage: any = {}; Object.defineProperty(evilUsage, "calls", { get() { throw new Error("boom"); }, enumerable: true });
  let threw = false; let wb: any;
  try { wb = B.withinBudget(GB, evilUsage, {}); } catch { threw = true; }
  check("R4a: throwing usage getter ⇒ withinBudget does not throw, fails closed (ok:false)", threw === false && wb && wb.ok === false);
  const gwbEvil = B.governWithBudget(REQ, GB, NOW, evilUsage, {});
  check("R4b: throwing usage on an ALLOW grant ⇒ governWithBudget DENY (no throw, monotonic)", gwbEvil.decision === "DENY");
  const gwbEvilDeny = B.governWithBudget(REQ, {}, NOW, evilUsage, {});   // no grant ⇒ govern DENY regardless of usage
  check("R4c: throwing usage + govern DENY ⇒ still DENY (budget never consulted on a DENY)", gwbEvilDeny.decision === "DENY" && gwbEvilDeny.reasons.includes("EGRESS_NOT_AUTHORIZED"));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — research-budget M7 (fail-closed per-grant egress quota; MONOTONIC with govern — never loosens a DENY; no egress authority)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
