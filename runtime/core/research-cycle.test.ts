#!/usr/bin/env node
"use strict";
/* M9 (Phase 10 operational facade) — research-cycle battery. The centerpiece: USAGE ACCRUAL closes the budget loop —
 * a per-grant quota that could never deplete across the isolated gates now genuinely bites after N allowed steps.
 * Also proves: decisions recorded in the ledger (M6), monotonic DENY (inherited M7), fail-closed on corrupt input,
 * DENY accrues nothing, finding dedup passthrough, frozen+deterministic. Composes REAL M4/M6/M7. No egress authority. */
const R = require("./research-cycle.js");
const GOV = require("./research-governor.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const NOW = Date.parse("2026-11-11T00:00:00Z");
const REQ = { query: "q", urls: ["https://example.com/a"] };
const G = (extra: any = {}) => ({ authorized: true, allowedDomains: ["example.com"], expiresMs: NOW + 100000, ...extra });

function main() {
  // 1. DENY (no grant) ⇒ decision DENY, usage unchanged, recorded in ledger
  const d1 = R.runResearchStep({ request: REQ, grant: {}, nowMs: NOW, usage: { calls: 0, bytes: 0 } });
  check("no grant ⇒ DENY, nextUsage unchanged, recorded", d1.decision === "DENY" && d1.nextUsage.calls === 0 && d1.recorded === true && R.summary(d1.ledger).decisions.deny === 1);

  // 2. ALLOW (valid grant, no budget) ⇒ usage accrues +1, recorded ALLOW
  const a1 = R.runResearchStep({ request: REQ, grant: G(), nowMs: NOW, usage: { calls: 0, bytes: 0 } });
  check("valid grant ⇒ ALLOW, usage accrues to calls:1, recorded", a1.decision === "ALLOW" && a1.nextUsage.calls === 1 && R.summary(a1.ledger).decisions.allow === 1);

  // 3. ** THE OPERATIONAL PROOF ** — usage accrual makes the budget DEPLETE across a loop (quota bites after 2 allowed)
  let usage: any = { calls: 0, bytes: 0 }; let ledger: any; const gb = G({ budget: { maxCalls: 2 } });
  const s1 = R.runResearchStep({ request: REQ, grant: gb, nowMs: NOW, usage, ledger, respBytes: 10 }); usage = s1.nextUsage; ledger = s1.ledger;
  const s2 = R.runResearchStep({ request: REQ, grant: gb, nowMs: NOW, usage, ledger, respBytes: 10 }); usage = s2.nextUsage; ledger = s2.ledger;
  const s3 = R.runResearchStep({ request: REQ, grant: gb, nowMs: NOW, usage, ledger, respBytes: 10 }); ledger = s3.ledger;
  check("budget LOOP CLOSES: ALLOW, ALLOW, then DENY QUOTA_CALLS_EXHAUSTED (accrual makes the quota bite)", s1.decision === "ALLOW" && s2.decision === "ALLOW" && s3.decision === "DENY" && s3.reasons.includes("QUOTA_CALLS_EXHAUSTED"));
  check("usage accrued across the loop (1 then 2)", s1.nextUsage.calls === 1 && s2.nextUsage.calls === 2);
  check("ledger threaded across the loop ⇒ allow 2, deny 1", (() => { const s = R.summary(ledger); return s.decisions.allow === 2 && s.decisions.deny === 1; })());

  // 4. bytes accrual on ALLOW
  const b1 = R.runResearchStep({ request: REQ, grant: G(), nowMs: NOW, usage: { calls: 1, bytes: 500 }, respBytes: 100 });
  check("bytes accrue on ALLOW (500 + 100 = 600)", b1.nextUsage.bytes === 600 && b1.nextUsage.calls === 2);

  // 5. DENY accrues NOTHING (a refused call consumes no quota)
  const d5 = R.runResearchStep({ request: { urls: ["https://evil.com/x"] }, grant: G(), nowMs: NOW, usage: { calls: 3, bytes: 50 }, respBytes: 100 });
  check("DENY consumes no quota (nextUsage == input usage)", d5.decision === "DENY" && d5.nextUsage.calls === 3 && d5.nextUsage.bytes === 50);

  // 6. MONOTONIC (inherited M7): expired grant + huge budget ⇒ still DENY, no accrual
  const m6 = R.runResearchStep({ request: REQ, grant: G({ expiresMs: NOW - 1, budget: { maxCalls: 1e9 } }), nowMs: NOW, usage: { calls: 0, bytes: 0 } });
  check("expired grant + huge budget ⇒ DENY (monotonic), no accrual", m6.decision === "DENY" && m6.reasons.includes("GRANT_EXPIRED") && m6.nextUsage.calls === 0);

  // 7. fail-closed on corrupt usage with a declared budget ⇒ DENY
  const c7 = R.runResearchStep({ request: REQ, grant: G({ budget: { maxCalls: 3 } }), nowMs: NOW, usage: { calls: -5, bytes: 0 } });
  check("corrupt usage + declared budget ⇒ DENY (fail-closed)", c7.decision === "DENY" && c7.reasons.includes("USAGE_CORRUPT"));

  // 8. recordFinding passthrough dedups (M6 anti-repeat)
  const f = GOV.stampFinding("price X", { url: "https://example.com/p", date: "2026-11-10", credibility: "HIGH" });
  let fl = R.recordFinding(undefined, f.finding, "t1").ledger;
  fl = R.recordFinding(fl, f.finding, "t2").ledger;
  const fs = R.summary(fl);
  check("recordFinding passthrough dedups (distinct 1, repeated 1)", fs.findings.distinct === 1 && fs.findings.repeated === 1);

  // 9. frozen outputs + nested
  check("outputs frozen (step + nextUsage + reasons)", Object.isFrozen(a1) && Object.isFrozen(a1.nextUsage) && Object.isFrozen(a1.reasons));

  // 10. deterministic
  const det = () => R.runResearchStep({ request: REQ, grant: gb, nowMs: NOW, usage: { calls: 0, bytes: 0 }, respBytes: 10 });
  check("deterministic (identical step ⇒ identical JSON)", JSON.stringify(det()) === JSON.stringify(det()));

  // 11. never throws on junk input
  let threw = false; try { R.runResearchStep("nonsense"); R.runResearchStep(); R.runResearchStep({ request: null, grant: null, nowMs: NaN }); } catch { threw = true; }
  check("never throws on junk input (fail-closed)", threw === false && R.runResearchStep("nonsense").decision === "DENY");

  // ===== Regression locks for independent-validator findings =====
  // RD1: a throwing getter on ANY input field ⇒ fail-closed DENY (STEP_EVAL_ERROR), never thrown
  let getterThrew = false; const results: any[] = [];
  for (const field of ["usage", "request", "grant", "nowMs", "respBytes", "at", "ledger"]) {
    const inp: any = { request: REQ, grant: G(), nowMs: NOW };
    Object.defineProperty(inp, field, { get() { throw new Error("boom-" + field); }, enumerable: true });
    try { results.push(R.runResearchStep(inp)); } catch { getterThrew = true; }
  }
  check("RD1: throwing getter on any input field ⇒ no throw, DENY STEP_EVAL_ERROR", getterThrew === false && results.length === 7 && results.every((r) => r.decision === "DENY" && r.reasons.includes("STEP_EVAL_ERROR")));
  // RD2: fractional usage / respBytes ⇒ nextUsage is always a non-negative INTEGER
  const fr = R.runResearchStep({ request: REQ, grant: G({ budget: { maxCalls: 10, maxBytes: 1000 } }), nowMs: NOW, usage: { calls: 1.5, bytes: 10.5 }, respBytes: 2.5 });
  check("RD2: fractional usage/respBytes ⇒ integer nextUsage (floored, never fractional)", fr.decision === "ALLOW" && Number.isInteger(fr.nextUsage.calls) && Number.isInteger(fr.nextUsage.bytes) && fr.nextUsage.calls === 2 && fr.nextUsage.bytes === 12);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — research-cycle M9 (usage-accrual closes the budget loop; records decisions; monotonic; fail-closed; no egress authority)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
