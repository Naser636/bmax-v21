#!/usr/bin/env node
"use strict";
/* V375 Lot A — measure autonomy availability on the REAL mission-attempt-log (before/after the worktree discipline) and
 * compare CANDIDATE SLOs (97/98/98.5/99 %) on two separate journeys: autonomy availability and CI push-to-main success.
 * Nothing is configured: slo-targets is NOT modified; no freeze policy is activated (owner decision).
 * V15-SLI-DEFINITIONS: fail-closed status allowlist, scheduled-slot SLI (missing ticks = unavailable), CI main-push vs PR
 * split, mission breakdown with POLICY_REFUSED. When --write targets an existing evidence file produced under the previous
 * definitions, its headline numbers are carried into `history` (not silently overwritten).
 * Usage: [--attempts <mission-attempt-log.jsonl>] [--as-of <ISO>] [--write <path>] */
const fs = require("fs"); const path = require("path");
const AV = require("../core/odg-autonomy-availability.js");
const EB = require("../core/odg-slo-error-budget-view.js");
function main() {
  const argv = process.argv.slice(2); const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const attemptsPath = arg("--attempts") || "runtime/generated/mission-attempt-log.jsonl"; const out = arg("--write");
  const asOf = arg("--as-of") || new Date().toISOString();
  const rows = fs.readFileSync(attemptsPath, "utf8").split("\n").filter((l: string) => l.trim()).map((l: string) => JSON.parse(l));
  const CUTOVER = "2026-11-22T02:00:00Z";   // boundary chosen after the last observed STARTUP_REFUSED (01:38Z, a LEGITIMATE one); last ORGANIZATIONAL refusal was 2026-11-21T22:22:43Z; worktree-only work from then on
  const before = AV.summarize(rows, { from: "2026-11-16T00:00:00Z", to: CUTOVER });
  const after = AV.summarize(rows, { from: CUTOVER, asOf });
  const all = AV.summarize(rows, { asOf });
  const SLOS = [0.97, 0.98, 0.985, 0.99];
  const AV_FROM = "2026-11-08T00:00:00Z";
  const avEv = AV.toEvents(rows.filter((r: any) => r.recordedAt >= AV_FROM), { includeMissing: true, from: AV_FROM, asOf });
  const ci = JSON.parse(fs.readFileSync("docs/odg/evidence/LOT3_CI_EVENTS.json", "utf8"));
  const split = AV.ciSplit(ci.runs);
  const ciEv = ci.runs.filter((r: any) => r.event === "push" && r.change === "main" && (r.conclusion === "success" || r.conclusion === "failure")).map((r: any) => ({ t: r.t, good: r.conclusion === "success", change: r.sha }));
  const days = (ev: any[]) => Math.max(1, Math.round((Date.parse(ev[ev.length - 1].t) - Date.parse(ev[0].t)) / 86400000));
  const compare = (ev: any[]) => SLOS.map((slo) => { const a = EB.eventBudgetAnalysis(ev, { sloTarget: slo, windowDays: days(ev) });
    return { slo, sli: a.sli.value, allowedBad: a.errorBudget.allowedBad, actualBad: a.errorBudget.actualBad, remainingFraction: a.errorBudget.remainingFraction, exhausted: a.errorBudget.exhausted, exhaustedOn: a.earlyWarning.exhaustedOn, firstBurnAlert: a.earlyWarning.firstAlertDay }; });
  let history: any[] = [];
  if (out && fs.existsSync(out)) {
    try {
      const prev = JSON.parse(fs.readFileSync(out, "utf8"));
      if (Array.isArray(prev.history)) history = prev.history;
      if (!prev.definitionVersion) history = history.concat([{ definitionVersion: "V375-original (logged-row SLI, status denylist, mixed CI)", generatedAt: "≤ origin/main ac87cd94",
        rows: prev.source && prev.source.rows, refusalCauses: prev.refusalCauses,
        beforeAvailability: prev.beforeAfter && prev.beforeAfter.before && prev.beforeAfter.before.availability, afterAvailability: prev.beforeAfter && prev.beforeAfter.after && prev.beforeAfter.after.availability,
        afterTotal: prev.beforeAfter && prev.beforeAfter.after && prev.beforeAfter.after.total,
        ciEvents: prev.sloCandidates && prev.sloCandidates.ciRequiredCheck && prev.sloCandidates.ciRequiredCheck.events,
        ciSli: prev.sloCandidates && prev.sloCandidates.ciRequiredCheck && prev.sloCandidates.ciRequiredCheck.compare && prev.sloCandidates.ciRequiredCheck.compare[0].sli,
        note: "superseded by V15-SLI-DEFINITIONS: UNCLASSIFIED was 0 on the real log (no AUDIT_CHAIN_TAMPERED row exists), so D1 does not change the real-data availability; D2 adds missing scheduled slots; D3 removes pull_request runs from the CI SLI; AVAILABLE_EXECUTED_NOT_PASS is split into AVAILABLE_EXECUTED_FAIL + AVAILABLE_POLICY_REFUSED." }]);
    } catch { /* unreadable previous evidence ⇒ no history carried (stated) */ history = history.concat([{ note: "previous evidence unreadable — not carried" }]); }
  }
  const evidence = {
    lot: "V375 Lot A — autonomy availability (G0) + SLO candidate comparison (G1)", definitionVersion: AV.AUTONOMY_AVAILABILITY_CONTRACT.definitionVersion, asOf,
    source: { attempts: "runtime/generated/mission-attempt-log.jsonl (local, gitignored; read-only)", rows: rows.length, ci: "docs/odg/evidence/LOT3_CI_EVENTS.json (static snapshot, fetchedAt " + ci.fetchedAt + ")", cadence: "15 min (/etc/systemd/system/odg-mission-runner.timer OnUnitActiveSec=15min)" },
    refusalCauses: all.counts,
    beforeAfter: { cutover: CUTOVER, before, after,
      note: "before = 2026-11-16 → cutover (development sessions switched branches in the main worktree); after = worktree-only work. 'after' is a SHORT window — the main-worktree guard is what makes it structural. Both logged-row (availability) and scheduled-slot (scheduledSlot.sli) SLIs are reported; the scheduled-slot one is the SLO candidate." },
    sloCandidates: { autonomyAvailabilityScheduledSlot: { window: [AV_FROM, asOf], events: avEv.length, missingTickEvents: avEv.filter((e: any) => e.change === "UNAVAILABLE_MISSING_TICK").length, compare: compare(avEv) },
      ciMainPush: { window: [split.mainPush.window.from, split.mainPush.window.to], events: ciEv.length, compare: compare(ciEv) },
      ciPullRequestSignal: { role: split.pullRequest.role, n: split.pullRequest.n, good: split.pullRequest.good, sli: split.pullRequest.sli, window: split.pullRequest.window } },
    separation: { availability: "tick passed startup (allowlisted post-startup status); refusals, integrity, unknown statuses and missing slots = unavailable", missionReliability: all.missionReliabilityNote, missionBreakdown: all.missionBreakdown, ci: "push-to-main decisive runs (PR runs = development signal, not an SLO)" },
    notConfigured: "no SLO written to slo-targets; no freeze policy activated — owner decision",
    history,
  };
  const json = JSON.stringify(evidence, null, 2) + "\n";
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, json); }
  process.stdout.write(JSON.stringify({ before: { total: before.total, availability: before.availability, slotSli: before.scheduledSlot.sli, missing: before.scheduledSlot.missingTicks, org: before.counts.REFUSED_ORGANIZATIONAL },
    after: { total: after.total, availability: after.availability, slotSli: after.scheduledSlot.sli, missing: after.scheduledSlot.missingTicks, org: after.counts.REFUSED_ORGANIZATIONAL },
    avail: evidence.sloCandidates.autonomyAvailabilityScheduledSlot.compare.map((c: any) => [c.slo, c.sli, c.exhausted]), ci: evidence.sloCandidates.ciMainPush.compare.map((c: any) => [c.slo, c.remainingFraction, c.exhausted]) }) + "\n");
}
main();
export {};
