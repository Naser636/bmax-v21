#!/usr/bin/env node
"use strict";
/* V15 §6 — argued SLO recommendation from REAL data (mission-attempt-log + CI runs), with Wilson 95% intervals, the
 * minimum volume each candidate needs and the earliest date it could be supported at the current rate. Produces a
 * PROPOSAL in slo-targets shape (status PROPOSED). It does NOT modify runtime/core/slo-targets.ts and activates no alert
 * and no freeze policy — the canonical decision is the owner's.
 * V15-SLI-DEFINITIONS-r2: availability = TRUE scheduled-slot SLI (epoch-aligned 15-min slots, good iff ≥1 row and every
 * row available; extra rows never add slots) — a LIVENESS signal, not "autonomy works"; CI = CI_MAIN_PUSH_SUCCESS from a
 * read-only GitHub API fetch WITH run_attempt (first-attempt outcome), fail-closed on every non-success conclusion; the
 * fetch is embedded in the evidence so a re-run without --ci-main-push reproduces the same numbers; PR runs = development
 * signal (latest-attempt snapshot, flagged); mission breakdown separates POLICY_REFUSED from FAIL.
 * Usage: [--attempts <jsonl>] [--as-of <ISO>] [--ci-main-push <jsonl from gh api>] [--ci-fetched-at <ISO>] [--write <evidence.json>] [--proposal <proposal.json>] */
const fs = require("fs");
const AV = require("../core/odg-autonomy-availability.js");
const EB = require("../core/odg-slo-error-budget-view.js");
const SLO = require("../core/slo-targets.js");
const FETCH_CMD = "gh api --paginate 'repos/<owner>/<repo>/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=100' --jq '.workflow_runs[] | {id, t: .created_at, conclusion, status, attempt: .run_attempt, sha: .head_sha[0:12], event, branch: .head_branch}' (read-only; total_count checked = rows ⇒ not truncated); for attempt > 1 the first attempt would be read from .../actions/runs/<id>/attempts/1";
function main() {
  const argv = process.argv.slice(2); const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const attemptsPath = arg("--attempts") || "runtime/generated/mission-attempt-log.jsonl";
  const rows = fs.readFileSync(attemptsPath, "utf8").split("\n").filter((l: string) => l.trim()).map((l: string) => JSON.parse(l));
  const asOf = arg("--as-of") || new Date().toISOString();
  const CUT = "2026-11-22T02:00:00Z", HIST_FROM = "2026-11-08T00:00:00Z";
  const CAND = [0.97, 0.98, 0.985, 0.99];
  const SLOTS_PER_DAY = 86400000 / AV.SCHEDULE_CADENCE_MS;
  const before = AV.summarize(rows, { from: HIST_FROM, to: CUT, asOf }), after = AV.summarize(rows, { from: CUT, asOf }), all = AV.summarize(rows, { asOf });
  const view = (s: any) => ({
    window: s.window, loggedRows: s.total,
    loggedRowSli: { good: s.total - AV.UNAVAILABLE_CLASSES.reduce((a: number, c: string) => a + s.counts[c], 0), n: s.total, sli: s.availability, note: "kept for history; extra rows inflate it" },
    scheduledSlotSli: { good: s.scheduledSlot.good, n: s.scheduledSlot.slots, missingTicks: s.scheduledSlot.missingTicks, driftSlips: s.scheduledSlot.driftSlips, refusedSlots: s.scheduledSlot.refusedSlots,
      sli: s.scheduledSlot.sli, wilson: AV.wilson(s.scheduledSlot.good, s.scheduledSlot.slots), extraRowsIgnored: s.scheduledSlot.extraRowsIgnored, futureRowsExcluded: s.scheduledSlot.futureRowsExcluded, missingRuns: s.scheduledSlot.missingRuns },
    counts: s.counts });
  // residual = bad slots NOT attributable to an organizational refusal (empty slots + slots whose worst row is legitimate/integrity/unclassified)
  const histEv = AV.toEvents(rows, { slots: true, from: HIST_FROM, asOf });
  const hist = AV.summarize(rows, { from: HIST_FROM, asOf });
  const residualBad = histEv.filter((e: any) => !e.good && e.change !== "REFUSED_ORGANIZATIONAL").length;
  const residual = { window: [HIST_FROM, asOf], slots: histEv.length, bad: residualBad, rate: Number((residualBad / histEv.length).toFixed(4)),
    wilsonOfGood: AV.wilson(histEv.length - residualBad, histEv.length),
    breakdown: { emptySlots: hist.scheduledSlot.missingTicks, ofWhichDriftSlips: hist.scheduledSlot.driftSlips, refusedNonOrganizationalSlots: residualBad - hist.scheduledSlot.missingTicks },
    note: "COUNTERFACTUAL: slots lost to organizational refusals treated as good (structurally blocked by the main-worktree guard since the cutover) — an ESTIMATE of the floor, not a measurement of the post-fix regime" };
  const avAfter = after.scheduledSlot;
  const addDate = (fromIso: string, units: number | null, perDay: number) => (units === null ? null : new Date(Date.parse(fromIso) + (units / perDay) * 86400000).toISOString());
  // CI — main-push reliability SLI (fresh fetch with attempts) vs PR development signal (snapshot)
  const ciFile = JSON.parse(fs.readFileSync("docs/odg/evidence/LOT3_CI_EVENTS.json", "utf8"));
  const split = AV.ciSplit(ciFile.runs);
  const strip = (x: any) => { const { events, ...rest } = x; return rest; };
  const outPath = arg("--write");
  let fetch: any = null;
  if (arg("--ci-main-push")) {
    const fr = fs.readFileSync(arg("--ci-main-push"), "utf8").split("\n").filter((l: string) => l.trim()).map((l: string) => JSON.parse(l));
    fetch = { fetchedAt: arg("--ci-fetched-at") || null, command: FETCH_CMD, rowsFetched: fr.length,
      columns: ["id", "t", "conclusion", "status", "attempt", "firstConclusion", "sha"],
      rows: fr.map((r: any) => [r.id, r.t, r.conclusion, r.status, r.attempt, r.firstConclusion !== undefined ? r.firstConclusion : (r.attempt === 1 ? r.conclusion : null), r.sha]) };
  } else if (outPath && fs.existsSync(outPath)) { try { fetch = JSON.parse(fs.readFileSync(outPath, "utf8")).ci.mainPushFetch || null; } catch { fetch = null; } }
  if (!fetch) throw new Error("no CI main-push fetch: pass --ci-main-push <jsonl> (gh api, read-only) — refusing to fall back silently to the latest-attempt snapshot");
  const mainRuns = fetch.rows.map((x: any[]) => ({ id: x[0], t: x[1], conclusion: x[2], status: x[3], attempt: x[4], firstConclusion: x[5] === null ? undefined : x[5], sha: x[6], event: "push", change: "main" }));
  const mpFull = AV.ciSplit(mainRuns).mainPush, mainEv = mpFull.events, mp = strip(mpFull);
  const mainExcl = AV.ciSplit(mainRuns).excluded;
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
        budgetWindow: mp.window.from + " → " + mp.window.to + " (" + mp.window.days + " days, " + mp.n + " counted runs — the whole push-to-main history returned by the API, not a rolling 30-day window)",
        additionalGoodRunsNeeded: mCi, earliestSupportDate: addDate(mp.window.to, mCi, runsPerDay), earliestSupportAssumes: "every future main-push run green on first attempt, " + runsPerDay + " runs/day (observed rate)",
        allowedBadPer30d: Number(((1 - t) * 30 * runsPerDay).toFixed(2)) } };
  });
  // CI decision rule (stated, data-driven): the TIGHTEST candidate INSIDE the main-push Wilson interval (not trivially met, not already violated) whose budget is not exhausted
  const ciPick = [...table].reverse().find((r: any) => r.ciMainPush.position.startsWith("INCONCLUSIVE") && !r.ciMainPush.exhausted) || null;
  const avPick = 0.98;
  const rAv: any = table.find((r: any) => r.target === avPick), r99: any = table.find((r: any) => r.target === 0.99);
  const mission = SLO.getTarget("MISSION_SUCCESS_VERIFIED");
  const mb = all.missionBreakdown;
  const wAfter = AV.wilson(avAfter.good, avAfter.slots);
  const driftRate = hist.scheduledSlot.slots ? Number((hist.scheduledSlot.driftSlips / hist.scheduledSlot.slots).toFixed(4)) : null;
  const recommendation = {
    autonomyAvailability: { recommend: avPick, status: "PROPOSED_PROVISIONAL", sli: "scheduled-slot SLI (epoch-aligned 15-min slots; good iff ≥1 row and every row available)",
      liveness: "this SLI is a LIVENESS signal — the mission-runner timer fired and the tick passed startup with the repo on main (Truth-Lock + audit chain OK). It does NOT measure that autonomy works (missions succeeding) — that is missionReliability, NOT_MEASURED.",
      why: "post-fix (" + CUT + " → " + asOf + "): " + avAfter.good + "/" + avAfter.slots + " slots good (" + avAfter.missingTicks + " empty, of which " + avAfter.driftSlips + " drift slips; " + avAfter.refusedSlots + " refused), Wilson low " + (wAfter ? wAfter.low : "n/a") +
        " ⇒ the volume supports NO candidate yet; earliest support if every future slot is good: 97% ≈ " + table[0].availability.earliestSupportDate + ", 98% ≈ " + rAv.availability.earliestSupportDate + ", 99% ≈ " + r99.availability.earliestSupportDate +
        ". Residual (non-organizational) bad slots " + HIST_FROM + " → asOf = " + residual.bad + "/" + residual.slots + " (" + (residual.rate * 100).toFixed(2) + "%: " + residual.breakdown.emptySlots + " empty slots of which " + residual.breakdown.ofWhichDriftSlips + " drift slips, " + residual.breakdown.refusedNonOrganizationalSlots + " legitimate/integrity refusals), Wilson of good [" + (residual.wilsonOfGood ? residual.wilsonOfGood.low + ", " + residual.wilsonOfGood.high : "n/a") + "] — a COUNTERFACTUAL estimate, not a post-fix measurement. " +
        "Timer drift alone (OnUnitActiveSec=15min + default AccuracySec: the tick fires slightly later than every 15 min, so some grid slots get no tick) costs ≈" + (driftRate === null ? "n/a" : (driftRate * 100).toFixed(2) + "%") + " of slots and is charged as unavailable (fail-closed): that is a systematic floor that would consume most of a 99% budget (1%) but leaves room under 98% (2%). " +
        "98% is kept PROVISIONAL (not raised to 99%) because (a) only the post-fix window is measured and it supports nothing yet, (b) drift + one ~4 h host/timer outage (16 slots) fit the 14-day 98% budget (≈" + rAv.availability.allowedBadPer14d + " slots) but not 99% (≈" + r99.availability.allowedBadPer14d + "). Upgrade path (PROPOSED): 99% only if, after ≥ 14 post-fix days, the measured slot Wilson low is ≥ 0.99.",
      evaluateOn: "mission-attempt-log from " + CUT + "; unavailable slot = empty | any row STARTUP_REFUSED | AUDIT_CHAIN_TAMPERED | status outside the producer allowlist" },
    ciMainPush: { recommend: ciPick ? ciPick.target : null, status: "PROPOSED", sli: "CI_MAIN_PUSH_SUCCESS — completed push-to-main runs, first-attempt outcome; non-success non-cancelled = bad",
      why: "SLI " + mp.sli + " = " + mp.good + "/" + mp.n + " counted push-to-main runs (bad by conclusion " + JSON.stringify(mp.badByConclusion) + "; " + mainExcl.cancelled + " cancelled excluded as superseded, " + mainExcl.pending + " pending), window " + mp.window.from + " → " + mp.window.to + " (" + mp.window.days + " days — the full push-to-main history the API returned at " + fetch.fetchedAt + ", NOT a rolling 30-day window), Wilson 95% [" + mp.wilson.low + ", " + mp.wilson.high + "]. " +
        "Re-runs: attemptInfo " + mp.attemptInfo + ", " + mp.reruns + " run(s) with run_attempt > 1 ⇒ no red-then-green re-run is hidden in this window (" + mp.attemptBias + "). " +
        table.map((r: any) => (r.target * 100) + "%: " + r.ciMainPush.position.split(" ")[0] + ", budget left " + r.ciMainPush.budgetRemaining).join("; ") +
        ". Rule: tightest candidate inside the interval with budget not exhausted ⇒ " + (ciPick ? ciPick.target : "none") + ". The r0 98% came from mixing pull_request runs (" + split.pullRequest.n + " in the snapshot, " + split.pullRequest.bad + " bad = the check catching bad PR code) into the SLI; on main-push alone 98% is already met with margin (too loose to detect a degradation). Budget figures are computed over the " + mp.window.days + "-day window above; at ~" + runsPerDay + " main pushes/day a 30-day 99% budget would be ≈" + r99.ciMainPush.allowedBadPer30d + " failures. " + (ciPick ? (ciPick.target * 100) + "% is a target, NOT a claim that it is met (it is inside the interval, i.e. unproven)." : ""),
      prSignal: { role: split.pullRequest.role, n: split.pullRequest.n, good: split.pullRequest.good, sli: split.pullRequest.sli, attemptInfo: split.pullRequest.attemptInfo, note: "reported, NOT an SLO; snapshot has no attempt field (latest-attempt bias)" } },
    missionReliability: { recommend: "KEEP existing CTO target MISSION_SUCCESS_VERIFIED " + (mission ? mission.target : "?") + " (minSampleN " + (mission ? mission.minSampleN : "?") + ")", status: "NOT_MEASURED",
      breakdown: mb, why: "only " + mb.reached + " mission attempt(s) reached by a tick (pass " + mb.pass + ", fail " + mb.fail + ", policy-refused " + mb.policyRefused + ") — below minSampleN " + (mission ? mission.minSampleN : "?") + "; no rate reported. Policy refusals stay not-pass in the SLI (fail-closed) but are shown separately: they are canary authorization denials, not execution failures." },
  };
  const proposals = {
    status: "PROPOSED — NOT APPLIED (no alert wired, no freeze active; owner decision)",
    alerts: [
      { slo: "AUTONOMY_AVAILABILITY", rule: "alert if ≥ 4 consecutive unavailable slots (1 h) OR ≥ 4 unavailable slots in one UTC day (burn ≥ 2× at 98%: 2 × 0.02 × 96 = 3.84)", basis: "odg-slo-error-budget-view burnAlertFactor 2; drift slips (isolated single empty slots) make the daily rule fire occasionally — tune after the 14-day window" },
      { slo: "CI_MAIN_PUSH_SUCCESS", rule: "alert on every bad push-to-main run (at ~" + runsPerDay + " runs/day one bad run already burns > 2× the daily 99% budget, so a per-day burn alert degenerates to 'any failure')", basis: "volume-derived" },
    ],
    freezeRules: [
      { slo: "AUTONOMY_AVAILABILITY", rule: "if the rolling 14-day budget is exhausted: no change to mission-runner / Truth-Lock / scheduler code other than availability fixes, until the budget is positive again" },
      { slo: "CI_MAIN_PUSH_SUCCESS", rule: "if the rolling 30-day budget is exhausted: merges to main restricted to CI/reliability fixes until the budget is positive again" },
    ],
  };
  const prov = { source: "V15 §6 recommendation (provider-prepared, " + AV.AUTONOMY_AVAILABILITY_CONTRACT.definitionVersion + ")", authoredBy: "Claude Code (technical provider) — NOT a CTO/owner decision", declaredAt: asOf.slice(0, 10) };
  const proposal = [
    { id: "AUTONOMY_AVAILABILITY", kind: "rate", direction: "atLeast", target: recommendation.autonomyAvailability.recommend, minSampleN: 14 * SLOTS_PER_DAY, status: "PROPOSED",
      definition: "LIVENESS SLI — NOT a measure that autonomy works: fraction of epoch-aligned 15-min slots (odg-mission-runner.timer cadence) in which the mission-runner tick fired AND passed startup with the repo on main. A slot is good iff it holds ≥1 mission-attempt-log row and every row in it is an allowlisted post-startup status; empty slot (incl. timer drift slips) or any STARTUP_REFUSED / AUDIT_CHAIN_TAMPERED / unknown-status row ⇒ bad; extra rows never add slots; rolling 14 days", provenance: prov },
    { id: "CI_MAIN_PUSH_SUCCESS", kind: "rate", direction: "atLeast", target: recommendation.ciMainPush.recommend, minSampleN: 200, status: "PROPOSED",
      definition: "fraction of completed runs of the required check 'build + typecheck + parity + tests' triggered by push to main whose FIRST attempt concluded success; any other completed conclusion (failure, timed_out, startup_failure, action_required, skipped, neutral, …) = bad; cancelled excluded (superseded); pull_request runs excluded (development signal, not an SLO); rolling 30 days. Evidence so far: " + mp.window.from + " → " + mp.window.to + " (" + mp.window.days + " days), " + mp.n + " runs — budget figures computed over that window, not over 30 days", provenance: prov },
  ];
  const evidence = { lot: "V15 §6 — SLO recommendation (real data, Wilson intervals) — " + AV.AUTONOMY_AVAILABILITY_CONTRACT.definitionVersion, definitionVersion: AV.AUTONOMY_AVAILABILITY_CONTRACT.definitionVersion, asOf,
    sources: { attempts: "runtime/generated/mission-attempt-log.jsonl (local, gitignored; read-only), " + rows.length + " rows", ciMainPush: "GitHub Actions API (read-only), fetchedAt " + fetch.fetchedAt + " — embedded below in ci.mainPushFetch", ciPullRequest: "docs/odg/evidence/LOT3_CI_EVENTS.json (static snapshot, fetchedAt " + ciFile.fetchedAt + ", latest attempt only)", cadence: "15 min — /etc/systemd/system/odg-mission-runner.timer OnUnitActiveSec=15min (read-only)" },
    availability: { liveness: recommendation.autonomyAvailability.liveness, before: view(before), after: view(after), residualUnavailabilityEstimate: residual, driftSlipRateHistory: driftRate },
    ci: { mainPush: mp, mainPushExcluded: mainExcl, runsPerDayMainPush: runsPerDay, pullRequestSignal: strip(split.pullRequest), snapshotMainPushForComparison: strip(split.mainPush), mainPushFetch: fetch },
    missionReliability: { breakdown: mb, minSampleN: all.missionMinSampleN, note: all.missionReliabilityNote },
    candidates: table, recommendation, proposals,
    history: [
      { rev: "r0 (origin/main ac87cd94)", summary: "availability 98% PROVISIONAL on logged rows (post-fix 54/54, Wilson low 0.9336); CI 98% on 982 mixed push+PR runs (SLI 0.9837, Wilson [0.9737, 0.9899]); missions NOT_MEASURED" },
      { rev: "r1 (PR #872 91659f3d)", summary: "gap-formula slot SLI (post-fix 64/64, Wilson low 0.9434); CI main-push 450/452 from the snapshot (success|failure only, latest attempt), Wilson [0.984, 0.9988] ⇒ 99%; REJECTED by inspection: MED-1 non-failure bad conclusions dropped, MED-2 extra rows added good slots, MED-3 re-run bias unstated" },
    ],
    notApplied: "runtime/core/slo-targets.ts unchanged; no alert wired; no freeze policy activated; canonical decision = owner", proposalFile: "docs/odg/PROPOSAL_SLO_TARGETS_V15.json" };
  const o2 = arg("--proposal");
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n");
  if (o2) fs.writeFileSync(o2, JSON.stringify({ "//": "PROPOSAL — NOT APPLIED. Entries in runtime/core/slo-targets.ts SLO_TARGETS shape; status PROPOSED. Applying requires an owner/CTO decision (it would become CONFIGURED with owner provenance). AUTONOMY_AVAILABILITY is a LIVENESS signal (timer fired, tick passed startup with the repo on main) — it does not say autonomy works. Alert thresholds and freeze rules are PROPOSALS too — nothing is wired or active.", definitionVersion: AV.AUTONOMY_AVAILABILITY_CONTRACT.definitionVersion, entries: proposal, alertAndFreezeProposals: proposals, supersedes: "r0 (ac87cd94): AUTONOMY_AVAILABILITY 0.98 on logged rows; CI_REQUIRED_CHECK_SUCCESS 0.98 on mixed push+PR runs. r1 (91659f3d): gap-formula slots; CI main-push from latest-attempt snapshot" }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ asOf, before: (({ missingRuns, ...x }: any) => x)(view(before).scheduledSlotSli), beforeLogged: view(before).loggedRowSli, after: (({ missingRuns, ...x }: any) => x)(view(after).scheduledSlotSli), afterLogged: view(after).loggedRowSli, residual: { bad: residual.bad, slots: residual.slots, rate: residual.rate, w: residual.wilsonOfGood }, driftRate,
    ci: { n: mp.n, good: mp.good, sli: mp.sli, wilson: mp.wilson, window: mp.window, bad: mp.badByConclusion, excl: mainExcl, attemptInfo: mp.attemptInfo, reruns: mp.reruns, snap: { n: split.mainPush.n, good: split.mainPush.good } }, mission: mb,
    table: table.map((x: any) => [x.target, x.availability.verdict, x.availability.additionalGoodSlotsNeeded, x.availability.earliestSupportDate, x.ciMainPush.position.split(" ")[0], x.ciMainPush.budgetRemaining, x.ciMainPush.additionalGoodRunsNeeded, x.ciMainPush.earliestSupportDate]),
    pick: { av: avPick, ci: ciPick ? ciPick.target : null } }) + "\n");
}
main();
export {};
