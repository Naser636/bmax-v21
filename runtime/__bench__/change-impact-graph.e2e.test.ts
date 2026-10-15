#!/usr/bin/env node
/*
 * LOT change-impact-graph — deterministic unit test (§U Phase-1 #1).
 *
 * NEW read-only capability (not a JS→TS parity port — no .js twin). Proves: the graph reproduces the
 * full-closure/hazard/consumer/impacted-test survey hand-run every migration mission (V22/V24/V31–V36),
 * is deterministic, and performs ZERO writes. Offline, pure.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/change-impact-graph.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const { buildGraph, impactOf } = require(path.join(REPO, "runtime", "core", "change-impact-graph.ts"));

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT change-impact-graph — deterministic unit test");

// ── NO-WRITE PROOF: fs mutators throw during the whole run; any write ⇒ the module FAILS loudly. ──
const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync, realMkdir = fs.mkdirSync, realRm = fs.rmSync;
let writeAttempts = 0;
const trap = (orig: any, n: string) => ((...a: any[]) => { writeAttempts++; throw new Error(`UNEXPECTED WRITE via fs.${n}`); });
(fs as any).writeFileSync = trap(realWrite, "writeFileSync");
(fs as any).appendFileSync = trap(realAppend, "appendFileSync");
(fs as any).mkdirSync = trap(realMkdir, "mkdirSync");
(fs as any).rmSync = trap(realRm, "rmSync");

// Snapshot runtime/core listing (name+size) before, to prove the tree is untouched.
function coreHash(): string {
  const dir = path.join(REPO, "runtime", "core");
  const h = crypto.createHash("sha256");
  for (const f of fs.readdirSync(dir).sort()) h.update(f + ":" + fs.statSync(path.join(dir, f)).size + ";");
  return h.digest("hex");
}
const before = coreHash();

let graph: any, oa: any, capfac: any, email: any, brec: any, astore: any, strans: any, ghost: any, oa2: any;
try {
  graph = buildGraph(REPO);
  oa = impactOf(REPO, "objective-attribution");
  capfac = impactOf(REPO, "capability-factory");
  email = impactOf(REPO, "email-gateway");
  brec = impactOf(REPO, "build-recovery-engine");
  astore = impactOf(REPO, "autonomy-store");
  strans = impactOf(REPO, "state-transition");
  ghost = impactOf(REPO, "no-such-module-xyz");
  oa2 = impactOf(REPO, "objective-attribution");
} finally {
  (fs as any).writeFileSync = realWrite; (fs as any).appendFileSync = realAppend; (fs as any).mkdirSync = realMkdir; (fs as any).rmSync = realRm;
}
check(writeAttempts === 0, "NO-WRITE: module performed zero fs mutations during buildGraph + 8 impactOf calls");
check(coreHash() === before, "NO-WRITE: runtime/core tree byte-listing unchanged (name+size hash identical)");

// 1. graph shape: nodes present, every dep/consumer edge is symmetric.
check(Array.isArray(graph.modules) && graph.modules.includes("state-transition") && graph.modules.includes("objective-attribution"), "graph: core module nodes present");
let symmetric = true;
for (const m of graph.modules) for (const d of graph.deps[m]) if (!graph.consumers[d].includes(m)) symmetric = false;
check(symmetric, "graph: deps/consumers edges are symmetric (reverse index consistent)");

// 2. objective-attribution — clean closure (V33: no dynamic/external/path hazard), has consumers + tests.
check(oa.exists && oa.closureHazards.dynamicRequire === false && oa.closureHazards.externalRequire === false && oa.closureHazards.pathHazard === false, "objective-attribution: closure HAZARD-FREE (matches V33 manual audit)");
check(oa.transitiveClosure.includes("objective-attribution") && oa.transitiveClosure.includes("capability-probes"), "objective-attribution: closure includes self + capability-probes dep");
check(oa.impactedTests.some((t: string) => /objective-attribution/.test(t)), "objective-attribution: impactedTests include its own test(s)");

// 3. capability-factory — dynamic require hazard (V22: require(abs)).
check(capfac.exists && capfac.closureHazards.dynamicRequire === true && capfac.closureHazards.modules.includes("capability-factory"), "capability-factory: closure DYNAMIC-REQUIRE hazard (matches V22)");

// 4. email-gateway — external-package require hazard (V24: imapflow).
check(email.exists && email.closureHazards.externalRequire === true && email.closureHazards.modules.includes("email-gateway"), "email-gateway: closure EXTERNAL-REQUIRE hazard (matches V24)");

// 5. build-recovery-engine — path hazard (__dirname/REPO_ROOT; hazard-blocked).
check(brec.exists && brec.closureHazards.pathHazard === true, "build-recovery-engine: closure PATH hazard (matches hazard-blocked)");

// 6. consumers (reverse deps) match known dependents.
check(astore.exists && astore.consumers.includes("capability-metrics") && astore.consumers.includes("patch-memory") && astore.consumers.includes("capability-learning"), "autonomy-store: consumers include capability-metrics/patch-memory/capability-learning (known)");
check(strans.exists && strans.consumers.includes("artifact-state") && strans.consumers.includes("world-model") && strans.consumers.includes("git-branch-integration") && strans.consumers.includes("self-diagnostic"), "state-transition: consumers include artifact-state/world-model/git-branch-integration/self-diagnostic (known)");

// 7. nonexistent module ⇒ exists:false, empty report (fail-safe).
check(ghost.exists === false && ghost.transitiveClosure.length === 0 && ghost.consumers.length === 0, "unknown module ⇒ exists:false empty report (fail-safe)");

// 8. determinism: same query twice ⇒ byte-identical.
check(JSON.stringify(oa) === JSON.stringify(oa2), "determinism: impactOf twice ⇒ byte-identical");

console.log(failures === 0 ? "ALL PASS — LOT change-impact-graph" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
