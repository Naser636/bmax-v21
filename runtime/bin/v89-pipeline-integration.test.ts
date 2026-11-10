#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V89 §4 — V88 ↔ campaign-engine END-TO-END integration. Drives the REAL runCampaign (not unit assess())
 * with missions carrying real changes + prior evidence, and proves the incremental-assurance engine runs INSIDE the
 * pipeline: isolated change ⇒ targeted selection + accepted; transversal/critical ⇒ full suite; demonstrated reuse keeps
 * provenance; stale/contradictory ⇒ BLOCKED_CONTRADICTION (never accepted); a mechanism defect is caught by an
 * independent mechanism; resume excludes already-accepted (no duplicate). Live campaign-engine + incremental-assurance.
 */

const path = require("path");
const fs = require("fs");
const ENGINE = require("../core/campaign-engine.js");
const CACHE = require("../core/verified-result-cache.js");
const DD = path.join(__dirname, "..", "..", "docs", "odg");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const INSP = { inspection: { inspectorMeta: { valid: true, effective: true }, independenceActors: { builder: { id: "P" }, verifier: { id: "I" } }, evidenceOptsFor: () => ({ exists: () => true, read: () => '{"done":1}', expectMarkers: ["done"] }) } };
const idbase = { inputs: 1, code: "c", deps: 1, config: 1, env: 1 };
const intact = (id: string, mod: string) => ({ id, forModule: mod, identity: idbase, provenance: "prov", identityDigest: CACHE.identityDigest(idbase) });
// a Level-A mission with a declared change + prior evidence.
const M = (id: string, change: any, priorEvidence: any = []) => ({ id, actions: ["code_edit_local", "test"], strategicImportance: 0.6, roadmapPriority: 0.6, unblocks: [], risk: 0.1, immediatelyExecutable: true, operationalValue: 0.6, closureWithProof: true, deps: [], status: "OPEN", change, priorEvidence });
const logOf = (r: any, id: string) => r.log.find((l: any) => l.id === id);

function main(): void {
  // A — isolated change ⇒ targeted selection (L1, not full suite), accepted via the real pipeline.
  const rA = ENGINE.runCampaign([M("A-iso", { changedModule: "leaf", kind: "function", impactedModules: ["leaf"], impactedTests: ["leaf.test.ts"] }, [intact("leaf-ev", "leaf")])], INSP);
  const lA = logOf(rA, "A-iso");
  check("A: isolated change ⇒ EXECUTED_ACCEPTED via real pipeline, assurance L1 not fullSuite", !!lA && lA.decision === "EXECUTED_ACCEPTED" && lA.assurance.depthLevel === 1 && lA.assurance.fullSuite === false);

  // B — transversal shared contract ⇒ full suite, accepted, no abusive reuse of the affected evidence.
  const rB = ENGINE.runCampaign([M("B-contract", { changedModule: "api", kind: "contract", impactedModules: ["api", "cons"] }, [intact("cons-ev", "cons")])], INSP);
  const lB = logOf(rB, "B-contract");
  check("B: shared-contract change ⇒ L3 fullSuite, affected evidence not reused", !!lB && lB.assurance.depthLevel === 3 && lB.assurance.fullSuite === true && lB.assurance.evidenceInvalidated >= 1);

  // C — critical change (permission) ⇒ L4 full suite (no cache shortcut).
  const rC = ENGINE.runCampaign([M("C-perm", { changedModule: "auth", kind: "permission", impactedTests: ["a.test.ts"] }, [])], INSP);
  const lC = logOf(rC, "C-perm");
  check("C: permission change ⇒ L4 fullSuite (no shortcut)", !!lC && lC.assurance.depthLevel === 4 && lC.assurance.fullSuite === true);

  // D — demonstrated reuse: an isolated change with an independent intact prior evidence ⇒ reused with provenance.
  const rD = ENGINE.runCampaign([M("D-reuse", { changedModule: "x", kind: "function", impactedModules: ["x"], impactedTests: ["x.test.ts"] }, [intact("indep-ev", "unrelated")])], INSP);
  const lD = logOf(rD, "D-reuse");
  check("D: independent intact evidence REUSED (provenance kept) via pipeline", !!lD && lD.decision === "EXECUTED_ACCEPTED" && lD.assurance.evidenceReused >= 1 && rD.metrics.evidenceReused >= 1);

  // E — contradictory evidence ⇒ BLOCKED_CONTRADICTION, NEVER accepted.
  const rE = ENGINE.runCampaign([M("E-contra", { changedModule: "z", kind: "function" }, [{ id: "contra", forModule: "z", identity: idbase, provenance: "p", contradiction: true }])], INSP);
  const lE = logOf(rE, "E-contra");
  check("E: contradictory evidence ⇒ BLOCKED_CONTRADICTION, not accepted", !!lE && lE.decision === "BLOCKED_CONTRADICTION" && rE.metrics.accepted === 0);

  // E' — stale evidence (digest mismatch) on a consumer in impact ⇒ invalidated, mission still runs full controls.
  const rE2 = ENGINE.runCampaign([M("E2-stale", { changedModule: "s", kind: "function", impactedModules: ["s", "c"], impactedTests: ["c.test.ts"] }, [{ id: "stale", forModule: "c", identity: idbase, provenance: "p", identityDigest: "OLD" }])], INSP);
  const lE2 = logOf(rE2, "E2-stale");
  check("E': stale evidence ⇒ invalidated (not reused), mission processed", !!lE2 && lE2.assurance.evidenceInvalidated >= 1 && lE2.assurance.evidenceReused === 0);

  // F — a mechanism defect (contradiction masquerading) is caught by the INDEPENDENT engine, not self-certified: the
  // contradictory mission above was blocked by the engine (a distinct mechanism from the producer). Corroborate via the
  // Chain-B meta-validation artifact (engine independently meta-validated effective).
  let mv: any = null; try { mv = JSON.parse(fs.readFileSync(path.join(DD, "V88_INCREMENTAL_META_VALIDATION.json"), "utf8")); } catch { /* */ }
  check("F: assurance mechanism independently meta-validated effective (not self-certified)", !!mv && mv.effective === true && mv.falsePositiveRate === 0);

  // G — resume / idempotence: a pre-ACCEPTED mission is not re-executed; no duplicate; others proceed.
  const rG = ENGINE.runCampaign([{ ...M("G-done", { changedModule: "d", kind: "function", impactedTests: ["d.test.ts"] }), status: "ACCEPTED" }, M("G-new", { changedModule: "n", kind: "function", impactedModules: ["n"], impactedTests: ["n.test.ts"] }, [intact("n-ev", "other")])], INSP);
  check("G: resume ⇒ pre-ACCEPTED skipped (no duplicate), new mission processed", rG.log.every((l: any) => l.id !== "G-done") && !!logOf(rG, "G-new"));

  // guardrail — acceptance is NEVER granted merely because fewer tests were selected: a mission that fails the loop is
  // not accepted even with a clean (reduced) assurance decision.
  const rFail = ENGINE.runCampaign([M("fail", { changedModule: "f", kind: "function", impactedTests: ["f.test.ts"] }, [intact("f-ev", "other")])], { ...INSP, execute: () => ({ mission: "fail", validated: false, status: "FAILED" }) });
  const lFail = logOf(rFail, "fail");
  check("guardrail: reduced selection does NOT grant acceptance when the loop fails", !!lFail && lFail.decision === "FAILED_NOT_ACCEPTED" && rFail.metrics.accepted === 0);

  // integration proof — campaign contract cites V88 wiring + the no-acceptance-for-fewer-tests rule.
  check("contract: campaign-engine reuses incremental-assurance (V88) + guardrail cited", /incremental-assurance \(V88\)/.test(JSON.stringify(ENGINE.CAMPAIGN_ENGINE_CONTRACT.reuses)) && /acceptance never granted because fewer tests/i.test(JSON.stringify(ENGINE.CAMPAIGN_ENGINE_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V89 pipeline integration (V88 runs INSIDE the real campaign: targeted/transversal/critical, reuse, BLOCKED, resume, guardrails)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
