#!/usr/bin/env node
/*
 * LOT capability-probes — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, HERMETIC: build:runtime compiles runtime/core/capability-probes.ts →
 * runtime/dist/core/capability-probes.js; build-dist-closure co-locates its deps (capability-executors.js,
 * state-transition.js, mission-synthesizer.js + their closure — all verified dynamic/external-require FREE).
 * Every probe is a PURE READ over cwd-relative evidence files + injected ctx: a seeded temp cwd makes
 * runProbe/evaluate/evaluateObjectiveProofs fully deterministic ⇒ BYTE-IDENTICAL. NO real network, NO write
 * (probes only read); runStartedAtMs (mtime freshness) is omitted so the content path stays deterministic.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/capability-probes-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "capability-probes.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "capability-probes.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT capability-probes — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/capability-probes.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/capability-probes.js emitted");
for (const dep of ["capability-executors.js", "state-transition.js", "mission-synthesizer.js"]) {
  check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", dep)), `prerequisite: dep ${dep} co-located in dist by build-dist-closure`);
}

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["PROBES", "runProbe", "evaluate", "evaluateObjectiveProofs", "CONNECTIVITY_EVIDENCE"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(js.CONNECTIVITY_EVIDENCE === ts.CONNECTIVITY_EVIDENCE, "CONNECTIVITY_EVIDENCE constant identical");
check(EQ(Object.keys(js.PROBES).sort(), Object.keys(ts.PROBES).sort()) && Object.keys(js.PROBES).length === 19, "PROBES registry: identical 19 probe names");

// unknown probe.
check(EQ(js.runProbe("no-such", {}), ts.runProbe("no-such", {})) && js.runProbe("no-such", {}).ok === false, "runProbe(unknown) ⇒ not-ok identical");

// ctx-only probes (no fs): build-green / typescript-green.
for (const [ev, ctx] of [["build-green", { verify: { build: true } }], ["build-green", { verify: {} }], ["typescript-green", { verify: { typescript: true } }], ["typescript-green", {}]] as Array<[string, any]>) {
  check(EQ(js.runProbe(ev, ctx), ts.runProbe(ev, ctx)), `runProbe(${ev}, ctx) BYTE-IDENTICAL`);
}

const origCwd = process.cwd();
const temps: string[] = [];
function seed(files: Record<string, any>): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "cprobe-")); temps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(d, rel); fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof body === "string" ? body : JSON.stringify(body));
  }
  return d;
}
// Run the same evidence name against BOTH libs in the SAME seeded cwd (both read identical files).
function same(ev: string, cwd: string, ctx: any = {}): void {
  process.chdir(cwd);
  try { check(EQ(js.runProbe(ev, ctx), ts.runProbe(ev, ctx)), `runProbe(${ev}) @seeded BYTE-IDENTICAL (ok=${js.runProbe(ev, ctx).ok})`); }
  finally { process.chdir(origCwd); }
}
try {
  // internet-reachable: absent evidence (MISSING) + reachable + not-reachable.
  same("internet-reachable", seed({}));
  same("internet-reachable", seed({ "runtime/generated/connectivity-audit.json": { internet: { reachable: true }, summary: { http: "2/2" } } }));
  same("internet-reachable", seed({ "runtime/generated/connectivity-audit.json": { internet: { reachable: false } } }));
  // research-acquired: absent + dry-run(acquired:false) + fully-provenanced acquired:true.
  same("research-acquired", seed({}));
  same("research-acquired", seed({ "runtime/generated/external-research.json": { mode: "DRY_RUN", acquired: false, sources: [] } }));
  same("research-acquired", seed({ "runtime/generated/external-research.json": { acquired: true, sources: [{ url: "https://x", fetched_at: "2026-01-01", http_status: 200, content_hash: "a".repeat(64), bytes: 10, evidence_ref: "e" }], ranked: [{ name: "r", sources: ["https://x"] }] } }));
  // external-research-dry-run-planned: valid dry-run plan + wrong mode.
  same("external-research-dry-run-planned", seed({ "runtime/generated/external-research.json": { mode: "DRY_RUN", acquired: false, sources: [], ranked: [], objective: "O1" } }));
  same("external-research-dry-run-planned", seed({ "runtime/generated/external-research.json": { mode: "LIVE", acquired: true } }));
  // git-branch-integrated: absent + a VERIFIED C03 integrated evidence + a dry-run.
  const t = { state_before: { target: "dev", version: 0 }, action: { kind: "git", target: "dev" }, observed_effect: { to: "SHA2", commits_advanced: 2 }, state_after: { target: "dev", targetSha: "SHA2", version: 2 }, state_version_before: 0, state_version_after: 2, difference: { x: 1 }, evidence_refs: ["e"], verification_status: "VERIFIED" };
  same("git-branch-integrated", seed({}));
  same("git-branch-integrated", seed({ "runtime/generated/git-branch-integration.json": { outcome: "INTEGRATED", integrated: true, pushed: false, merge_commit: false, target: "dev", state_transition: t } }));
  same("git-branch-integrated", seed({ "runtime/generated/git-branch-integration.json": { outcome: "DRY_RUN", integrated: false } }));
  // clean-workspace-scanned: valid + deleted!=0.
  same("clean-workspace-scanned", seed({ "runtime/generated/clean-workspace-scan.json": { objective: "CLEAN_WORKSPACE_1", candidateCount: 2, candidates: ["a", "b"], deleted: 0 } }));
  same("clean-workspace-scanned", seed({ "runtime/generated/clean-workspace-scan.json": { objective: "CLEAN_WORKSPACE_1", candidateCount: 0, candidates: [], deleted: 3 } }));
  // deterministic DoD probes read real repo files; in a seeded temp cwd (absent) ⇒ deterministic not-ok.
  for (const ev of ["legacy-runtime-retired", "samurai-output-mode", "single-runtime-entrypoint", "capability-probes-finalized", "fleet-request-validated", "autonomy-observability-verified", "spec-schema-valid", "bash-command-governed"]) {
    same(ev, seed({}), { missionId: "M1" });
  }
} finally {
  process.chdir(origCwd);
  for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

// evaluate: required blocks, optional never blocks.
check(EQ(js.evaluate([{ capability: "B", evidence: "build-green" }], { verify: { build: false } }), ts.evaluate([{ capability: "B", evidence: "build-green" }], { verify: { build: false } })), "evaluate(required failing) BYTE-IDENTICAL");
{
  const r = js.evaluate([{ capability: "B", evidence: "build-green" }], { verify: { build: false } });
  check(r.ok === false && r.missingRequired.length === 1, "evaluate: required missing ⇒ ok:false, blocks");
  const o = js.evaluate([{ capability: "B", evidence: "build-green", required: false }], { verify: { build: false } });
  check(o.ok === true, "evaluate: optional failing ⇒ never blocks (ok:true)");
}
check(EQ(js.evaluate([], {}), ts.evaluate([], {})) && js.evaluate([], {}).ok === true, "evaluate([]) ⇒ ok:true (both)");

// evaluateObjectiveProofs: declared/skipped/failing, injected runner (hermetic).
const runner = (name: any) => ({ ok: name === "good", detail: name });
const objs = [{ id: "o1", proof: "good" }, { id: "o2", proof: "bad" }, { id: "o3" /* no proof ⇒ skipped */ }];
check(EQ(js.evaluateObjectiveProofs(objs, {}, runner), ts.evaluateObjectiveProofs(objs, {}, runner)), "evaluateObjectiveProofs (injected runner) BYTE-IDENTICAL");
{
  const r = js.evaluateObjectiveProofs(objs, {}, runner);
  check(r.results.length === 2 && r.ok === false && r.failing.length === 1, "evaluateObjectiveProofs: o3 skipped, o2 fails ⇒ ok:false");
}

console.log(failures === 0 ? "ALL PASS — LOT capability-probes EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
