#!/usr/bin/env node
"use strict";
/*
 * V360 §14 (deep/hybrid reasoning) — HYBRID REASONING RUN (demonstrator). Reasons over a SYNTHETIC world-model and shows the
 * WEAKEST-LINK epistemic propagation: a conclusion is FACTUAL only if all support is PROVEN/OBSERVED; a HYPOTHESIS makes it
 * HYPOTHETICAL; a SIMULATION link makes it SIMULATED (never factual); a CONTRADICTED cause makes it UNSOUND. READ-ONLY,
 * deterministic. The world-model here is SYNTHETIC (clearly labelled) — a mechanism demonstration, not real-world facts.
 *
 * Usage: npx tsx runtime/bin/odg-hybrid-reasoning-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const HR = require(path.join(ROOT, "runtime", "core", "odg-hybrid-reasoning.js"));

const ent = (status: string) => ({ type: "x", status });
const rel = (from: string, to: string, status: string) => ({ from, to, type: "causes", status });
// SYNTHETIC world-model (NOT real-world facts).
const MODEL = {
  entities: {
    outage: ent("OBSERVED"), disk_full: ent("OBSERVED"), log_spike: ent("PROVEN"),
    maybe_leak: ent("HYPOTHESIS"), degraded: ent("OBSERVED"),
    rumor: ent("OBSERVED"), rumor_effect: ent("OBSERVED"),
    contradicted_cause: ent("CONTRADICTED"), bad_conclusion: ent("OBSERVED"),
  },
  relations: {
    r1: rel("disk_full", "outage", "OBSERVED"), r2: rel("log_spike", "outage", "PROVEN"),   // outage: factual causes
    r3: rel("maybe_leak", "degraded", "OBSERVED"),                                            // degraded: hypothetical cause
    r4: rel("rumor", "outage", "SIMULATION"),                                                 // a dreamed cause of outage (excluded)
    r5: rel("contradicted_cause", "bad_conclusion", "OBSERVED"),                              // unsound
  },
};

const queries = [
  { label: "root cause of a real outage (all factual)", q: { mode: "causes", target: "outage" } },
  { label: "same outage, following dreamed links too", q: { mode: "causes", target: "outage" }, opts: { includeSimulation: true } },
  { label: "cause of a degraded state (rests on a hypothesis)", q: { mode: "causes", target: "degraded" } },
  { label: "conclusion resting on a contradicted cause", q: { mode: "causes", target: "bad_conclusion" } },
  { label: "reasoning about an absent entity", q: { mode: "causes", target: "ghost" } },
];

const results = queries.map((x) => {
  const r = HR.reason(MODEL, x.q, x.opts || {});
  return { query: x.label, result: r.result, soundness: r.soundness, epistemicStatus: r.epistemicStatus, factual: r.factual, confidence: r.confidence, simulationEdgesExcluded: r.simulationEdgesExcluded };
});

process.stdout.write(JSON.stringify({ hybridReasoning: "V360 §14 — causal structure × epistemic grounding (weakest-link). SYNTHETIC world-model — not real facts.", results }, null, 2) + "\n");
const factual = results.filter((r) => r.factual).length;
process.stdout.write(`\nHYBRID-REASONING: ${results.length} queries; ${factual} FACTUAL (all support PROVEN/OBSERVED). ` +
  `WEAKEST LINK: a HYPOTHESIS ⇒ HYPOTHETICAL, a SIMULATION link ⇒ SIMULATED (never factual), a CONTRADICTED cause ⇒ UNSOUND, an absent target ⇒ UNGROUNDED. Certainty never exceeds the weakest supporting evidence; nothing asserted above its evidence. SYNTHETIC demonstration.\n`);
process.exit(0);
export {};
