#!/usr/bin/env node
"use strict";
/* V375 Lot A — measure autonomy availability on the REAL mission-attempt-log (before/after the worktree discipline) and
 * compare CANDIDATE SLOs (97/98/98.5/99 %) on two separate journeys: autonomy availability and required-CI success.
 * Nothing is configured: slo-targets is NOT modified; no freeze policy is activated (owner decision).
 * Usage: [--attempts <mission-attempt-log.jsonl>] [--write <path>] */
const fs = require("fs"); const path = require("path");
const AV = require("../core/odg-autonomy-availability.js");
const EB = require("../core/odg-slo-error-budget-view.js");
function main() {
  const argv = process.argv.slice(2); const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const attemptsPath = arg("--attempts") || "runtime/generated/mission-attempt-log.jsonl"; const out = arg("--write");
  const rows = fs.readFileSync(attemptsPath, "utf8").split("\n").filter((l: string) => l.trim()).map((l: string) => JSON.parse(l));
  const CUTOVER = "2026-11-22T02:00:00Z";   // after the last observed organizational refusal (01:38Z); worktree-only work from then on
  const before = AV.summarize(rows, { from: "2026-11-16T00:00:00Z", to: CUTOVER });
  const after = AV.summarize(rows, { from: CUTOVER });
  const all = AV.summarize(rows);
  const SLOS = [0.97, 0.98, 0.985, 0.99];
  const avEv = AV.toEvents(rows.filter((r: any) => r.recordedAt >= "2026-11-08T00:00:00Z"));
  const ci = JSON.parse(fs.readFileSync("docs/odg/evidence/LOT3_CI_EVENTS.json", "utf8"));
  const ciEv = ci.runs.filter((r: any) => r.conclusion === "success" || r.conclusion === "failure").map((r: any) => ({ t: r.t, good: r.conclusion === "success", change: r.change }));
  const days = (ev: any[]) => Math.max(1, Math.round((Date.parse(ev[ev.length - 1].t) - Date.parse(ev[0].t)) / 86400000));
  const compare = (ev: any[]) => SLOS.map((slo) => { const a = EB.eventBudgetAnalysis(ev, { sloTarget: slo, windowDays: days(ev) });
    return { slo, sli: a.sli.value, allowedBad: a.errorBudget.allowedBad, actualBad: a.errorBudget.actualBad, remainingFraction: a.errorBudget.remainingFraction, exhausted: a.errorBudget.exhausted, exhaustedOn: a.earlyWarning.exhaustedOn, firstBurnAlert: a.earlyWarning.firstAlertDay }; });
  const evidence = {
    lot: "V375 Lot A — autonomy availability (G0) + SLO candidate comparison (G1)",
    source: { attempts: "runtime/generated/mission-attempt-log.jsonl (local, gitignored; read-only)", rows: rows.length, ci: "docs/odg/evidence/LOT3_CI_EVENTS.json" },
    refusalCauses: all.counts,
    beforeAfter: { cutover: CUTOVER, before, after,
      note: "before = 2026-11-16 → cutover (development sessions switched branches in the main worktree); after = worktree-only work. 'after' is a SHORT window — the main-worktree guard (this PR) is what makes it structural." },
    sloCandidates: { autonomyAvailability: { window: [avEv[0].t, avEv[avEv.length - 1].t], events: avEv.length, compare: compare(avEv) },
      ciRequiredCheck: { window: [ciEv[0].t, ciEv[ciEv.length - 1].t], events: ciEv.length, compare: compare(ciEv) } },
    separation: { availability: "tick passed startup (any refusal = unavailable)", missionReliability: all.missionReliabilityNote, ci: "required check success among decisive runs" },
    notConfigured: "no SLO written to slo-targets; no freeze policy activated — owner decision",
  };
  const json = JSON.stringify(evidence, null, 2) + "\n";
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, json); }
  process.stdout.write(JSON.stringify({ before: { total: before.total, availability: before.availability, org: before.counts.REFUSED_ORGANIZATIONAL }, after: { total: after.total, availability: after.availability, org: after.counts.REFUSED_ORGANIZATIONAL },
    avail: evidence.sloCandidates.autonomyAvailability.compare.map((c: any) => [c.slo, c.sli, c.exhausted]), ci: evidence.sloCandidates.ciRequiredCheck.compare.map((c: any) => [c.slo, c.remainingFraction, c.exhausted]) }) + "\n");
}
main();
export {};
