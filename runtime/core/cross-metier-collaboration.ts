#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 12 (Step 5) — CROSS-MÉTIER COLLABORATION. PURE, deterministic. A complex problem — "ship a data-backed API
 * change safely" — mobilises FIVE métiers and produces ONE coherent, verifiable, reproducible verdict by COMPOSING
 * the existing profession reference modules (NO new engine): P4 data-quality, P8 API-compatibility, P3 security scan,
 * P1 behaviour-preservation, P6 evaluation quality. Fail-closed: SHIP only when EVERY métier passes; otherwise HOLD
 * and NAME the blocking métier(s). Synthetic only; E5 (real release) owner-gated NOT_RUN. Dual export.
 */

const P4 = require("./profession-p4-data-reference");
const P8 = require("./api-contract");
const P3 = require("./profession-p3-security-reference");
const P1 = require("./profession-p1-fullstack-reference");
const P6 = require("./profession-p6-eval-reference");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

function defaultScenario(): any {
  return {
    // P4: a clean dataset against a schema.
    dataset: [ { id: 1, amount: 100 }, { id: 2, amount: 200 } ],
    schema: { id: { type: "number", required: true }, amount: { type: "number", required: true } },
    // P8: a backward-compatible contract change (adds an OPTIONAL output only).
    oldContract: { version: "1.0.0", requiredIn: ["id"], requiredOut: ["amount"], inputSchema: { id: "number" }, outputSchema: { amount: "number" } },
    newContract: { version: "1.1.0", requiredIn: ["id"], requiredOut: ["amount"], inputSchema: { id: "number" }, outputSchema: { amount: "number", currency: "string" } },
    // P3: a clean service project (no secrets/injection/copyleft/unpinned).
    serviceFiles: [ { path: "src/handler.ts", content: "export function handler(x){ return x.amount; }" } ],
    // P1: a behaviour-preserving refactor (same observed outputs).
    before: [ { input: 1, observedOutput: "a" }, { input: 2, observedOutput: "b" } ],
    after: [ { input: 1, observedOutput: "a" }, { input: 2, observedOutput: "b" } ],
    // P6: predictions that match gold (high f1).
    gold: { t1: 1, t2: 0, t3: 1, t4: 0 }, predictions: { t1: 1, t2: 0, t3: 1, t4: 0 }, f1Threshold: 0.8,
  };
}

/** shipGate(scenario) -> { ship, metiers:{P4,P8,P3,P1,P6}, blocking }. Fail-closed: SHIP iff all five pass. */
function shipGate(scenario: any): any {
  const s = isObj(scenario) ? { ...defaultScenario(), ...scenario } : defaultScenario();

  const p4 = P4.assessDataQuality(s.dataset, s.schema);
  const p8 = P8.checkCompatibility(s.oldContract, s.newContract);
  const p3 = P3.scanProject(P3.syntheticProject({ files: s.serviceFiles }));
  const p1 = P1.refactorPreservesBehaviour(s.before, s.after, "ship-gate");
  const p6 = P6.evaluate(s.gold, s.predictions);

  const metiers = Object.freeze({
    P4: { role: "Data quality", pass: p4.clean === true, detail: { score: p4.score, defects: p4.defects } },
    P8: { role: "API compatibility", pass: p8.compatible === true, detail: { breaking: p8.breaking } },
    P3: { role: "Security scan", pass: p3.clean === true, detail: { severity: p3.severity } },
    P1: { role: "Behaviour preservation", pass: p1.ok === true, detail: { verdict: p1.verdict } },
    P6: { role: "Evaluation quality", pass: p6.f1 >= (typeof s.f1Threshold === "number" ? s.f1Threshold : 0.8), detail: { f1: p6.f1 } },
  });
  const blocking = Object.keys(metiers).filter((k) => (metiers as any)[k].pass !== true);
  const ship = blocking.length === 0;
  return Object.freeze({
    synthetic: true, problem: "ship a data-backed API change safely",
    ship, verdict: ship ? "SHIP" : "HOLD", blocking: Object.freeze(blocking), metiers,
    note: "SYNTHETIC multi-métier gate (not a real release, not E5); SHIP only when EVERY métier passes (fail-closed); a single failing métier ⇒ HOLD + named; E5 real release owner-gated NOT_RUN",
  });
}

const CROSS_METIER_CONTRACT = Object.freeze({
  id: "V124-CROSS-METIER-COLLABORATION",
  source: "SÉRIE 12 Step-5 — a complex problem mobilising multiple métiers into one coherent verdict",
  composes: Object.freeze(["P4 data-quality", "P8 api-contract compatibility", "P3 security scan", "P1 behaviour-preservation", "P6 evaluation"]),
  notAuthority: "a composition of existing profession references; it builds no new engine and ships nothing for real",
  invariants: Object.freeze([
    "SHIP only when EVERY mobilised métier passes — fail-closed; a single failing métier ⇒ HOLD + the métier is named",
    "the verdict is coherent + reproducible (pure composition of deterministic profession modules)",
    "reuses 5 existing profession references; no new engine/evaluator",
    "SYNTHETIC only; a real release (E5) is owner-gated NOT_RUN",
  ]),
});

module.exports = { defaultScenario, shipGate, CROSS_METIER_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...CROSS_METIER_CONTRACT, demo: shipGate({}) }, null, 2) + "\n"); }

export {};
