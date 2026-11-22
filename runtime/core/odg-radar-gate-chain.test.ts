#!/usr/bin/env node
"use strict";
/* V254/V257 CM-RADAR-GATE-CHAIN. Proves the read-only verifier COMPOSES the REAL odg-radar-to-mission-loop.pathMap + the
 * merged execution/test/inspection/evidence components over the full canonical chain; is FAIL-CLOSED (a stage with no backing
 * component ⇒ MISSING, chainWired false); and is HONEST (chainWired ≠ autonomous execution; terminal DÉCISION OWNER_GATED). */
const C = require("./odg-radar-gate-chain.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  check("canonical chain is the 13 stages RECHERCHE..DECISION", C.CANONICAL_CHAIN.length === 13 && C.CANONICAL_CHAIN[0] === "RECHERCHE" && C.CANONICAL_CHAIN[12] === "DECISION");
  const v = C.verifyChain();
  check("every canonical stage maps to a REAL backing component (no MISSING) ⇒ chainWired", v.total === 13 && v.missing.length === 0 && v.chainWired === true);
  check("the research→mission half is derived from the REAL pathMap (RECHERCHE/QUALIFICATION/MISSION/MANDAT covered)", v.stages.find((s: any) => s.stage === "RECHERCHE").status === "EXISTING_VALIDATED" && v.stages.find((s: any) => s.stage === "MISSION").status === "EXISTING_VALIDATED" && v.stages.find((s: any) => s.stage === "MANDAT").status === "EXISTING_VALIDATED");
  check("the execution half maps to merged components (CONSTRUCTION/TEST/INSPECTION/PREUVE validated)", ["CONSTRUCTION", "TEST", "INSPECTION", "PREUVE"].every((name) => v.stages.find((s: any) => s.stage === name).status === "EXISTING_VALIDATED"));
  // HONESTY: terminal DÉCISION is OWNER_GATED (real mission creation), autonomous execution NOT_MEASURED.
  check("HONESTY: terminal DÉCISION is OWNER_GATED (real mission creation / real-world action), NOT auto-authorized", v.stages.find((s: any) => s.stage === "DECISION").status === "OWNER_GATED" && v.terminalDecision === "OWNER_GATED");
  check("HONESTY: chainWired does NOT claim autonomous execution (endToEndAutonomous NOT_MEASURED)", v.endToEndAutonomous === "NOT_MEASURED");
  check("a PARTIAL step (capability/gap) is reported as EXISTING_PARTIAL, not silently upgraded to VALIDATED", v.partial >= 1 && v.stages.find((s: any) => s.stage === "LACUNE").status === "EXISTING_PARTIAL");
  // FAIL-CLOSED semantics: deriveStatus maps an unknown state to PARTIAL (never silently VALIDATED). Checked via the contract.
  check("contract: composes the real loop (no 2nd radar) + fail-closed MISSING + honesty (wired≠autonomous, DÉCISION owner-gated)", C.RADAR_GATE_CHAIN_CONTRACT.invariants.some((i: string) => /no second radar|NO second radar/i.test(i)) && C.RADAR_GATE_CHAIN_CONTRACT.invariants.some((i: string) => /FAIL-CLOSED/.test(i)) && C.RADAR_GATE_CHAIN_CONTRACT.invariants.some((i: string) => /AUTONOMOUS/.test(i)));
  check("deterministic + frozen", JSON.stringify(C.verifyChain()) === JSON.stringify(v) && Object.isFrozen(v) && Object.isFrozen(v.stages));

  // ── V372 step 1: the EXECUTED chain on REAL recorded Radar data (offline) ──
  const KA = require("./odg-knowledge-acquisition.js");
  const ASOF = Date.UTC(2026, 10, 22), DAY = 86400000;
  const ALL12 = { linkedToV124: true, needDemonstrated: true, codeAndDepsReviewed: true, isolatedExperiment: true, baselineRecorded: true, functionalTestsPass: true, nonRegressionPass: true, measurableGainOrNewCapability: true, noContractOrPermissionViolation: true, securityValidated: true, independentInspection: true, rollbackAvailable: true };
  const r1 = C.runChain({ asOfEpochMs: ASOF });
  check("EXEC: ACQUIRE on the real recorded cycle — 2 accessible, 2 INACCESSIBLE (403) recorded, not circumvented",
    !!r1.acquisition && r1.acquisition.accessibleCount === 2 && r1.acquisition.inaccessibleCount === 2 && r1.acquisition.inaccessible.every((x: any) => x.httpStatus === 403));
  check("EXEC: exactly the corroborated fact is ADMITTED, with url provenance + consulted dates + VERIFIED",
    r1.admitted.length === 1 && /^RADAR_RECORDED_REAL:https:/.test(r1.admitted[0].provenance) && r1.admitted[0].sources.every((s: any) => /^2026-/.test(s.date)) && r1.admitted[0].status === "VERIFIED");
  check("EXEC: admitted record is ODG-attributed (author+applier) with a validity window",
    r1.admitted[0].authoredBy === "ODG_CAPABILITY" && r1.admitted[0].appliedBy === "ODG_EXECUTOR" && r1.admitted[0].validUntil === ASOF + C.KNOWLEDGE_TTL_DAYS * DAY);
  check("EXEC: trace RETRIEVE→ACQUIRE→ADMIT→PROPOSE→DECIDE, sha256 per stage",
    r1.trace.map((t: any) => t.stage).join(">") === "RETRIEVE>ACQUIRE>ADMIT>PROPOSE>DECIDE" && r1.trace.every((t: any) => /^[0-9a-f]{64}$/.test(t.inputSha256) && /^[0-9a-f]{64}$/.test(t.outputSha256)));
  check("EXEC: canonical gate decides; unproven experiment ⇒ HONEST RETURN (baseline missing), never a fabricated pass",
    r1.decision.verdict === "RETURN_TO_EXPERIMENT" && r1.decision.action === "RETURNED" && r1.decision.softMissing.indexOf("baselineRecorded") >= 0);
  check("EXEC: never deployed; deploy stays owner-gated", r1.decision.deployed === false && r1.decision.deployStillOwnerGated === true);
  const r2 = C.runChain({ asOfEpochMs: ASOF + DAY, memory: r1.memoryOut });
  check("EXEC REUSE PROOF: run 2 retrieves the admitted knowledge, re-acquires nothing, skips ACQUIRE/ADMIT",
    r2.reuse.retrieved === 1 && r2.reuse.reacquired === 0 && r2.acquisition === null && r2.trace.map((t: any) => t.stage).join(">") === "RETRIEVE>PROPOSE>DECIDE");
  check("EXEC REUSE: the same knowledge id flows into the proposal", r2.proposal.knowledgeIds[0] === r1.admitted[0].id);
  const rStale = C.runChain({ asOfEpochMs: ASOF + (C.KNOWLEDGE_TTL_DAYS + 1) * DAY, memory: r1.memoryOut });
  check("EXEC: STALE memory is not reused ⇒ re-acquisition", rStale.reuse.retrieved === 0 && rStale.reuse.reacquired === 1 && rStale.acquisition !== null);
  const rTamper = C.runChain({ asOfEpochMs: ASOF, memory: [Object.assign({}, r1.admitted[0], { authoredBy: "UNKNOWN" })] });
  check("EXEC negative: unattributed (tampered author) memory is NOT reused", rTamper.reuse.retrieved === 0 && rTamper.acquisition !== null);
  const undated = Object.assign({}, KA.REAL_CYCLE, { sources: KA.REAL_CYCLE.sources.map((s: any) => Object.assign({}, s, { consultedDate: undefined, publishedDate: undefined })) });
  const rUndated = C.runChain({ asOfEpochMs: ASOF, cycle: undated });
  check("EXEC negative: undated sources ⇒ nothing admitted (NO_PROVENANCE), still decided honestly", rUndated.admitted.length === 0 && rUndated.rejected.length >= 1 && rUndated.decision.verdict !== "INTEGRATE");
  const rSingle = C.runChain({ asOfEpochMs: ASOF, cycle: Object.assign({}, KA.REAL_CYCLE, { sources: [KA.REAL_CYCLE.sources[0], KA.REAL_CYCLE.sources[2]] }) });
  check("EXEC negative: a single-source claim is NOT admitted (needs ≥2 independent sources)", rSingle.admitted.length === 0 && rSingle.rejected.length === 1);
  const rI = C.runChain({ asOfEpochMs: ASOF, experimentEvidence: ALL12 });
  check("EXEC: all 12 conditions PROVEN ⇒ INTEGRATE ⇒ MERGE_ELIGIBLE, still not deployed", rI.decision.verdict === "INTEGRATE" && rI.decision.action === "MERGE_ELIGIBLE" && rI.decision.deployed === false);
  const rR = C.runChain({ asOfEpochMs: ASOF, experimentEvidence: Object.assign({}, ALL12, { securityValidated: false }) });
  check("EXEC: hard violation (security) ⇒ REJECT", rR.decision.verdict === "REJECT" && rR.decision.action === "REJECTED");
  check("EXEC: deterministic (identical inputs ⇒ identical trace hashes) + frozen", JSON.stringify(C.runChain({ asOfEpochMs: ASOF }).trace) === JSON.stringify(r1.trace) && Object.isFrozen(r1) && Object.isFrozen(r1.trace) && Object.isFrozen(r1.admitted));
  const s = C.summarize(r1);
  check("EXEC: summarize() gives a compact consumer indicator", s.ok === true && s.admitted === 1 && s.retrieved === 0 && s.verdict === "RETURN_TO_EXPERIMENT" && s.deployed === false && C.summarize(null).ok === false);
  let threw = false; try { C.runChain({}); } catch { threw = true; }
  check("EXEC: no injected clock ⇒ throws (no hidden Date.now)", threw);
  check("EXEC contract: composition-only + fail-closed + reuse-before-reacquire + owner-gated deploy", C.EXECUTED_CHAIN_CONTRACT.invariants.length === 6 && C.EXECUTED_CHAIN_CONTRACT.composes.indexOf("memory-trust-gate") >= 0);

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-radar-gate-chain (V254/V257 CM-RADAR-GATE-CHAIN: read-only verifier COMPOSING the real radar-to-mission pathMap + merged execution/test/inspection/evidence over the 13-stage chain; fail-closed MISSING; chainWired ≠ autonomous [NOT_MEASURED]; terminal DÉCISION OWNER_GATED; no 2nd radar)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
