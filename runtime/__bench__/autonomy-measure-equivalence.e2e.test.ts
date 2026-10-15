#!/usr/bin/env node
/*
 * LOT autonomy-measure — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE: build:runtime compiles runtime/core/autonomy-measure.ts →
 * runtime/dist/core/autonomy-measure.js (LEAF, self-contained). Asserts all 10 exports BYTE-IDENTICAL
 * (frozen constants frozen) and exercises measureAutonomy / fromAttribution / fromExecution /
 * describeExecution / eligibilityFromObjectives across measurable + every fail-closed not-measurable
 * branch. No meaningful difference normalised.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/autonomy-measure-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "autonomy-measure.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "autonomy-measure.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT autonomy-measure — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/autonomy-measure.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/autonomy-measure.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["measureAutonomy", "fromAttribution", "fromExecution", "describeExecution", "eligibilityFromObjectives", "CATEGORY", "ACTOR", "KIND", "AUTHORED_BY"]) {
  check(js[x] !== undefined && ts[x] !== undefined, `both export ${x}`);
}
for (const c of ["CATEGORY", "ACTOR", "KIND", "AUTHORED_BY"]) {
  check(EQ(js[c], ts[c]) && Object.isFrozen(ts[c]), `${c} byte-identical + frozen`);
}

const unit = (o: any) => ({ eligible: true, authorized: true, verified: false, humanMandatory: false, status: "EXECUTED", kind: "ACTION", actor: "ODG", ...o });
// measureAutonomy scenarios.
const MA: Array<[string, any]> = [
  ["not array", 5],
  ["null denominator (none eligible)", [unit({ id: "a", eligible: false })]],
  ["measurable 1 ODG verified of 2", [unit({ id: "a", verified: true }), unit({ id: "b", actor: "OPERATOR" })]],
  ["duplicate id", [unit({ id: "a" }), unit({ id: "a" })]],
  ["malformed (missing id)", [unit({})]],
  ["bad status", [unit({ id: "a", status: "WAT" })]],
  ["bad kind", [unit({ id: "a", kind: "NOPE" })]],
  ["ambiguous unit", [unit({ id: "a", ambiguous: true })]],
  ["done ODG no actor ⇒ ambiguous attribution", [unit({ id: "a", actor: null })]],
  ["ODG applied by other ⇒ external", [unit({ id: "a", verified: true, appliedBy: "SOMEONE_ELSE" })]],
  ["human mandatory + failed + plan mix", [unit({ id: "a", humanMandatory: true }), unit({ id: "b", status: "FAILED" }), unit({ id: "c", kind: "PLAN" })]],
];
for (const [label, units] of MA) {
  check(EQ(js.measureAutonomy(units), ts.measureAutonomy(units)), `measureAutonomy ${label}: BYTE-IDENTICAL`);
}
check(Object.isFrozen(js.measureAutonomy([unit({ id: "a", verified: true })])), "measureAutonomy result frozen (ref)");

// fromAttribution.
{
  const attribution = { objectives: [
    { objectiveId: "o1", verdict: "EVIDENCED" }, { objectiveId: "o2", verdict: "RECORDED-NO-EVIDENCE" },
    { objectiveId: "o3", verdict: "FAILED" }, { objectiveId: "o4", verdict: "INCONSISTENT" }, { objectiveId: "o5", verdict: "WAT" },
  ] };
  const meta = { o1: { eligible: true, authorized: true, actor: "ODG" }, o2: { eligible: false }, o4: { eligible: true, authorized: true, actor: "ODG" } };
  check(EQ(js.fromAttribution(attribution, meta), ts.fromAttribution(attribution, meta)), "fromAttribution BYTE-IDENTICAL (evidenced/excluded/missing-meta/inconsistent)");
}
// fromExecution.
{
  const pe = { executed: [
    { objectiveId: "o1", status: "APPLIED", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" },
    { objectiveId: "o2", status: "APPLIED", authoredBy: "UNKNOWN" },
    { objectiveId: "o3", status: "FAILED", authoredBy: "PROVIDER" },
    { objectiveId: "o4", status: "APPLIED" }, { objectiveId: "o4", status: "DONE" },
  ] };
  const attr = { objectives: [{ objectiveId: "o1", verdict: "EVIDENCED" }] };
  const elig = { o1: { eligible: true, authorized: true }, o2: { eligible: true, authorized: true }, o3: { eligible: true, authorized: true }, o5: { eligible: true, authorized: true } };
  check(EQ(js.fromExecution(pe, attr, elig, { runComplete: true }), ts.fromExecution(pe, attr, elig, { runComplete: true })), "fromExecution(runComplete) BYTE-IDENTICAL (dup/absent/unknown-author)");
  check(EQ(js.fromExecution(pe, attr, elig), ts.fromExecution(pe, attr, elig)), "fromExecution(no opts ⇒ absent=ambiguous) BYTE-IDENTICAL");
}
// describeExecution.
{
  const pe = { executed: [
    { objectiveId: "o1", status: "DONE", authoredBy: "ODG_CAPABILITY" },
    { objectiveId: "o2", status: "DONE", authoredBy: "PROVIDER" },
    { objectiveId: "o3", status: "BLOCKED" }, { objectiveId: "o4", humanMandatory: true, status: "DONE" },
    { objectiveId: "o5", status: "PENDING" }, { objectiveId: "o1", status: "DONE" },
  ] };
  const attr = { objectives: [{ objectiveId: "o1", verdict: "EVIDENCED" }] };
  check(EQ(js.describeExecution(pe, attr), ts.describeExecution(pe, attr)) && Object.isFrozen(ts.describeExecution(pe, attr)), "describeExecution BYTE-IDENTICAL + frozen (incl. inconsistent join)");
}
// eligibilityFromObjectives.
{
  const objs = [
    { id: "o1", authorization: { eligible: true, authorized: true } },
    { id: "o2", authorization: { excluded: true, reason: "out of scope" } },
    { id: "o3", authorization: { excluded: true } }, // unjustified ⇒ missing
    { id: "o4" }, // no declaration ⇒ missing
    { authorization: { eligible: true, authorized: true } }, // no id ⇒ (no id)
    { id: "o6", authorization: { eligible: true, authorized: "yes" } }, // non-boolean ⇒ missing
  ];
  check(EQ(js.eligibilityFromObjectives(objs), ts.eligibilityFromObjectives(objs)), "eligibilityFromObjectives BYTE-IDENTICAL (valid/justified-excl/unjustified/missing/non-bool)");
  check(js.eligibilityFromObjectives(objs).complete === false, "eligibilityFromObjectives: complete=false when missing present");
}

console.log(failures === 0 ? "ALL PASS — LOT autonomy-measure EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
