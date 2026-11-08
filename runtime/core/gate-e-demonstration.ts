#!/usr/bin/env node
"use strict";

/*
 * V12.4 §101 — GATE E (TECHNICAL TRUTH) BEHAVIOURAL DEMONSTRATION. PURE given its inputs. Gate E's criteria (gates-
 * ledger) are "repo, contracts, tests, dependencies, real execution". This demonstrates the Gate-E SLICE from REAL,
 * already-green evidence — it composes the live `odg verify` snapshot (build + typescript + generated-contract
 * validity) with the LIVE preservation invariant (preservation-invariant.runPreservationCheck) — and returns a
 * fail-closed DEMONSTRATED_SLICE verdict. It is HONEST about scope: a slice demonstration is NOT a global Gate-E PASS
 * (the whole V12.4 technical truth), and it records that gates A/B/C/D/F/G full demonstration + global closure remain
 * (several behind owner-gated prerequisites FR-07/VPS/E5). It flips NO gates-ledger status and fabricates no PASS.
 * `gateDemonstrationStatus` reports, for all seven gates, what is demonstrable NOW vs what remains. Dual export.
 */

const PRES = require("./preservation-invariant");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** demonstrateGateE(verifySnapshot, opts?) -> { verdict, demonstrated, slice, criteria, remaining }. Fail-closed:
 * DEMONSTRATED_SLICE requires build && typescript && contracts-valid (from a REAL odg verify) AND live preservation. */
function demonstrateGateE(verifySnapshot: any, opts?: any): any {
  const v = isObj(verifySnapshot) ? verifySnapshot : {};
  const o = isObj(opts) ? opts : {};
  const buildOk = v.build === true;
  const tsOk = v.typescript === true;
  const contractsOk = v.generatedContractsValid === true || (isObj(v.generatedContracts) && v.generatedContracts.total > 0 && Array.isArray(v.generatedContracts.invalid) && v.generatedContracts.invalid.length === 0);
  const pres = isObj(o.preservation) ? o.preservation : PRES.runPreservationCheck(o.exec ? { exec: o.exec } : {});
  const presOk = pres.ok === true;
  const criteria = Object.freeze({ build: buildOk, typescript: tsOk, contractsValid: contractsOk, preservation: presOk });
  const demonstrated = buildOk && tsOk && contractsOk && presOk;
  const failing: string[] = [];
  if (!buildOk) failing.push("build");
  if (!tsOk) failing.push("typescript");
  if (!contractsOk) failing.push("generated contracts");
  if (!presOk) failing.push("preservation invariant");
  return Object.freeze({
    gate: "E", section: "§101", name: "Vérité technique (technical truth)",
    verdict: demonstrated ? "DEMONSTRATED_SLICE" : "NOT_DEMONSTRATED",
    demonstrated, slice: true, criteria, failing: Object.freeze(failing),
    note: demonstrated
      ? "Gate-E technical-truth SLICE demonstrated from real evidence (build+typescript+contracts+preservation). This is NOT a global Gate-E PASS: a global PASS requires the WHOLE V12.4 technical truth (all missions/contracts/tests/real execution), not this slice."
      : `Gate-E slice NOT demonstrated — failing: ${failing.join(", ")}.`,
    remaining: Object.freeze(["global Gate-E technical truth over ALL of V12.4 (not just this slice)", "real-execution evidence beyond build/test (runtime E2E across missions)"]),
  });
}

/** gateDemonstrationStatus() -> honest per-gate demonstrability, fail-closed, no fabricated PASS. */
function gateDemonstrationStatus(): any {
  return Object.freeze({
    source: "V12.4 §97-§103 gate demonstration status (honest; demonstrates only where real behavioural evidence exists)",
    gates: Object.freeze([
      { gate: "A", demonstrableNow: false, reason: "Connaissance: research-coverage demonstration needs an independent review, not file presence" },
      { gate: "B", demonstrableNow: false, reason: "Capacités: capability-coherence needs an independent capability audit" },
      { gate: "C", demonstrableNow: false, reason: "Architecture: primitive/G0 coherence partially evidenced (root-of-trust) but global architectural demonstration not run" },
      { gate: "D", demonstrableNow: false, reason: "Méta-amélioration: self-improvement composes the chain but independent evaluator certification is owner-gated (E4)" },
      { gate: "E", demonstrableNow: true, reason: "Vérité technique: a SLICE is demonstrable now from build+typescript+contracts+preservation (see demonstrateGateE)" },
      { gate: "F", demonstrableNow: false, reason: "Réconciliation: the matrix evidences target-vs-reality but a full reconciliation sign-off is not an automated demonstration" },
      { gate: "G", demonstrableNow: false, reason: "Construction: campaign-controller/action-gate evidence exists but global construction demonstration depends on campaign closure (owner-gated FR-07)" },
    ]),
    note: "Only Gate E has an automated behavioural SLICE demonstration today. The rest need independent review or owner-gated prerequisites (FR-07/VPS/E5). No gate is at global PASS; nothing is fabricated.",
  });
}

const GATE_E_DEMONSTRATION_CONTRACT = Object.freeze({
  id: "V124-GATE-E-DEMONSTRATION",
  source: "V12.4 §101 (Gate E technical truth) — behavioural slice demonstration",
  reuses: Object.freeze(["odg verify snapshot (build/typescript/generated-contracts)", "preservation-invariant.runPreservationCheck (live)"]),
  notAuthority: "a behavioural SLICE demonstration of Gate E; it is not a global Gate-E PASS and flips no gate status",
  invariants: Object.freeze([
    "DEMONSTRATED_SLICE requires build && typescript && contracts-valid (real odg verify) AND live preservation — fail-closed",
    "a slice demonstration is explicitly NOT a global Gate-E PASS (the whole V12.4 technical truth)",
    "no other gate (A/B/C/D/F/G) is claimed demonstrated; several remain behind owner-gated prerequisites (FR-07/VPS/E5)",
    "composes real evidence; fabricates no PASS; flips no gates-ledger status",
  ]),
});

module.exports = { demonstrateGateE, gateDemonstrationStatus, GATE_E_DEMONSTRATION_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...GATE_E_DEMONSTRATION_CONTRACT, status: gateDemonstrationStatus() }, null, 2) + "\n"); }

export {};
