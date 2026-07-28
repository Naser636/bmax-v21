#!/usr/bin/env node

/*
 * ODG Delegate — ODG supervises Claude Code (ODG Delegate Provider v1, OBJ-002).
 *
 * Makes ODG the supervisor and Claude Code the pure patch engine:
 *
 *   user → odg delegate <MISSION>
 *        → Mission Loader            (resume the last jalon, load ONLY the mission contract)
 *        → scoped Delegation Brief   (the minimal context handed to Claude Code)
 *        → Claude Code               (generates the minimal patch — the ONLY step ODG does not own)
 *        → verify → converge         (existing Runtime validations, reused as-is)
 *        → Mission Ledger / archive  (existing governance lifecycle, reused as-is)
 *
 * The genuinely-new capability is context SCOPING: Claude Code never sees the whole repository —
 * only the files the mission's contract authorises (or path-like tokens derived from its objectives).
 * Everything else is pure orchestration of components that already exist (mission-loader.js,
 * odg-verify.js, odg-converge.js, mission-lifecycle.markArchived). No new architecture, no
 * duplication, and the Kernel / Policies / governance are never touched.
 *
 * Flags:
 *   --prepare-only   Emit the scoped Delegation Brief and stop, BEFORE running validations — so
 *                    Claude Code can generate the patch first. Re-run without the flag to validate,
 *                    converge and archive. Keeps the token/validation cost strictly minimal.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const ROOT = process.cwd();
const BIN = path.join("runtime", "bin");
const GENERATED = path.join("runtime", "generated");
const DELEGATION_DIR = path.join(GENERATED, "delegation");

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

const args = process.argv.slice(2);
const mission = args.find((a) => !a.startsWith("--"));
const prepareOnly = args.includes("--prepare-only");

if (!mission) {
  die("STOP: usage — odg delegate <MISSION> [--prepare-only]");
}

// --- Step 1 — resume last jalon: load ONLY this mission's contract via the Mission Loader --------
// The Loader reads runtime/missions/<MISSION>.json and nothing else — no repo rescan, no audit — and
// STOPs on a non-executable artifact ("declares no objectives"), so delegate inherits that gate for
// free and never delegates a master-plan / evidence-pack.
const loader = cp.spawnSync(process.execPath, [path.join(BIN, "..", "core", "mission-loader.js"), mission], {
  cwd: ROOT,
  stdio: "inherit",
});
if (loader.status !== 0) {
  die(`STOP: mission "${mission}" is not delegable (Mission Loader rejected it).`, loader.status || 1);
}

const planPath = path.join(GENERATED, "mission-plan.json");
let plan;
try {
  plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
} catch (err) {
  die(`STOP: could not read mission plan ${planPath}: ${err.message}`);
}

// --- Step 2 — scope the context to ONLY the concerned files -------------------------------------
// Preference order: the contract's authorized_paths (explicit engineering scope). When absent, derive
// path-like tokens from the objectives / definition-of-done text. The mission contract itself is
// always in scope. Only paths that exist on disk are kept, so the brief is honest and minimal.
function pathTokens(strings) {
  const out = [];
  const re = /[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g;
  for (const s of strings) {
    let m;
    while ((m = re.exec(String(s))) !== null) {
      if (m[0].includes("/")) out.push(m[0]);
    }
  }
  return out;
}

const objectives = Array.isArray(plan.objectives) ? plan.objectives : [];
const objectiveText = objectives.flatMap((o) => [o.goal, ...(o.done_when || [])]);
const derived =
  Array.isArray(plan.authorizedPaths) && plan.authorizedPaths.length > 0
    ? plan.authorizedPaths
    : pathTokens([...objectiveText, ...(plan.definitionOfDone || [])]);

const contractPath = plan.source || path.join("runtime", "missions", `${mission}.json`);
// A scope entry is kept when it is a glob/directory boundary the contract declares (e.g. `runtime/**`)
// — those ARE the authorised scope and must be shown verbatim — or a concrete file that exists on
// disk. Phantom concrete paths are dropped so the brief stays honest and minimal.
const isBoundary = (p) => p.includes("*") || p.endsWith("/");
const scope = [...new Set([contractPath, ...derived])]
  .filter((p) => {
    if (isBoundary(p)) return true;
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  })
  .sort();

// --- Step 3/4/5 — write the Delegation Brief (the packet Claude Code receives) ------------------
fs.mkdirSync(DELEGATION_DIR, { recursive: true });
const briefJson = {
  generatedAt: new Date().toISOString(),
  mission,
  priority: plan.priority || "NORMAL",
  mode: plan.mode || "SEQUENTIAL",
  requiresEngineering: plan.requiresEngineering === true,
  scope, // the ONLY files Claude Code may read/modify
  objectives: objectives.map((o) => ({ id: o.id, goal: o.goal, done_when: o.done_when || [] })),
  definitionOfDone: plan.definitionOfDone || [],
  instruction:
    "Produce the MINIMAL patch that satisfies the objectives. Read and modify ONLY the files in " +
    "`scope`. Do NOT scan the rest of the repository. Do NOT audit or rebuild context.",
};
const briefJsonPath = path.join(DELEGATION_DIR, `${mission}.brief.json`);
fs.writeFileSync(briefJsonPath, JSON.stringify(briefJson, null, 2));

const briefMd = [
  `# ODG Delegation Brief — ${mission}`,
  "",
  `Priority: ${briefJson.priority}  ·  Mode: ${briefJson.mode}  ·  Engineering: ${briefJson.requiresEngineering ? "yes" : "no"}`,
  "",
  "## Scope — the ONLY files Claude Code may read/modify",
  ...(scope.length ? scope.map((p) => `- \`${p}\``) : ["- (none — read-only / no authorized paths)"]),
  "",
  "## Objectives",
  ...objectives.map((o) => `- **${o.id}**: ${o.goal}${(o.done_when || []).length ? ` — done when: ${o.done_when.join("; ")}` : ""}`),
  "",
  "## Definition of Done",
  ...(briefJson.definitionOfDone.length ? briefJson.definitionOfDone.map((d) => `- ${d}`) : ["- (per objectives)"]),
  "",
  "## Instruction",
  briefJson.instruction,
  "",
].join("\n");
const briefMdPath = path.join(DELEGATION_DIR, `${mission}.brief.md`);
fs.writeFileSync(briefMdPath, briefMd);

console.log("======================================");
console.log("ODG DELEGATE — brief prepared for Claude Code");
console.log("======================================");
console.log("Mission :", mission);
console.log("Scope   :", scope.length, "file(s) —", scope.join(", ") || "(none)");
console.log("Brief   :", briefMdPath);
console.log("        :", briefJsonPath);

if (prepareOnly) {
  console.log("--------------------------------------");
  console.log("--prepare-only: stopping before validations.");
  console.log("Hand the brief to Claude Code, apply its patch, then re-run: odg delegate", mission);
  console.log("======================================");
  process.exit(0);
}

// --- Steps 6/7 — receive the patch (whatever is now in the working tree) and verify -------------
console.log("--------------------------------------");
console.log("VERIFY");
const verify = cp.spawnSync(process.execPath, [path.join(BIN, "odg-verify.js")], { cwd: ROOT, stdio: "inherit" });
if (verify.status !== 0) {
  die(`STOP: verify failed for "${mission}".`, verify.status || 1);
}

// --- Step 8 — converge (existing Convergence Orchestrator, writes convergence-report + ledger) ---
console.log("--------------------------------------");
console.log("CONVERGE");
const converge = cp.spawnSync(process.execPath, [path.join(BIN, "odg-converge.js")], { cwd: ROOT, stdio: "inherit" });
if (converge.status !== 0) {
  die(`STOP: converge did not reach convergence for "${mission}".`, converge.status || 1);
}

// --- Steps 9/10 — proofs + auto-archive via the existing Mission Ledger lifecycle ---------------
let lifecycle = null;
try {
  const { markArchived } = require(path.join(ROOT, "runtime", "core", "mission-lifecycle.js"));
  lifecycle = markArchived(mission);
} catch (err) {
  console.error("WARN: archival step skipped:", err.message);
}

console.log("======================================");
console.log("ODG DELEGATE — done");
console.log("======================================");
console.log("Proofs  :", path.join(GENERATED, "runtime-verify.json") + ",", path.join(GENERATED, "convergence-report.json"));
console.log("Brief   :", briefMdPath);
if (lifecycle) {
  console.log("Lifecycle:", lifecycle.achieved, lifecycle.archived ? "(archived)" : "");
}
console.log("======================================");
