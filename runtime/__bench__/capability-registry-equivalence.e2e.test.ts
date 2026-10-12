// @ts-nocheck
/*
 * LOT η3-B1 — CAPABILITY-REGISTRY EQUIVALENCE + PATH PROOF: historical .js vs compiled-from-TS .js.
 * ====================================================================================================
 *
 * capability-registry is a side-effecting PIPELINE STAGE (no exports): run as `node <file>` it derives the
 * global registry from runtime-model and writes runtime/generated/capability-registry.json. η3-B1 migrates it
 * to a strict TypeScript canonical (runtime/core/capability-registry.ts ⇒ compiled runtime/dist/core/
 * capability-registry.js) and fixes the ONE path concern the stage-base-routing lot (η1-B1) surfaced and
 * deferred: the historical script derives ROOT from `path.resolve(__dirname,"..","..")`, so a copy relocated to
 * runtime/dist/core wrote its artifact to the WRONG tree (runtime/dist/generated). The port uses process.cwd()
 * — equal to the historical root when launched from runtime/core, and STILL correct from runtime/dist/core.
 *
 * This bench proves TWO things on isolated, equivalent fixtures (offline, no node_modules needed by the child):
 *   1. BEHAVIOURAL PARITY — legacy (runtime/core) and compiled (runtime/dist/core), each run in its own
 *      sandbox seeded with byte-identical fixtures, write capability-registry.json with identical content
 *      after normalising ONLY the intrinsically volatile `generatedAt` wall-clock field. The fixtures are
 *      chosen so the model is NON-trivial (capabilities AND missingCapabilities both non-empty) — parity is a
 *      real comparison, not two empty objects.
 *   2. PATH PROOF (the reason this lot exists) — the compiled module is executed FROM runtime/dist/core with
 *      cwd = sandbox root; its artifact MUST appear at runtime/generated/capability-registry.json and MUST NOT
 *      appear under runtime/dist/generated/. Because the file physically lives in runtime/dist/core, that
 *      outcome is only possible if ROOT is process.cwd() (the fix) and not __dirname-derived (the old bug).
 *      This observes the REAL executed path, not a config declaration.
 *
 * ISOLATION: throwaway os.tmpdir() sandboxes OUTSIDE the repo (asserted). The real repository is never written.
 * runtime-model.js (the stage's only sibling dependency; it requires just fs+path) is co-located next to the
 * compiled stage in dist/core so the relocated require("./runtime-model") resolves.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/capability-registry-equivalence.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/** Fixtures that make computeRuntimeModel produce a NON-trivial deterministic model.
 *  Ledger: M0000+M0001 proven ⇒ capabilities=["M0000","M0001"]. Contracts: those two + ALPHA (executable,
 *  unproven) ⇒ missingCapabilities=[{id:"ALPHA",...}]. Identical in every sandbox. */
function seedFixtures(root: string): void {
  const gen = path.join(root, "runtime", "generated");
  const missions = path.join(root, "runtime", "missions");
  const gov = path.join(root, "runtime", "governance");
  fs.mkdirSync(gen, { recursive: true });
  fs.mkdirSync(missions, { recursive: true });
  fs.mkdirSync(gov, { recursive: true });
  fs.writeFileSync(path.join(gen, "mission-ledger.json"), JSON.stringify({
    entries: [
      { mission: "M0000", proven: true },
      { mission: "M0001", proven: true },
    ],
  }, null, 2));
  const contract = (id: string, goal: string) => JSON.stringify({
    mission: id, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY",
    objectives: [{ id: `${id}_1`, goal }],
  }, null, 2);
  fs.writeFileSync(path.join(missions, "M0000.json"), contract("M0000", "seed zero"));
  fs.writeFileSync(path.join(missions, "M0001.json"), contract("M0001", "seed one"));
  fs.writeFileSync(path.join(missions, "ALPHA.json"), contract("ALPHA", "forward gap capability"));
  fs.writeFileSync(path.join(gov, "ROADMAP.json"), JSON.stringify({ missions: [{ id: "ALPHA" }] }, null, 2));
}

/** Sandbox with the legacy stage at runtime/core + its runtime-model.js sibling, fixtures seeded. */
function legacySandbox(): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-capreg-legacy-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  const core = path.join(sb, "runtime", "core");
  fs.mkdirSync(core, { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "core", "capability-registry.js"), path.join(core, "capability-registry.js"));
  fs.cpSync(path.join(REPO, "runtime", "core", "runtime-model.js"), path.join(core, "runtime-model.js"));
  seedFixtures(sb);
  return sb;
}

/** Sandbox with the COMPILED stage at runtime/dist/core + its runtime-model.js sibling, fixtures seeded.
 *  dist/core is a sibling-complete leaf: the compiled stage + the one JS module it require()s. */
function compiledSandbox(): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-capreg-compiled-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  const distCore = path.join(sb, "runtime", "dist", "core");
  fs.mkdirSync(distCore, { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist", "core", "capability-registry.js"), path.join(distCore, "capability-registry.js"));
  fs.cpSync(path.join(REPO, "runtime", "core", "runtime-model.js"), path.join(distCore, "runtime-model.js"));
  seedFixtures(sb);
  return sb;
}

function runStage(stageAbs: string, cwd: string): { code: number | null; out: string } {
  const env = { ...process.env };
  delete env.ODG_VERBOSE; delete env.ODG_FLEET;
  const r = spawnSync("node", [stageAbs], { cwd, encoding: "utf8", env });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

/** Read capability-registry.json and strip the volatile wall-clock field only. */
function readRegistryNormalized(root: string): any {
  const o = JSON.parse(fs.readFileSync(path.join(root, "runtime", "generated", "capability-registry.json"), "utf8"));
  check(typeof o.generatedAt === "string" && o.generatedAt.length > 0, `  (generatedAt present & volatile — normalised): ${root.split("/").pop()}`);
  delete o.generatedAt;
  return o;
}

console.log("LOT η3-B1 — CAPABILITY-REGISTRY EQUIVALENCE + PATH PROOF (historical .js vs compiled-from-TS .js)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  const compiledInRepo = path.join(REPO, "runtime", "dist", "core", "capability-registry.js");
  check(fs.existsSync(compiledInRepo), "prerequisite: compiled runtime/dist/core/capability-registry.js present");

  // ---- 1. BEHAVIOURAL PARITY -------------------------------------------------------------------
  const sbL = legacySandbox();
  const sbC = compiledSandbox();
  check(fs.existsSync(path.join(sbL, "node_modules")) === false && fs.existsSync(path.join(sbC, "node_modules")) === false, "sandboxes have NO node_modules (child runs offline)");

  const rL = runStage(path.join(sbL, "runtime", "core", "capability-registry.js"), sbL);
  const rC = runStage(path.join(sbC, "runtime", "dist", "core", "capability-registry.js"), sbC);
  check(rL.code === 0, `legacy stage exits 0 (got ${rL.code})\n${rL.code === 0 ? "" : rL.out}`);
  check(rC.code === 0, `compiled stage exits 0 (got ${rC.code})\n${rC.code === 0 ? "" : rC.out}`);

  const regL = readRegistryNormalized(sbL);
  const regC = readRegistryNormalized(sbC);
  // Fixtures are meaningful: proven set and forward gap are both non-empty — parity is a real comparison.
  check(Array.isArray(regL.capabilities) && regL.capabilities.length === 2 && regL.capabilities[0] === "M0000", "legacy: capabilities = proven set [M0000, M0001] (NON-trivial model)");
  check(Array.isArray(regL.missingCapabilities) && regL.missingCapabilities.length === 1 && regL.missingCapabilities[0].id === "ALPHA", "legacy: missingCapabilities = forward gap [ALPHA] (NON-trivial model)");
  check(JSON.stringify(regL) === JSON.stringify(regC), "PARITY: legacy and compiled capability-registry.json identical (generatedAt normalised)");
  // The compiled stage's summary lines echo the same counts (behavioural console parity).
  check(/Available : 2/.test(rL.out) && /Available : 2/.test(rC.out) && /Missing   : 1/.test(rL.out) && /Missing   : 1/.test(rC.out), "console summary counts identical (Available:2 / Missing:1) for legacy and compiled");

  // ---- 2. PATH PROOF: compiled module physically in runtime/dist/core writes to runtime/generated ----
  // (rC already ran the compiled file FROM runtime/dist/core with cwd = sbC; assert WHERE the artifact landed.)
  const goodLoc = path.join(sbC, "runtime", "generated", "capability-registry.json");
  const badLoc = path.join(sbC, "runtime", "dist", "generated", "capability-registry.json");
  const badDir = path.join(sbC, "runtime", "dist", "generated");
  check(fs.existsSync(goodLoc), "PATH PROOF: compiled-from-dist/core wrote artifact to runtime/generated/capability-registry.json (process.cwd() root)");
  check(!fs.existsSync(badLoc), "PATH PROOF: NO artifact under runtime/dist/generated/capability-registry.json");
  check(!fs.existsSync(badDir), "PATH PROOF: runtime/dist/generated/ directory was never created (the old __dirname bug would have created it)");
  check(fs.statSync(goodLoc).size > 0, "PATH PROOF: the correctly-located artifact is non-empty");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η3-B1 CAPABILITY-REGISTRY EQUIVALENCE + PATH PROOF" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
