#!/usr/bin/env node
"use strict";
/* Tests for odg-hybrid-reasoning (V360 §14 deep/hybrid reasoning). Deterministic, zero fs/network. Proves the WEAKEST-LINK
 * invariant: FACTUAL only if ALL support is PROVEN/OBSERVED; any HYPOTHESIS ⇒ HYPOTHETICAL; any SIMULATION ⇒ SIMULATED
 * (never factual); any CONTRADICTED ⇒ UNSOUND; missing target ⇒ UNGROUNDED. Composes causal-graph + world-model. */
const M = require("./odg-hybrid-reasoning.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const ent = (status: string) => ({ type: "x", status });
const rel = (from: string, to: string, status: string) => ({ from, to, type: "causes", status });
const MODEL = {
  entities: {
    A: ent("OBSERVED"), B: ent("PROVEN"), C1: ent("OBSERVED"),
    H: ent("HYPOTHESIS"), C2: ent("OBSERVED"),
    Ssrc: ent("OBSERVED"), CON: ent("CONTRADICTED"), C3: ent("OBSERVED"),
  },
  relations: {
    e1: rel("A", "C1", "OBSERVED"), e2: rel("B", "C1", "PROVEN"),       // C1 causes {A,B} all factual
    e3: rel("H", "C2", "OBSERVED"), e4: rel("A", "C2", "OBSERVED"),     // C2 causes include H (HYPOTHESIS)
    e5: rel("Ssrc", "C1", "SIMULATION"),                                 // a dreamed cause of C1 (excluded by default)
    e6: rel("CON", "C3", "OBSERVED"),                                    // C3 has a CONTRADICTED cause
  },
};

function main(): void {
  // (1) all-factual causal path ⇒ DEDUCTIVE_FACTUAL (factual), and the SIMULATION edge into C1 is EXCLUDED + counted
  const f = M.reason(MODEL, { mode: "causes", target: "C1" });
  check("all-factual causes ⇒ FACTUAL (DEDUCTIVE_FACTUAL), result {A,B}", f.factual === true && f.soundness === "DEDUCTIVE_FACTUAL" && f.result.indexOf("A") >= 0 && f.result.indexOf("B") >= 0 && f.result.indexOf("Ssrc") < 0);
  check("weakest-link epistemicStatus = OBSERVED (not PROVEN); confidence HIGH", f.epistemicStatus === "OBSERVED" && f.confidence === "HIGH");
  check("the dreamed (SIMULATION) cause of C1 is EXCLUDED and counted (transparency)", f.simulationEdgesExcluded === 1);

  // (2) include the SIMULATION edge ⇒ SIMULATED (never factual), even though entities are observed
  const s = M.reason(MODEL, { mode: "causes", target: "C1" }, { includeSimulation: true });
  check("includeSimulation ⇒ SIMULATED, NOT factual (a dreamed link never drives a factual conclusion)", s.soundness === "SIMULATED" && s.factual === false && s.epistemicStatus === "SIMULATION" && s.confidence === "NOT_ASSERTED" && s.result.indexOf("Ssrc") >= 0);

  // (3) a HYPOTHESIS in the support ⇒ HYPOTHETICAL (not a fact), confidence LOW
  const h = M.reason(MODEL, { mode: "causes", target: "C2" });
  check("a HYPOTHESIS cause ⇒ HYPOTHETICAL, not factual, confidence LOW", h.factual === false && h.soundness === "HYPOTHETICAL" && h.epistemicStatus === "HYPOTHESIS" && h.confidence === "LOW");

  // (4) a CONTRADICTED cause ⇒ UNSOUND (refuse to assert), confidence NONE
  const c = M.reason(MODEL, { mode: "causes", target: "C3" });
  check("a CONTRADICTED cause ⇒ UNSOUND, not factual, confidence NONE", c.soundness === "UNSOUND" && c.factual === false && c.epistemicStatus === "CONTRADICTED" && c.confidence === "NONE");

  // (5) missing target ⇒ UNGROUNDED (no fabricated reasoning)
  const u = M.reason(MODEL, { mode: "causes", target: "does-not-exist" });
  check("missing target ⇒ UNGROUNDED (no fabrication)", u.soundness === "UNGROUNDED" && u.epistemicStatus === "UNGROUNDED" && u.result.length === 0);

  // (5b) a result node with NO entity record (relation references an id with no entity) ⇒ PARTIALLY_UNGROUNDED, not factual
  const MODEL2 = { entities: { T: ent("OBSERVED") }, relations: { r: rel("ghost_cause", "T", "OBSERVED") } }; // ghost_cause has no entity
  const pg = M.reason(MODEL2, { mode: "causes", target: "T" });
  check("result node with no entity record ⇒ PARTIALLY_UNGROUNDED, not factual, confidence NONE", pg.factual === false && pg.soundness === "PARTIALLY_UNGROUNDED" && pg.confidence === "NONE");

  // (6) effects mode ⇒ factual descendants of A ({C1,C2}); compute provenance reported
  const e = M.reason(MODEL, { mode: "effects", target: "A" });
  check("effects mode: factual descendants of A include C1 + C2", e.mode === "effects" && e.result.indexOf("C1") >= 0 && e.result.indexOf("C2") >= 0);
  check("compute provenance honest (cpu-reference OPERATIONAL, gpu-real UNAVAILABLE)", e.computeProvenance["cpu-reference"] === "OPERATIONAL" && /UNAVAILABLE/.test(e.computeProvenance["gpu-real"]));

  // (7) counterfactual mode runs (nodes that lose all support if the target is removed)
  const cf = M.reason(MODEL, { mode: "counterfactual", target: "A" });
  check("counterfactual mode returns a result set (deterministic)", cf.mode === "counterfactual" && Array.isArray(cf.result));

  // frozen + contract
  check("frozen result", Object.isFrozen(f) && Object.isFrozen(f.result));
  check("contract: weakest-link, SIMULATION never factual, UNSOUND on contradiction, composes (no 2nd engine)",
    /WEAKEST LINK/.test(JSON.stringify(M.HYBRID_REASONING_CONTRACT.invariants)) &&
    /SIMULATED — a dreamed link may NEVER drive a factual conclusion/.test(JSON.stringify(M.HYBRID_REASONING_CONTRACT.invariants)) &&
    /CONTRADICTED ⇒ UNSOUND/.test(JSON.stringify(M.HYBRID_REASONING_CONTRACT.invariants)) &&
    /no second reasoning engine/.test(JSON.stringify(M.HYBRID_REASONING_CONTRACT.invariants)) &&
    /causal-graph/.test(JSON.stringify(M.HYBRID_REASONING_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-hybrid-reasoning (V360 §14: causal structure × epistemic grounding; WEAKEST-LINK — FACTUAL only if all support PROVEN/OBSERVED, HYPOTHESIS⇒HYPOTHETICAL, SIMULATION⇒SIMULATED [never factual], CONTRADICTED⇒UNSOUND, missing⇒UNGROUNDED; composes causal-graph + world-model + inference-engine, no 2nd engine)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
