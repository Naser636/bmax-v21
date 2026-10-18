// @ts-nocheck
/*
 * ODG Runtime pipeline entry point — TypeScript canonical (Lot 1 migration). Faithful port of the
 * original runtime/bin/odg-run.js; behaviour (governance gate, RuntimeContext, SAMURAI summary output,
 * checkpoint/resume, per-stage spawn of `node <stage.js>`, RC-1 effect gate, exit codes) is identical.
 * The 13 stage modules remain JavaScript in this lot (migrated in later lots) and are still spawned
 * with `node`. `// @ts-nocheck` is transitional (static types added in a later pass).
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
// governance-kernel, odg-bootstrap, runtime-context-loader are now DUAL-PORT (compiled to dist). L7
// TS-only: prefer the COMPILED dist port so the mission entry's transitive graph resolves within dist
// (not the source .js rollbacks) — the L7 proof showed loading the source roots pulled in 51 source .js.
// Fall back to the source .js rollback when ODG_RUNTIME=js OR the dist port is absent (bare sandbox),
// mirroring the `_odg_port` wrapper discipline. Resolution stays CWD-relative (odg-run runs with cwd =
// project/sandbox root, as the stage spawns assume).
function legacyRequire(rel) {
  if (process.env.ODG_RUNTIME !== "js") {
    const distRel = rel.replace(/^runtime\//, "runtime/dist/");
    const distAbs = path.resolve(process.cwd(), distRel);
    if (fs.existsSync(distAbs)) return require(distAbs);
  }
  return require(path.resolve(process.cwd(), rel));
}
const { authorizeMission } = legacyRequire("runtime/core/governance-kernel.js");

const VERBOSE = process.env.ODG_VERBOSE === "1" || process.env.ODG_VERBOSE === "true";
function fmtDuration(ms) {
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
} catch (e) {
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
const stageNames = pipeline.map(([name]) => name);
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
