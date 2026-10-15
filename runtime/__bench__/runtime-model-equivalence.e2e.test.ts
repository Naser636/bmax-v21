#!/usr/bin/env node
/*
 * LOT runtime-model — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE (no writes): build:runtime compiles runtime/core/runtime-model.ts →
 * runtime/dist/core/runtime-model.js (LEAF, self-contained). computeRuntimeModel(root) reads on-disk
 * artefacts under `root` and is timestamp-free, so the SAME root ⇒ identical model. Asserts
 * BYTE-IDENTICAL JS≡TS on (1) the REAL repo root, (2) seeded temp roots exercising the queue ordering /
 * proven / incomplete-contract / pipeline-brain-foundation branches, and (3) an empty root.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/runtime-model-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "runtime-model.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "runtime-model.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function W(p: string, obj: unknown): void { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj)); }

console.log("LOT runtime-model — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/runtime-model.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/runtime-model.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.computeRuntimeModel === "function" && typeof ts.computeRuntimeModel === "function", "both export computeRuntimeModel");

// (1) REAL repo root — the full model over the actual artefacts must be byte-identical.
check(EQ(js.computeRuntimeModel(REPO), ts.computeRuntimeModel(REPO)), "computeRuntimeModel(REAL repo root) BYTE-IDENTICAL JS≡TS");

const roots: string[] = [];
function seededRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rm-bench-"));
  roots.push(root);
  const M = (n: string, o: unknown) => W(path.join(root, "runtime", "missions", n + ".json"), o);
  // proven foundation + an executable-unproven mission + an evidence-pack (SKIPPED) + a no-objective mission (NEEDS_CONTRACT)
  M("M0000", { objectives: ["seed"] });
  M("M0001", { objectives: ["seed"] });
  M("M0002", { objectives: ["seed"] });
  M("BUILD_X", { objectives: [{ id: "BX1", goal: "do build x" }], requires_engineering: true, priority: "HIGH" });
  M("A_ALPHA", { objectives: [{ id: "A1", goal: "alpha" }] });
  M("EVPACK", { evidencePackContractVersion: "1.0", objectives: [] });
  M("NOOBJ_MISSION", { objectives: [] });
  W(path.join(root, "runtime", "generated", "mission-ledger.json"), { entries: [
    { mission: "M0000", proven: true }, { mission: "M0001", proven: true }, { mission: "M0002", proven: true },
  ] });
  W(path.join(root, "runtime", "generated", "mission-report.json"), { mission: "BUILD_X", status: "BLOCKED", validated: false });
  W(path.join(root, "runtime", "governance", "ROADMAP.json"), { missions: [{ id: "BUILD_X" }, { id: "A_ALPHA" }] });
  W(path.join(root, "runtime", "generated", "runtime-verify.json"), { build: true, typescript: true });
  W(path.join(root, "runtime", "generated", "runtime-pipeline.json"), [{ stage: "s1" }]);
  W(path.join(root, "runtime", "brain", "MASTER_PLAN.md"), "# plan\n");
  // FIX nomination for the NEEDS_CONTRACT mission
  W(path.join(root, "runtime", "missions", "pending", "FIX_NOOBJ_MISSION.json"), { fix: true });
  return root;
}
// (2) rich seeded root — exercises roadmap ordering, proven, queue, outstanding, pipeline/brain/foundation.
{
  const root = seededRoot();
  const j = js.computeRuntimeModel(root), t = ts.computeRuntimeModel(root);
  check(EQ(j, t), "computeRuntimeModel(seeded rich root) BYTE-IDENTICAL JS≡TS");
  // Semantic spot-checks on the JS reference (== TS by byte-identity).
  check(j.foundation === "READY" && j.pipeline === "READY" && j.brain === "READY", "seeded: foundation/pipeline/brain READY");
  check(EQ(j.queue.map((q: any) => q.mission), ["BUILD_X", "A_ALPHA"]), "seeded: queue in roadmap order (BUILD_X then A_ALPHA)");
  check(j.outstanding.length === 1 && j.outstanding[0].mission === "NOOBJ_MISSION" && j.outstanding[0].repairNominated === true, "seeded: NOOBJ_MISSION outstanding + repairNominated");
  check(j.converged === false && j.nextMission === "BUILD_X", "seeded: not converged, nextMission=BUILD_X");
  const ev = j.scan.incompleteContracts.find((c: any) => c.mission === "EVPACK");
  check(ev && ev.disposition === "SKIPPED" && ev.kind === "evidence-pack", "seeded: EVPACK classified SKIPPED (evidence-pack)");
}
// (3) empty root — missing artefacts ⇒ UNKNOWN health, SYSTEM_READY.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rm-empty-")); roots.push(root);
  const j = js.computeRuntimeModel(root), t = ts.computeRuntimeModel(root);
  check(EQ(j, t), "computeRuntimeModel(empty root) BYTE-IDENTICAL JS≡TS");
  check(j.pipeline === "UNKNOWN" && j.brain === "UNKNOWN" && j.nextMission === "SYSTEM_READY" && j.converged === true, "empty root: UNKNOWN health, SYSTEM_READY, converged");
}
for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort */ } }

console.log(failures === 0 ? "ALL PASS — LOT runtime-model EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
