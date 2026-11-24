#!/usr/bin/env node
"use strict";
/* Tests for odg-production-metric (V17.5 P5): NOT_MEASURED preservation (no trace / no budget / provider € / inspection
 * verdict time / unmerged PR), native €0 only from the GO STRATEGY rationale, native vs provider line split, deterministic
 * output; plus the committed record is reproduced from the committed sources + PR snapshot (history-dependent). */
const fs = require("fs");
const path = require("path");
const PM = require("./odg-production-metric.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const NM = (v: any) => !!v && v.status === "NOT_MEASURED" && typeof v.reason === "string" && v.reason.length > 0;

const trace = [
  { kind: "CYCLE_START", startedAt: "2026-01-01T00:00:00.000Z" },
  { kind: "STEP", step: "STRATEGY", status: "DONE", decision: { mode: "NATIVE", rationale: "every part LOCAL_OK ⇒ NATIVE (€0)" } },
  { kind: "DISPATCHED", mission: "X", runId: "r1", dispatchTarget: { writeSet: ["docs/odg/evidence/X.json"] } },
  { kind: "STEP", step: "EXECUTE", status: "EXECUTED_PASS", startedAt: "2026-01-01T00:00:01.000Z", endedAt: "2026-01-01T00:01:01.000Z" },
  { kind: "CYCLE_END", status: "EXECUTED_PASS", durationMs: 61000, endedAt: "2026-01-01T00:01:01.000Z", dispatchCalls: 1, providerLaunched: 0 },
  { kind: "CYCLE_END", status: "EXECUTED_PASS", durationMs: 99999, endedAt: "2026-01-01T00:09:00.000Z" },
];
const pr = (n: number, merged: boolean) => ({ number: n, state: merged ? "MERGED" : "CLOSED", createdAt: "2026-01-01T00:05:00Z", mergedAt: merged ? "2026-01-01T00:20:00Z" : null,
  commits: [{ oid: "aaaaaaaa1", committedDate: "2026-01-01T00:04:00Z", messageHeadline: "feat: x" }, { oid: "bbbbbbbb2", committedDate: "2026-01-01T00:10:00Z", messageHeadline: "fix: #1 inspection LOW" }],
  checks: [{ startedAt: "2026-01-01T00:11:00Z", completedAt: "2026-01-01T00:16:00Z", conclusion: "SUCCESS" }], reviews: [], comments: [] });
const commits = [{ sha: "a", providerTrailer: true, files: [{ path: "docs/odg/evidence/X.json", add: 100 }, { path: "runtime/bin/x.ts", add: 20 }] }, { sha: "b", providerTrailer: false, files: [{ path: "README", add: null }] }];
const mission = (withTrace: boolean, withValidation: boolean) => ({ id: "X", experiment: { path: "docs/odg/evidence/X.json", outcome: "FAIL", sha256: "s", run: { head: "h" } }, results: null,
  validation: withValidation ? { present: true, grade: "FAIL", bound: true, inspectionVerdict: "ACCEPT", inspectedPr: 1, source: "v#experimentInspection" } : { present: false },
  trace: withTrace ? trace : null, tracePath: "t.jsonl", caps: null, experimentPr: 1, validationPr: withValidation ? 2 : null, prCommits: { 1: commits } });

function main(): void {
  const t = PM.traceSummary(trace);
  check("trace: first CYCLE_END used (a repeated CYCLE_END is ignored)", t.cycleMs === 61000 && t.endedAt === "2026-01-01T00:01:01.000Z");
  check("trace: native €0 read from the STRATEGY rationale only", t.nativeEurFromTrace === 0 && PM.traceSummary(trace.filter((e: any) => e.step !== "STRATEGY")).nativeEurFromTrace === null);
  const r = PM.measureProduction({ missions: [mission(true, true)], prs: [pr(1, true), pr(2, true)], windowPrs: [1, 2] });
  const m = r.missions[0];
  check("provider € and € budget are NOT_MEASURED (never 0)", NM(m.cost.providerEngagedEur) && NM(m.cost.costAvailableEur));
  check("native engaged €0 carries its trace source", m.cost.nativeEngagedEur.value === 0 && /STRATEGY/.test(m.cost.nativeEngagedEur.source));
  check("accepted = merged AND inspection ACCEPT", m.outputsAccepted.accepted === true);
  check("lines: dispatched writeSet ⇒ native (100); others ⇒ provider (20); binary (null) ignored; code-native 0", m.share.lines.nativeWrittenLinesMerged === 100 && m.share.lines.providerLinesMerged === 20 && m.share.lines.nativeCodeLinesMerged === 0 && m.share.lines.nonProviderCommits === 1);
  const n = PM.measureProduction({ missions: [mission(false, false)], prs: [pr(1, true)], windowPrs: [1, 1] }).missions[0];
  check("no GO trace ⇒ GO cycle / execute / native € NOT_MEASURED, builtByOdg.goDispatched false", NM(n.time.goCycleMs) && NM(n.time.executeStepMs) && NM(n.cost.nativeEngagedEur) && n.share.builtByOdg.goDispatched === false);
  check("no validation ⇒ inspection NOT_MEASURED, grade PENDING, not accepted", NM(n.outputsAccepted.inspection) && n.outputsAccepted.validatedGrade === "PENDING" && n.outputsAccepted.accepted === false);
  const tl = PM.prTimeline(pr(3, true));
  check("PR timeline phases: open→last commit 5 min, queue 1 min, CI 5 min, wait 4 min; sum = open→merge", tl.openToLastCommitMs === 300000 && tl.lastCommitToCiStartMs === 60000 && tl.ciMs === 300000 && tl.ciEndToMergeMs === 240000 && tl.openToMergeMs === 900000);
  check("inspection verdict time NOT_MEASURED; finding commit gives an upper bound", NM(tl.inspectionVerdictAt) && tl.inspectionFindingCommits.length === 1 && NM(tl.preOpenBuildMs));
  const u = PM.prTimeline(pr(4, false));
  check("unmerged PR ⇒ open→merge NOT_MEASURED (not 0)", NM(u.openToMergeMs) && NM(u.ciEndToMergeMs));
  const x1 = JSON.stringify(PM.measureProduction({ missions: [mission(true, true)], prs: [pr(2, true), pr(1, true)], windowPrs: [1, 2] }));
  const x2 = JSON.stringify(PM.measureProduction({ missions: [mission(true, true)], prs: [pr(1, true), pr(2, true)], windowPrs: [1, 2] }));
  check("deterministic: PR order does not change the record", x1 === x2);

  const BIN = require("../bin/odg-v175-production-metric.ts");
  const root = path.resolve(__dirname, "..", "..");
  const committed = fs.readFileSync(path.join(root, "docs/odg/evidence/V175_PRODUCTION_METRIC.json"), "utf8");
  check("V175_PRODUCTION_METRIC.json is byte-identical to a fresh computation (--check)", committed === BIN.build());
  const rec = JSON.parse(committed);
  check("real record: provider € NOT_MEASURED for every mission", rec.missions.every((mm: any) => NM(mm.cost.providerEngagedEur)));
  check("real record: G not GO-dispatched (NOT_MEASURED run time); H, G2, J2 GO-dispatched", NM(rec.missions.find((mm: any) => mm.id === "G").time.goCycleMs) && ["H", "G2", "J2"].every((id) => rec.missions.find((mm: any) => mm.id === id).share.builtByOdg.goDispatched === true));
  check("real record: native-built CODE lines merged = 0 (GO writeSets are evidence data)", rec.windowShare.nativeCodeLinesMerged === 0);

  process.stdout.write(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
  if (failures) process.exit(1);
}
main();
export {};
