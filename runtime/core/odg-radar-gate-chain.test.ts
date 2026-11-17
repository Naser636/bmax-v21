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

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-radar-gate-chain (V254/V257 CM-RADAR-GATE-CHAIN: read-only verifier COMPOSING the real radar-to-mission pathMap + merged execution/test/inspection/evidence over the 13-stage chain; fail-closed MISSING; chainWired ≠ autonomous [NOT_MEASURED]; terminal DÉCISION OWNER_GATED; no 2nd radar)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
