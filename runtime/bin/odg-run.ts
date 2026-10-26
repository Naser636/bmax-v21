/*
 * ODG Runtime pipeline entry point — TypeScript canonical (Lot 1 migration). Faithful port of the
 * original runtime/bin/odg-run.js; behaviour (governance gate, RuntimeContext, SAMURAI summary output,
 * checkpoint/resume, per-stage spawn of `node <stage.js>`, RC-1 effect gate, exit codes) is identical.
 * The 13 stage modules remain JavaScript in this lot (migrated in later lots) and are still spawned
 * with `node`. Type-suppression pragma REMOVED (TS_NOCHECK_ODG_RUN): former TS2451 were a script-vs-
 * module scope artifact fixed by the `export {}` marker below; params carry explicit `: any`.
 *
 * Lot 1R execution model: this source is COMPILED by tsconfig.runtime-dist.json to runtime/dist/bin/
 * odg-run.js (plain CommonJS) and run with `node runtime/dist/bin/odg-run.js <mission>` — NO tsx, NO
 * node_modules, so it works in the bare sandboxes the benches use. The historical runtime/bin/odg-run.js
 * is left INTACT (unchanged, still node-runnable) as the legacy entry until callers are switched over;
 * it is NOT a shim and is not deleted in this lot.
 */

"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Lot 1R: this entry is COMPILED (tsc) to a distinct output dir (runtime/dist) and run with plain
// `node` — no tsx, no node_modules. The compiled helpers (checkpoint-engine/stage-effect/
// pipeline-builder) are emitted ALONGSIDE this file under dist/core, so they stay relative requires.
// governance-kernel, odg-bootstrap, runtime-context-loader resolve to their COMPILED dist ports
// (runtime/dist/core|bin) so the mission entry's transitive graph stays entirely within dist. ZERO-JS
// (L-iv): the ODG_RUNTIME=js source-.js rollback is RETIRED — this entry only ever runs as the compiled
// dist, whose siblings are emitted ALONGSIDE this entry. Resolution is relative to THIS module's own
// directory (__dirname = …/runtime/dist/bin), NOT process.cwd(), so the compiled entry is self-contained
// and relocatable: it finds its dist siblings even when launched from a different cwd (e.g. a hermetic
// temp sandbox). Equivalent to the former cwd-relative form whenever cwd = repo root (the production case).
function legacyRequire(rel: any) {
  const distRel = rel.replace(/^runtime\//, "runtime/dist/").replace(/^runtime\/dist\//, "");
  return require(path.resolve(__dirname, "..", distRel));
}
const { authorizeMission } = legacyRequire("runtime/core/governance-kernel.js");

const VERBOSE = process.env.ODG_VERBOSE === "1" || process.env.ODG_VERBOSE === "true";
function fmtDuration(ms: any) {
  return ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : ms + "ms";
}
const { bootstrap } = legacyRequire("runtime/bin/odg-bootstrap.js");
const checkpoint = require("../core/checkpoint-engine"); // compiled sibling (dist/core)
const stageEffect = require("../core/stage-effect");     // compiled sibling (dist/core)
const { loadRuntimeContext } = legacyRequire("runtime/core/runtime-context-loader.js");

// COLD-START PREP: ensure runtime/generated and project-context.json exist BEFORE anything reads/writes
// there — including the pipeline-builder require below, which writes runtime-pipeline.json at import
// time. bootstrap() is idempotent.
bootstrap();

const pipeline = require("../core/pipeline-builder");

const mission = process.argv[2] || "BUILD_RUNTIME";

const governance = authorizeMission(mission);

let runtimeContext = null;
try {
  runtimeContext = loadRuntimeContext(mission);
} catch (e: any) {
  console.error("RuntimeContext : UNAVAILABLE (" + e.message + ")");
}

if (!governance.authorized) {
  console.error("STOP: Mission refused by Governance Kernel");
  process.exit(1);
}

console.log("Governance : AUTHORIZED");
console.log("Next State :", governance.nextStates.join(", "));

if (runtimeContext) {
  console.log("RuntimeContext : READY");
  console.log("Project Files  :", runtimeContext.project.files);
  console.log("Project Dirs   :", runtimeContext.project.directories);
}

// IDENTITY — Truth-Lock PRE-EXECUTION GATE (reuse evaluateTruthLock via the canonical policy). Runs ONCE here,
// after governance and BEFORE any pipeline stage. A MUTATING mission (requiresEngineering) on a failing
// repo-safety verdict is BLOCKED (exit 1, no stage runs); a READ-ONLY mission records the verdict only (never
// blocked). The verdict is consigned to runtime/generated/truth-lock.json for observability.
const truthLockGateMod = require("../core/truth-lock-gate"); // compiled sibling under dist/core (same discipline)
const __mutating = truthLockGateMod.missionIsMutating(mission).mutating;
const __tlEnforce = process.env.ODG_TRUTH_LOCK_ENFORCE === "1" || process.env.ODG_TRUTH_LOCK_ENFORCE === "true";
const __tlGate = truthLockGateMod.truthLockGate({ mission, mutating: __mutating, enforce: __tlEnforce, now: new Date().toISOString() });
try {
  fs.mkdirSync(path.join("runtime", "generated"), { recursive: true });
  fs.writeFileSync(path.join("runtime", "generated", "truth-lock.json"), JSON.stringify(__tlGate, null, 2));
} catch { /* evidence is best-effort; the gate decision below does not depend on the write */ }
console.log("Truth Lock :", __tlGate.status, `(mutating=${__mutating}, ${__tlEnforce ? "ENFORCE" : "record-only"})`);
if (__tlGate.blocked) {
  console.error("STOP: Truth Lock REFUSED a mutating mission before any stage ran —", __tlGate.verdict.detail);
  process.exit(1);
}

console.log("======================================");
console.log("ODG RUNTIME PIPELINE :", mission);
console.log("======================================");

const LOG_DIR = path.join("runtime", "generated", "logs");
// Slugify the mission identifier for the FILENAME so a free-text mission (spaces, '/', parentheses,
// punctuation, accents, newlines, very long) can never create a nested path, escape LOG_DIR, or ENOENT
// the write. Reproduced 2026-10-18: a '/' in the raw mission string made this a non-existent nested dir.
// The console output above keeps the full human-readable mission text; only the on-disk name is slugged.
// Compiled sibling under dist/core (same relative-require discipline as checkpoint-engine/stage-effect).
const { logSlug } = require("../core/log-slug");
const RUN_LOG = path.join(LOG_DIR, logSlug(mission) + ".run.log");
if (!VERBOSE) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(RUN_LOG, "ODG RUNTIME PIPELINE — " + mission + "\n");
  console.log("Output     : summary (full log →", RUN_LOG + ")");
} else {
  console.log("Output     : verbose (ODG_VERBOSE=1)");
}

// CHECKPOINT / RESUME
const stageNames = pipeline.map(([name]: any) => name);
let { cp, resumeIndex } = checkpoint.begin(mission, stageNames);

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    checkpoint.interrupt(cp, sig);
    console.error(`\nSTOP: received ${sig} — checkpoint saved (resume with the same mission).`);
    process.exit(130);
  });
}
process.on("uncaughtException", (e) => {
  checkpoint.interrupt(cp, "uncaughtException: " + (e && e.message));
  throw e;
});

if (resumeIndex > 0) {
  console.log(`RESUMING : ${resumeIndex}/${stageNames.length} stage(s) already complete`);
  console.log("Skipping :", stageNames.slice(0, resumeIndex).join(", "));
}

for (let i = 0; i < pipeline.length; i++) {
  const [name, file] = pipeline[i];

  if (i < resumeIndex) {
    continue; // proven DONE in a previous run — do not re-execute
  }

  cp = checkpoint.stageRunning(cp, i);
  const started = Date.now();

  let r;
  if (VERBOSE) {
    console.log("\n>>>", name);
    r = spawnSync("node", [file, mission], { stdio: "inherit" });
  } else {
    r = spawnSync("node", [file, mission], { encoding: "utf8" });
    const transcript = (r.stdout || "") + (r.stderr || "");
    fs.appendFileSync(RUN_LOG, `\n===== >>> ${name} (exit ${r.status}) =====\n${transcript}`);
  }
  const elapsed = Date.now() - started;

  if (r.status !== 0) {
    cp = checkpoint.stageFailed(cp, i, `${name} exited with status ${r.status}`);
    if (!VERBOSE) {
      const transcript = (r.stdout || "") + (r.stderr || "");
      const tail = transcript.trim().split("\n").slice(-20).join("\n");
      console.error(`>>> ${name}  FAIL  (${fmtDuration(elapsed)})`);
      if (tail) console.error("--- last output ---\n" + tail + "\n-------------------");
      console.error("Full log   :", RUN_LOG);
    }
    console.error("STOP:", name, "failed");
    process.exit(r.status);
  }

  // RC-1: a zero exit code is NOT proof the stage produced its effect.
  if (!stageEffect.stageEffectOk(name, path.join("runtime", "generated"))) {
    cp = checkpoint.stageFailed(cp, i, name + " exited 0 but produced no effect artifact (" + stageEffect.STAGE_OUTPUTS[name] + ")");
    if (!VERBOSE) {
      console.error(">>> " + name + "  FAIL  (" + fmtDuration(elapsed) + ")  — no effect artifact");
      console.error("Full log   :", RUN_LOG);
    }
    console.error("STOP:", name, "exited 0 without its effect artifact (" + stageEffect.STAGE_OUTPUTS[name] + ")");
    process.exit(1);
  }

  if (!VERBOSE) {
    console.log(`>>> ${name.padEnd(28)} OK   (${fmtDuration(elapsed)})`);
  }
  cp = checkpoint.stageDone(cp, i);
}

checkpoint.complete(cp);

console.log("\n======================================");
console.log("PIPELINE SUCCESS —", stageNames.length + "/" + stageNames.length, "stages");
if (!VERBOSE) {
  console.log("Full log   :", RUN_LOG);
}
console.log("======================================");

// Module-scope marker (adds NO runtime export): forces TypeScript MODULE scope so the pure-script
// entry top-level consts (spawnSync/fs/path/logSlug/cp) do not collide with sibling script files (TS2451).
export {};
