#!/usr/bin/env node
"use strict";

/*
 * WI-SCN-11 — ENGINEERING-CHAIN SCENARIO (§5). A reproducible, PURE, deterministic LOCAL harness that drives
 * ODG's governed engineering chain over a SYNTHETIC defect and REALLY COMPOSES the shipped modules
 * (discovery-engine to find the defect, cognitive-loop to carry the §16 cycle) — it is an integration/validation
 * capability, not a re-labelled demonstrator. It records the 11-step §5 path (discover → objective → mission →
 * contract → authorize → delegate → recover → verify → accept/refuse → evidence → next) and honours the
 * governed outcomes: ODG-authority refusal (ESCALATE), D4 consequential missions return GATED (owner boundary
 * SIMULATED, NEVER executed), provider error ⇒ FAILED, timeout ⇒ ABSTAINED (no false success), missing/non-
 * independent evidence ⇒ REFUSED. The cognitive-loop cycle it builds is append-only ⇒ an interrupted/gated run
 * leaves a RESUMABLE cycle with no lost decisions. Executes nothing real. Dual export (CJS + ESM export {}).
 */

const LOOP = require("./cognitive-loop");
const DISC = require("./discovery-engine");

function step(name: any, status: any, detail: any): any { return Object.freeze({ step: name, status, detail }); }

/**
 * runScenario(spec) — spec: { inventory:[...], authority?:"ODG"|..., consequential?:bool,
 *   provider?:{ name?, verifier?, result?, evidence?:[], inject?:"error"|"timeout"|"missing-evidence" } }
 * returns { verdict, steps:[...], cycle: snapshot, remaining, resumable }.
 */
function runScenario(spec: any): any {
  const s = spec && typeof spec === "object" ? spec : {};
  const trace: any[] = [];
  let cyc = LOOP.startCycle(typeof s.objective === "string" && s.objective ? s.objective : "engineering-chain-scenario", { cycleId: s.cycleId || "scn" });
  const adv = (toStage: any, append?: any, nextAction?: any): void => {
    const r = LOOP.advance(cyc, { toStage, expectedVersion: cyc.version, append: append || {}, nextAction });
    if (r.ok) cyc = r.cycle;
  };
  const done = (verdict: any, remaining: any): any => Object.freeze({ verdict, steps: Object.freeze(trace), cycle: LOOP.snapshot(cyc), remaining, resumable: LOOP.isResumable(cyc) });

  // 1) DISCOVER (real discovery-engine over the synthetic inventory)
  const disc = DISC.discover({ inventory: Array.isArray(s.inventory) ? s.inventory : [] });
  if (disc.summary.total === 0) { trace.push(step("discover", "NONE", "no defect/gap discovered in the inventory")); return done("NONE", 0); }
  const top = disc.findings[0];
  const remaining = disc.summary.total - 1;
  trace.push(step("discover", "OK", `${top.kind}:${top.subject} (${top.verdict})`));

  // 2) OBJECTIVE  3) MISSION  4) CONTRACT (carried on the cognitive-loop cycle)
  const objective = `close ${top.kind} on ${top.subject}`;
  adv("UNDERSTAND", { observations: [{ discovered: top.subject, kind: top.kind }] });
  trace.push(step("objective", "OK", objective));
  adv("RETRIEVE", { knowledge: [{ finding: top.kind }] });
  adv("DISCOVER", {});
  adv("REASON", { hypotheses: [{ contract: true }] });
  adv("PLAN", {});
  const authority = typeof s.authority === "string" ? s.authority : "NONE";
  trace.push(step("mission+contract", "OK", `writeSet=[${top.subject}] acceptance=[evidence-present,verify-passes] authority=${authority}`));

  // 5) AUTHORIZE (ODG governance)
  if (authority !== "ODG") { trace.push(step("authorize", "REFUSED", `authority '${authority}' ≠ ODG ⇒ ESCALATE_TO_HUMAN`)); return done("REFUSED", remaining); }
  if (s.consequential === true) { adv("ALLOCATE", { decisions: [{ authorized: true, boundary: "owner-gated" }] }); trace.push(step("authorize", "GATED", "consequential mission ⇒ owner-gated (D4); boundary SIMULATED, NOT executed")); return done("GATED", remaining); }
  const pv = s.provider && typeof s.provider === "object" ? s.provider : {};
  adv("ALLOCATE", { decisions: [{ authorized: true, provider: pv.name || "synthetic-provider" }] });
  trace.push(step("authorize", "OK", "ODG authorized within scope"));

  // 6) DELEGATE  7) RECOVER (synthetic provider; injectable failure modes)
  if (pv.inject === "error") { adv("EXECUTE", { errors: [{ providerError: true }] }); trace.push(step("delegate", "FAILED", "provider returned an error ⇒ not accepted")); return done("FAILED", remaining); }
  if (pv.inject === "timeout") { adv("EXECUTE", { errors: [{ timeout: true }] }); trace.push(step("delegate", "ABSTAINED", "provider timed out ⇒ abstain (no false success)")); return done("ABSTAINED", remaining); }
  adv("EXECUTE", { actions: [{ delegated: true }], results: [{ result: pv.result === undefined ? null : pv.result }] });
  trace.push(step("delegate+recover", "OK", "provider result captured"));

  // 8) VERIFY (independent: verifier must differ from the producer, and evidence must exist)
  const evidence = Array.isArray(pv.evidence) ? pv.evidence : [];
  const independent = (pv.verifier || "odg-verifier") !== (pv.name || "synthetic-provider");
  const verifyPass = independent && evidence.length > 0 && pv.inject !== "missing-evidence";
  adv("VERIFY", { evidence: evidence.map((e: any) => ({ ref: e })) });
  trace.push(step("verify", verifyPass ? "PASS" : "FAIL", !independent ? "verifier not independent of producer (capture) ⇒ FAIL" : (verifyPass ? "independent verification passed" : "evidence missing/insufficient")));

  // 9) DECIDE (accept only on independent, evidence-backed verification)
  if (!verifyPass) { adv("DECIDE", { decisions: [{ accepted: false }] }); trace.push(step("decide", "REFUSED", "no independent evidence ⇒ refuse (mission re-admitted for a changed-strategy retry)")); return done("REFUSED", remaining); }
  adv("DECIDE", { decisions: [{ accepted: true }] });
  trace.push(step("decide", "ACCEPTED", "evidence-backed acceptance"));

  // 10) EVIDENCE  11) NEXT
  adv("LEARN", { learnings: [{ reusable: top.kind }] });
  adv("IMPROVE", {}, remaining > 0 ? "select next finding" : null);
  trace.push(step("evidence+next", "OK", `evidence recorded; ${remaining} finding(s) remain`));
  return done("ACCEPTED", remaining);
}

const ENGINEERING_CHAIN_SCENARIO_CONTRACT = Object.freeze({
  id: "WI-SCN-11-ENGINEERING-CHAIN-SCENARIO",
  source: "FICHE §5 (ODG engineering-chain end-to-end) composed over §16 cognitive-loop + §42 discovery-engine",
  steps: Object.freeze(["discover", "objective", "mission+contract", "authorize", "delegate+recover", "verify", "decide", "evidence+next"]),
  verdicts: Object.freeze(["ACCEPTED", "REFUSED", "GATED", "FAILED", "ABSTAINED", "NONE"]),
  notAuthority: "reproducible local validation harness; executes NOTHING real; D4 consequential boundary is simulated (GATED), never crossed",
  invariants: Object.freeze([
    "pure/deterministic: spec in → verdict+trace out; no clock/random/network/execution",
    "non-ODG authority ⇒ REFUSED (ESCALATE); consequential ⇒ GATED (owner boundary simulated, D4)",
    "provider error ⇒ FAILED; timeout ⇒ ABSTAINED (never a false success)",
    "acceptance requires INDEPENDENT (verifier≠producer) + evidence; else REFUSED",
    "the cognitive-loop cycle is append-only ⇒ a gated/interrupted run leaves a RESUMABLE cycle with no lost decisions",
  ]),
});

module.exports = { runScenario, ENGINEERING_CHAIN_SCENARIO_CONTRACT };

if (require.main === module) {
  process.stdout.write(JSON.stringify(ENGINEERING_CHAIN_SCENARIO_CONTRACT, null, 2) + "\n");
}

export {};
