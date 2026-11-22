#!/usr/bin/env node
"use strict";
/* V15 §6 — argued SLO recommendation from REAL data (mission-attempt-log + recorded CI events), with Wilson 95% intervals,
 * the minimum volume each candidate needs and the earliest date it could be supported at the current rate. Produces a
 * PROPOSAL in slo-targets shape (status PROPOSED). It does NOT modify runtime/core/slo-targets.ts and activates no alert
 * and no freeze policy — the canonical decision is the owner's.
 * V15-SLI-DEFINITIONS: availability uses the SCHEDULED-SLOT SLI (missing ticks = unavailable; fail-closed status
 * allowlist); CI uses CI_MAIN_PUSH_SUCCESS (push-to-main only; PR runs = development signal); mission breakdown separates
 * POLICY_REFUSED from FAIL.
 * Usage: [--attempts <jsonl>] [--as-of <ISO>] [--write <evidence.json>] [--proposal <proposal.json>] */
const fs = require("fs");
const AV = require("../core/odg-autonomy-availability.js");
const EB = require("../core/odg-slo-error-budget-view.js");
const SLO = require("../core/slo-targets.js");
function main() {
  const argv = process.argv.slice(2); const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const attemptsPath = arg("--attempts") || "runtime/generated/mission-attempt-log.jsonl";
  const rows = fs.readFileSync(attemptsPath, "utf8").split("\n").filter((l: string) => l.trim()).map((l: string) => JSON.parse(l));
  const asOf = arg("--as-of") || new Date().toISOString();
  const CUT = "2026-11-22T02:00:00Z", HIST_FROM = "2026-11-08T00:00:00Z";
  const CAND = [0.97, 0.98, 0.985, 0.99];
  const SLOTS_PER_DAY = 86400000 / AV.SCHEDULE_CADENCE_MS;
  const before = AV.summarize(rows, { from: HIST_FROM, to: CUT }), after = AV.summarize(rows, { from: CUT, asOf }), all = AV.summarize(rows, { asOf });
  const view = (s: any) => ({
    window: s.window, loggedRows: s.total,
    loggedRowSli: { good: s.total - AV.UNAVAILABLE_CLASSES.reduce((a: number, c: string) => a + s.counts[c], 0), n: s.total, sli: s.availability },
    scheduledSlotSli: { good: s.scheduledSlot.good, n: s.scheduledSlot.slots, missingTicks: s.scheduledSlot.missingTicks, sli: s.scheduledSlot.sli, wilson: AV.wilson(s.scheduledSlot.good, s.scheduledSlot.slots), gaps: s.scheduledSlot.gaps, offScheduleRows: s.scheduledSlot.offScheduleRows },
    counts: s.counts });
  // residual unavailability = what the guard can NOT remove (legitimate + integrity + unclassified + missing slots) over the history window
  const hist = AV.summarize(rows, { from: HIST_FROM, asOf });
  const residualBad = hist.counts.REFUSED_LEGITIMATE + hist.counts.REFUSED_INTEGRITY + hist.counts.UNCLASSIFIED_FAIL_CLOSED + hist.scheduledSlot.missingTicks;
  const residual = { window: [HIST_FROM, asOf], slots: hist.scheduledSlot.slots, bad: residualBad, rate: Number((residualBad / hist.scheduledSlot.slots).toFixed(4)),
    wilsonOfGood: AV.wilson(hist.scheduledSlot.slots - residualBad, hist.scheduledSlot.slots),
    breakdown: { legitimate: hist.counts.REFUSED_LEGITIMATE, integrity: hist.counts.REFUSED_INTEGRITY, unclassified: hist.counts.UNCLASSIFIED_FAIL_CLOSED, missingTicks: hist.scheduledSlot.missingTicks },
    note: "organizational refusals removed (structurally blocked by the main-worktree guard since the cutover) — an ESTIMATE of the floor, not a measurement of the post-fix regime" };
  const avAfter = after.scheduledSlot;
  const addDate = (fromIso: string, units: number | null, perDay: number) => (units === null ? null : new Date(Date.parse(fromIso) + (units / perDay) * 86400000).toISOString());
  // CI — main-push reliability SLI vs PR development signal
  const ciFile = JSON.parse(fs.readFileSync("docs/odg/evidence/LOT3_CI_EVENTS.json", "utf8"));
  const split = AV.ciSplit(ciFile.runs);
  const mp = split.mainPush;
  const mainEv = ciFile.runs.filter((r: any) => r.event === "push" && r.change === "main" && (r.conclusion === "success" || r.conclusion === "failure")).map((r: any) => ({ t: r.t, good: r.conclusion === "success", change: r.sha }));
  const mainDays = Math.max(1, mp.window.days), runsPerDay = Number((mp.n / mainDays).toFixed(2));
  const pos = (w: any, t: number) => (w.low >= t ? "SUPPORTED (Wilson low ≥ target ⇒ already met with margin)" : (w.high < t ? "BELOW (Wilson high < target ⇒ not attainable now)" : "INCONCLUSIVE (target inside the interval)"));
  const table = CAND.map((t) => {
    const b = EB.eventBudgetAnalysis(mainEv, { sloTarget: t, windowDays: Math.max(1, Math.round(mainDays)) });
    const mAv = AV.additionalGoodToSupport(avAfter.good, avAfter.slots, t), mCi = AV.additionalGoodToSupport(mp.good, mp.n, t);
    const wAv = AV.wilson(avAfter.good, avAfter.slots);
    return { target: t,
      availability: { minConsecutiveGoodSlots: AV.minTicksToSupport(t), observedGoodOfSlots: avAfter.good + "/" + avAfter.slots,
        verdict: !wAv ? "NO_DATA" : (wAv.low >= t ? "SUPPORTED" : (mAv === null ? "NOT_REACHABLE" : "INSUFFICIENT_VOLUME")),
        additionalGoodSlotsNeeded: mAv, earliestSupportDate: addDate(asOf, mAv, SLOTS_PER_DAY), earliestSupportAssumes: "every future slot good, " + SLOTS_PER_DAY + " slots/day",
        allowedBadPer14d: Number(((1 - t) * 14 * SLOTS_PER_DAY).toFixed(2)) },
      ciMainPush: { position: pos(mp.wilson, t), allowedBad: b.errorBudget.allowedBad, actualBad: b.errorBudget.actualBad, budgetRemaining: b.errorBudget.remainingFraction, exhausted: b.errorBudget.exhausted,
        additionalGoodRunsNeeded: mCi, earliestSupportDate: addDate(mp.window.to, mCi, runsPerDay), earliestSupportAssumes: "every future main-push run green, " + runsPerDay + " runs/day (snapshot rate)",
        allowedBadPer30d: Number(((1 - t) * 30 * runsPerDay).toFixed(2)) } };
  });
  // CI decision rule (stated, data-driven): the TIGHTEST candidate INSIDE the main-push Wilson interval (not trivially met, not already violated) whose budget is not exhausted
  const ciPick = [...table].reverse().find((r: any) => r.ciMainPush.position.startsWith("INCONCLUSIVE") && !r.ciMainPush.exhausted) || null;
  const avPick = 0.98;
  const rAv: any = table.find((r: any) => r.target === avPick), r99: any = table.find((r: any) => r.target === 0.99);
  const mission = SLO.getTarget("MISSION_SUCCESS_VERIFIED");
  const mb = all.missionBreakdown;
  const wAfter = AV.wilson(avAfter.good, avAfter.slots);
  const recommendation = {
    autonomyAvailability: { recommend: avPick, status: "PROPOSED_PROVISIONAL", sli: "scheduled-slot SLI (logged rows + missing ticks; fail-closed status allowlist)",
      why: "post-fix (" + CUT + " → " + asOf + "): " + avAfter.good + "/" + avAfter.slots + " scheduled slots good (" + avAfter.missingTicks + " missing), Wilson low " + (wAfter ? wAfter.low : "n/a") +
        " ⇒ the volume supports NO candidate yet; earliest support if every future slot is good: 97% ≈ " + table[0].availability.earliestSupportDate + ", 98% ≈ " + rAv.availability.earliestSupportDate + ", 99% ≈ " + r99.availability.earliestSupportDate +
        ". Residual (non-organizational) unavailability " + HIST_FROM + " → asOf = " + residual.bad + "/" + residual.slots + " slots (" + (residual.rate * 100).toFixed(2) + "%: legitimate " + residual.breakdown.legitimate + ", integrity " + residual.breakdown.integrity + ", unclassified " + residual.breakdown.unclassified + ", missing ticks " + residual.breakdown.missingTicks +
        "), Wilson of good [" + (residual.wilsonOfGood ? residual.wilsonOfGood.low + ", " + residual.wilsonOfGood.high : "n/a") + "]. That COUNTERFACTUAL estimate (organizational refusals removed, not observed post-fix) would sit at the edge of 99%, but it is not a measurement of the post-fix regime. 98% is kept PROVISIONAL (not raised to 99%) because (a) only the post-fix window is measured and it supports nothing yet, (b) the scheduled-slot SLI now also charges timer/host outages: the 14-day budget is ≈" + rAv.availability.allowedBadPer14d + " slots at 98% vs ≈" + r99.availability.allowedBadPer14d + " at 99% — a single ~4 h host/timer outage (16 slots) would exhaust 99% but not 98%. Upgrade path (PROPOSED): move to 99% only if, after ≥ 14 post-fix days, the measured scheduled-slot Wilson low is ≥ 0.99.",
      evaluateOn: "mission-attempt-log from " + CUT + "; unavailable = STARTUP_REFUSED | AUDIT_CHAIN_TAMPERED | any status outside the producer allowlist | missing scheduled slot (gap > 1.5 × 15 min)" },
    ciMainPush: { recommend: ciPick ? ciPick.target : null, status: "PROPOSED", sli: "CI_MAIN_PUSH_SUCCESS — decisive push-to-main runs only",
      why: "SLI " + mp.sli + " = " + mp.good + "/" + mp.n + " decisive push-to-main runs, window " + mp.window.from + " → " + mp.window.to + " (" + mp.window.days + " days, static snapshot docs/odg/evidence/LOT3_CI_EVENTS.json fetched " + ciFile.fetchedAt + " with gh run list -L 1000 — NOT a rolling 30-day window), Wilson 95% [" + mp.wilson.low + ", " + mp.wilson.high + "]. " +
        table.map((r: any) => (r.target * 100) + "%: " + r.ciMainPush.position.split(" ")[0] + ", budget left " + r.ciMainPush.budgetRemaining).join("; ") +
        ". Rule: tightest candidate inside the interval with budget not exhausted ⇒ " + (ciPick ? ciPick.target : "none") + ". The previous 98% came from mixing " + split.pullRequest.n + " pull_request runs (" + split.pullRequest.bad + " failures = the check catching bad PR code) into the SLI; on main-push alone 98% is already met with margin (too loose to detect a degradation). At ~" + runsPerDay + " main pushes/day a 30-day 99% budget is ≈" + r99.ciMainPush.allowedBadPer30d + " failures. 99% is a target, NOT a claim that it is met (it is inside the interval, i.e. unproven).",
      prSignal: { role: split.pullRequest.role, n: split.pullRequest.n, good: split.pullRequest.good, sli: split.pullRequest.sli, note: "reported, NOT an SLO" } },
    missionReliability: { recommend: "KEEP existing CTO target MISSION_SUCCESS_VERIFIED " + (mission ? mission.target : "?") + " (minSampleN " + (mission ? mission.minSampleN : "?") + ")", status: "NOT_MEASURED",
      breakdown: mb, why: "only " + mb.reached + " mission attempt(s) reached by a tick (pass " + mb.pass + ", fail " + mb.fail + ", policy-refused " + mb.policyRefused + ") — below minSampleN " + (mission ? mission.minSampleN : "?") + "; no rate reported. Policy refusals stay not-pass in the SLI (fail-closed) but are shown separately: they are canary authorization denials, not execution failures." },
  };
  const proposals = {
    status: "PROPOSED — NOT APPLIED (no alert wired, no freeze active; owner decision)",
    alerts: [
      { slo: "AUTONOMY_AVAILABILITY", rule: "alert if ≥ 4 consecutive unavailable scheduled slots (1 h, missing ticks included) OR ≥ 4 unavailable slots in one UTC day (burn ≥ 2× at 98%: 2 × 0.02 × 96 = 3.84)", basis: "odg-slo-error-budget-view burnAlertFactor 2" },
      { slo: "CI_MAIN_PUSH_SUCCESS", rule: "alert on every failed push-to-main run (at ~" + runsPerDay + " runs/day one failure already burns > 2× the daily 99% budget, so a per-day burn alert degenerates to 'any failure')", basis: "volume-derived" },
    ],
    freezeRules: [
      { slo: "AUTONOMY_AVAILABILITY", rule: "if the rolling 14-day budget is exhausted: no change to mission-runner / Truth-Lock / scheduler code other than availability fixes, until the budget is positive again" },
      { slo: "CI_MAIN_PUSH_SUCCESS", rule: "if the rolling 30-day budget is exhausted: merges to main restricted to CI/reliability fixes until the budget is positive again" },
    ],
  };
  const prov = { source: "V15 §6 recommendation (provider-prepared, V15-SLI-DEFINITIONS)", authoredBy: "Claude Code (technical provider) — NOT a CTO/owner decision", declaredAt: asOf.slice(0, 10) };
  const proposal = [
    { id: "AUTONOMY_AVAILABILITY", kind: "rate", direction: "atLeast", target: recommendation.autonomyAvailability.recommend, minSampleN: 14 * SLOTS_PER_DAY, status: "PROPOSED", definition: "scheduled-slot SLI: good mission-runner ticks / (logged ticks + missing scheduled slots), cadence 15 min (odg-mission-runner.timer); unavailable = STARTUP_REFUSED | AUDIT_CHAIN_TAMPERED | status outside the producer allowlist | missing slot (gap > 1.5× cadence ⇒ floor(gap/cadence)−1); rolling 14 days", provenance: prov },
    { id: "CI_MAIN_PUSH_SUCCESS", kind: "rate", direction: "atLeast", target: recommendation.ciMainPush.recommend, minSampleN: 200, status: "PROPOSED", definition: "fraction of decisive (success|failure) runs of the required check 'build + typecheck + parity + tests' triggered by push to main; pull_request runs excluded (development signal, not an SLO); cancelled excluded; rolling 30 days (evidence window so far: " + mp.window.from + " → " + mp.window.to + ", " + mp.n + " runs)", provenance: prov },
  ];
  const evidence = { lot: "V15 §6 — SLO recommendation (real data, Wilson intervals) — V15-SLI-DEFINITIONS", definitionVersion: AV.AUTONOMY_AVAILABILITY_CONTRACT.definitionVersion, asOf,
    sources: { attempts: "runtime/generated/mission-attempt-log.jsonl (local, gitignored; read-only), " + rows.length + " rows", ci: "docs/odg/evidence/LOT3_CI_EVENTS.json (static snapshot, fetchedAt " + ciFile.fetchedAt + ")", cadence: "15 min — /etc/systemd/system/odg-mission-runner.timer OnUnitActiveSec=15min (read-only)" },
    availability: { before: view(before), after: view(after), residualUnavailabilityEstimate: residual },
    ci: { mainPush: mp, pullRequest: split.pullRequest, excluded: split.excluded, runsPerDayMainPush: runsPerDay },
    missionReliability: { breakdown: mb, minSampleN: all.missionMinSampleN, note: all.missionReliabilityNote },
    candidates: table, recommendation, proposals,
    history: { previous: "origin/main ac87cd94: availability 98% PROVISIONAL on logged rows (post-fix 54/54, Wilson low 0.9336); CI 98% on 982 mixed push+PR runs (SLI 0.9837, Wilson [0.9737, 0.9899]); missions NOT_MEASURED (3 'executed' incl. 2 policy refusals)",
      changedBy: "independent audit D1–D4/D6 — fail-closed status allowlist, scheduled-slot SLI, CI main-push split, policy-refusal breakdown" },
    notApplied: "runtime/core/slo-targets.ts unchanged; no alert wired; no freeze policy activated; canonical decision = owner", proposalFile: "docs/odg/PROPOSAL_SLO_TARGETS_V15.json" };
  const o1 = arg("--write"), o2 = arg("--proposal");
  if (o1) fs.writeFileSync(o1, JSON.stringify(evidence, null, 2) + "\n");
  if (o2) fs.writeFileSync(o2, JSON.stringify({ "//": "PROPOSAL — NOT APPLIED. Entries in runtime/core/slo-targets.ts SLO_TARGETS shape; status PROPOSED. Applying requires an owner/CTO decision (it would become CONFIGURED with owner provenance). Alert thresholds and freeze rules are PROPOSALS too — nothing is wired or active.", definitionVersion: AV.AUTONOMY_AVAILABILITY_CONTRACT.definitionVersion, entries: proposal, alertAndFreezeProposals: proposals, supersedes: "previous proposal (ac87cd94): AUTONOMY_AVAILABILITY 0.98 on logged rows; CI_REQUIRED_CHECK_SUCCESS 0.98 on mixed push+PR runs" }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ asOf, before: view(before).scheduledSlotSli, beforeLogged: view(before).loggedRowSli, after: view(after).scheduledSlotSli, afterLogged: view(after).loggedRowSli, residual: { bad: residual.bad, slots: residual.slots, rate: residual.rate },
    ci: { n: mp.n, good: mp.good, sli: mp.sli, wilson: mp.wilson, window: mp.window, pr: { n: split.pullRequest.n, good: split.pullRequest.good } }, mission: mb,
    table: table.map((x: any) => [x.target, x.availability.verdict, x.availability.additionalGoodSlotsNeeded, x.availability.earliestSupportDate, x.ciMainPush.position.split(" ")[0], x.ciMainPush.budgetRemaining, x.ciMainPush.additionalGoodRunsNeeded, x.ciMainPush.earliestSupportDate]),
    pick: { av: avPick, ci: ciPick ? ciPick.target : null } }) + "\n");
}
main();
export {};
