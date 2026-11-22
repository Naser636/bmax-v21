#!/usr/bin/env node
"use strict";
/* V15 §6 — argued SLO recommendation from REAL data (mission-attempt-log + recorded CI events), with Wilson 95% intervals
 * and the minimum volume each candidate needs. Produces a PROPOSAL in slo-targets shape (status PROPOSED). It does NOT
 * modify runtime/core/slo-targets.ts and activates no freeze policy — the canonical decision is the owner's.
 * Usage: [--attempts <jsonl>] [--write <evidence.json>] [--proposal <proposal.json>] */
const fs = require("fs");
const AV = require("../core/odg-autonomy-availability.js");
const EB = require("../core/odg-slo-error-budget-view.js");
const SLO = require("../core/slo-targets.js");
function main() {
  const argv = process.argv.slice(2); const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const rows = fs.readFileSync(arg("--attempts") || "runtime/generated/mission-attempt-log.jsonl", "utf8").split("\n").filter((l: string) => l.trim()).map((l: string) => JSON.parse(l));
  const CUT = "2026-11-22T02:00:00Z";
  const before = AV.summarize(rows, { from: "2026-11-08T00:00:00Z", to: CUT }), after = AV.summarize(rows, { from: CUT }), all = AV.summarize(rows);
  const good = (s: any) => s.total - s.counts.REFUSED_ORGANIZATIONAL - s.counts.REFUSED_LEGITIMATE;
  const ci = JSON.parse(fs.readFileSync("docs/odg/evidence/LOT3_CI_EVENTS.json", "utf8")).runs.filter((r: any) => r.conclusion === "success" || r.conclusion === "failure");
  const ciGood = ci.filter((r: any) => r.conclusion === "success").length;
  const CAND = [0.97, 0.98, 0.985, 0.99];
  const avail = { before: { n: before.total, good: good(before), sli: before.availability, wilson: AV.wilson(good(before), before.total) },
    after: { n: after.total, good: good(after), sli: after.availability, wilson: AV.wilson(good(after), after.total), windowFrom: CUT, windowTo: after.window.to } };
  const ciStat = { n: ci.length, good: ciGood, sli: Number((ciGood / ci.length).toFixed(4)), wilson: AV.wilson(ciGood, ci.length), window: [ci[0].t, ci[ci.length - 1].t] };
  const days = (ev: any[]) => Math.max(1, Math.round((Date.parse(ev[ev.length - 1].t) - Date.parse(ev[0].t)) / 86400000));
  const ciEv = ci.map((r: any) => ({ t: r.t, good: r.conclusion === "success" }));
  const table = CAND.map((t) => {
    const b = EB.eventBudgetAnalysis(ciEv, { sloTarget: t, windowDays: days(ciEv) });
    return { target: t, minTicksToSupportAvailability: AV.minTicksToSupport(t),
      availabilityAfterFix: avail.after.wilson && avail.after.wilson.low >= t ? "SUPPORTED (Wilson low ≥ target)" : (avail.after.n < AV.minTicksToSupport(t) ? "INSUFFICIENT_VOLUME (n=" + avail.after.n + " < " + AV.minTicksToSupport(t) + ")" : "NOT_SUPPORTED"),
      ci: { budgetRemaining: b.errorBudget.remainingFraction, exhausted: b.errorBudget.exhausted, wilsonLowVsTarget: ciStat.wilson.low >= t ? "SUPPORTED" : (ciStat.wilson.high < t ? "BELOW" : "INCONCLUSIVE") } };
  });
  const mission = SLO.getTarget("MISSION_SUCCESS_VERIFIED");
  const recommendation = {
    autonomyAvailability: { recommend: 0.98, status: "PROPOSED_PROVISIONAL",
      why: "post-fix ticks are all available but n=" + avail.after.n + " is too small to support any candidate (99% needs ≥" + AV.minTicksToSupport(0.99) + " consecutive good ticks ≈ 4 days at 96/day; 98% needs ≥" + AV.minTicksToSupport(0.98) + "). The organizational cause (1180/1183 refusals) is now structurally blocked by the main-worktree guard, leaving only legitimate refusals (3 in 33 days ≈ 0.1%), so 98% leaves an error budget for legitimate Truth-Lock stops and outages without masking a regression. Over 14 days (≈1344 ticks) the budget is ≈27 refused ticks at 98% vs ≈13 at 99%: one bad night (e.g. 6 h of refusals = 24 ticks) would exhaust 99% but not 98%. Re-decide after ≥14 days.",
      evaluateOn: "mission-attempt-log, ticks from " + CUT + "; any STARTUP_REFUSED = bad (organizational and legitimate both count)" },
    ciRequiredCheck: { recommend: 0.98, status: "PROPOSED",
      why: "SLI " + ciStat.sli + " over " + ciStat.n + " decisive runs, Wilson 95% [" + ciStat.wilson.low + ", " + ciStat.wilson.high + "]. 97% lies BELOW the lower bound (already met with margin ⇒ too loose to detect a degradation); 98% lies INSIDE the interval with 18.5% budget left ⇒ meaningful but attainable; 98.5% is inside the interval but its budget is already exhausted; 99% lies ABOVE the upper bound ⇒ currently not attainable (would freeze on day one)." },
    missionReliability: { recommend: "KEEP existing CTO target MISSION_SUCCESS_VERIFIED " + (mission ? mission.target : "?") + " (minSampleN " + (mission ? mission.minSampleN : "?") + ")", status: "NOT_MEASURED",
      why: "only " + (all.counts.AVAILABLE_EXECUTED_PASS + all.counts.AVAILABLE_EXECUTED_NOT_PASS) + " executed attempts — below minSampleN; no rate is reported" },
  };
  const proposal = [
    { id: "AUTONOMY_AVAILABILITY", kind: "rate", direction: "atLeast", target: recommendation.autonomyAvailability.recommend, minSampleN: 1344, status: "PROPOSED", definition: "fraction of scheduled mission-runner ticks that pass startup (mission-attempt-log; any STARTUP_REFUSED = unavailable), rolling 14 days", provenance: { source: "V15 §6 recommendation (provider-prepared)", authoredBy: "Claude Code (technical provider) — NOT a CTO/owner decision", declaredAt: "2026-11-22" } },
    { id: "CI_REQUIRED_CHECK_SUCCESS", kind: "rate", direction: "atLeast", target: recommendation.ciRequiredCheck.recommend, minSampleN: 200, status: "PROPOSED", definition: "fraction of decisive runs (success|failure) of the required check 'build + typecheck + parity + tests', rolling 30 days", provenance: { source: "V15 §6 recommendation (provider-prepared)", authoredBy: "Claude Code (technical provider) — NOT a CTO/owner decision", declaredAt: "2026-11-22" } },
  ];
  const evidence = { lot: "V15 §6 — SLO recommendation (real data, Wilson intervals)", availability: avail, ci: ciStat, candidates: table, recommendation, notApplied: "runtime/core/slo-targets.ts unchanged; no freeze policy activated; canonical decision = owner", proposalFile: "docs/odg/PROPOSAL_SLO_TARGETS_V15.json" };
  const o1 = arg("--write"), o2 = arg("--proposal");
  if (o1) fs.writeFileSync(o1, JSON.stringify(evidence, null, 2) + "\n");
  if (o2) fs.writeFileSync(o2, JSON.stringify({ "//": "PROPOSAL — NOT APPLIED. Entries in runtime/core/slo-targets.ts SLO_TARGETS shape; status PROPOSED. Applying requires an owner/CTO decision (it would become CONFIGURED with owner provenance).", entries: proposal }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ after: avail.after, ci: ciStat, table: table.map((x: any) => [x.target, x.availabilityAfterFix, x.ci.wilsonLowVsTarget, x.ci.budgetRemaining]) }) + "\n");
}
main();
export {};
