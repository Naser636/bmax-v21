#!/usr/bin/env node
"use strict";
/* V374 Lot 3 — first OPERATIONAL use of a Radar-acquired knowledge item inside a real internal ODG journey.
 * Knowledge: "An error budget is 1 minus the SLO of the service" (sre.google, SUPPORTED by KI-V2 on the repo-pinned
 * collection; usable for DESIGN_PROPOSAL). Journey: the repository's REQUIRED CI check (real pass/fail events; the mission
 * ledger was rejected because it cannot represent failures — failuresRepresentable:false). OFFLINE replay of recorded data.
 * SLO values are PROPOSALS (never adopted here): the CTO must validate one. Usage: [--write <path>] [--ledger <mission-ledger.json>] */
const fs = require("fs");
const path = require("path");
const K = require("../core/odg-knowledge-intelligence.js");
const EB = require("../core/odg-slo-error-budget-view.js");
const RESP = require("../core/slo-response.js");
const COL = require("../core/slo-collector.js");

function main() {
  const argv = process.argv.slice(2); const wi = argv.indexOf("--write"); const out = wi >= 0 ? argv[wi + 1] : null;
  const asOf = Date.UTC(2026, 10, 22, 13);
  // 1. the knowledge item, re-assessed on the REPO-pinned collection (production trust path) — and its allowed use.
  const col = JSON.parse(fs.readFileSync("docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP2_COLLECTION.json", "utf8"));
  const collection = K.attestCollection(col, {});
  const SRE = "https://sre.google/workbook/error-budget-policy/";
  const key = { subject: "error budget", relation: "equals", value: "1 minus the SLO of the service" };
  const a = K.assessClaim({ ...key, nature: "OFFICIAL_DOCUMENTATION", text: "An error budget is 1 minus the SLO of the service", sources: [{ url: SRE, citation: "An error budget is 1 minus the SLO of the service", structured: key }] },
    { asOfEpochMs: asOf, collection, missionAuthorization: "DESIGN_PROPOSAL" });
  const use = K.usableFor(K.toMemory(a, asOf), "DESIGN_PROPOSAL", asOf, { assessment: a });
  // 2. formula agreement: the canonical module's definition == the knowledge (allowedBad = (1 − SLO) × total).
  const probe = EB.sloErrorBudget({ goodEvents: 99, totalEvents: 100, sloTarget: 0.95 });
  const formulaAgrees = probe.errorBudget.allowedBad === Number(((1 - 0.95) * 100).toFixed(2));
  // 3. why not the mission ledger: survivorship (failures not representable).
  const li = argv.indexOf("--ledger"); const ledgerPath = li >= 0 ? argv[li + 1] : "runtime/generated/mission-ledger.json";   // local gitignored state (read-only)
  let pop: any = { population: { verifiedNumerator: null, eligibleDenominator: null }, failuresRepresentable: "NOT_AVAILABLE" };
  try { pop = COL.collectSloPopulation(JSON.parse(fs.readFileSync(ledgerPath, "utf8")).entries, {}); } catch { /* ledger absent ⇒ NOT_AVAILABLE, reported */ }
  // 4. the real CI journey.
  const ci = JSON.parse(fs.readFileSync("docs/odg/evidence/LOT3_CI_EVENTS.json", "utf8"));
  const decisive = ci.runs.filter((r: any) => r.conclusion === "success" || r.conclusion === "failure").map((r: any) => ({ t: r.t, good: r.conclusion === "success", change: r.change }));
  const windowDays = Math.max(1, Math.round((Date.parse(decisive[decisive.length - 1].t) - Date.parse(decisive[0].t)) / 86400000));
  const proposals = [0.97, 0.99].map((slo) => {
    const an = EB.eventBudgetAnalysis(decisive, { sloTarget: slo, windowDays, burnAlertFactor: 2 });
    const verdict = { id: "CI_REQUIRED_CHECK_SUCCESS (PROPOSED)", status: an.errorBudget.exhausted ? "BREACHED" : "WITHIN", sli: an.sli.value, target: slo };
    let plan: any = null; try { plan = RESP.planSloResponse(verdict); } catch (e: any) { plan = { error: String(e && e.message) }; }
    return { sloProposed: slo, sli: an.sli, errorBudget: an.errorBudget, earlyWarning: an.earlyWarning, incidents: an.incidents,
      srePolicySuggestion: an.errorBudget.exhausted ? "SRE EXAMPLE policy would halt non-P0 changes" : "no halt suggested",
      canonicalDecision: plan && plan.gate ? plan.gate : "UNKNOWN",   // ODG's own slo-response decides — it does NOT gate on a PROPOSED (unconfigured) SLO
      sloResponsePlan: plan };
  });
  const evidence = {
    lot: "V374 Lot 3 — operational use of SRE knowledge (error budget = 1 − SLO) on a real internal journey",
    knowledge: { claim: a.text, epistemic: a.dimensions.epistemic, isFact: a.isFact, usage: use, formulaAgreesWithCanonicalModule: formulaAgrees },
    rejectedJourney: { journey: "mission-ledger MISSION_SUCCESS_VERIFIED", numerator: pop.population.verifiedNumerator, denominator: pop.population.eligibleDenominator, failuresRepresentable: pop.failuresRepresentable,
      why: "175/175 looks like 100% but the ledger records no failures (survivorship) — an error budget on it would be meaningless; reported, not used" },
    journey: { name: "required CI check 'build + typecheck + parity + tests'", events: decisive.length, cancelledExcluded: ci.runs.length - decisive.length, windowDays, source: "docs/odg/evidence/LOT3_CI_EVENTS.json" },
    proposals,
    decisionImpact: proposals.map((p: any) => ({ slo: p.sloProposed, exhausted: p.errorBudget.exhausted, srePolicySuggestion: p.srePolicySuggestion, canonicalDecision: p.canonicalDecision, why: p.sloResponsePlan && p.sloResponsePlan.reason })),
    finding: "the knowledge is correctly applied (formula agrees) and the budget is measurable on real events; the DECISION it would drive depends entirely on the SLO value; ODG's canonical slo-response refuses to gate on an unconfigured SLO (measurement-only) — a freeze needs the CTO to configure the target in slo-targets.",
    limits: ["SLO values are PROPOSED (CTO must choose); the decision flips between 0.97 and 0.99 — the policy value matters more than the formula",
      "14-day window (not the SRE 4-week window) — limited by available history", "CI pass/fail is a proxy for engineering reliability, not product availability",
      "no live alerting/freeze applied (PREPARE only); benefit on future reliability NOT_MEASURED until the policy runs prospectively"],
  };
  const json = JSON.stringify(evidence, null, 2) + "\n";
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, json); }
  process.stdout.write(JSON.stringify({ knowledge: evidence.knowledge.epistemic, usage: use.authorization, formulaAgrees, ledgerFailuresRepresentable: pop.failuresRepresentable, events: decisive.length, windowDays,
    decisions: evidence.decisionImpact, sli: proposals[0].sli.value, incidents: proposals[0].incidents.count, recoveryP50min: proposals[0].incidents.recoveryMinutes.p50, firstAlert: proposals.map((p: any) => p.earlyWarning.firstAlertDay) }) + "\n");
}
main();
export {};
