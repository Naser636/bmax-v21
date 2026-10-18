#!/usr/bin/env node
/* TS port → runtime/dist/bin/odg-delegate.js (DEFAULT); runtime/bin/odg-delegate.js = ODG_RUNTIME=js rollback. */

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

function die(msg: string, code = 1): never {
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
let plan: any;
try {
  plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
} catch (err: any) {
  die(`STOP: could not read mission plan ${planPath}: ${err.message}`);
}

// --- Step 2 — scope the context to ONLY the concerned files -------------------------------------
// Preference order: the contract's authorized_paths (explicit engineering scope). When absent, derive
// path-like tokens from the objectives / definition-of-done text. The mission contract itself is
// always in scope. Only paths that exist on disk are kept, so the brief is honest and minimal.
function pathTokens(strings: any[]): string[] {
  const out: string[] = [];
  const re = /[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g;
  for (const s of strings) {
    let m: any;
    while ((m = re.exec(String(s))) !== null) {
      if (m[0].includes("/")) out.push(m[0]);
    }
  }
  return out;
}

const objectives = Array.isArray(plan.objectives) ? plan.objectives : [];
const objectiveText = objectives.flatMap((o: any) => [o.goal, ...(o.done_when || [])]);
const derived =
  Array.isArray(plan.authorizedPaths) && plan.authorizedPaths.length > 0
    ? plan.authorizedPaths
    : pathTokens([...objectiveText, ...(plan.definitionOfDone || [])]);

const contractPath = plan.source || path.join("runtime", "missions", `${mission}.json`);
// A scope entry is kept when it is a glob/directory boundary the contract declares (e.g. `runtime/**`)
// — those ARE the authorised scope and must be shown verbatim — or a concrete file that exists on
// disk. Phantom concrete paths are dropped so the brief stays honest and minimal.
const isBoundary = (p: string) => p.includes("*") || p.endsWith("/");
const scope = [...new Set([contractPath, ...derived])]
  .filter((p: string) => {
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
  objectives: objectives.map((o: any) => ({ id: o.id, goal: o.goal, done_when: o.done_when || [] })),
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
  ...(scope.length ? scope.map((p: string) => `- \`${p}\``) : ["- (none — read-only / no authorized paths)"]),
  "",
  "## Objectives",
  ...objectives.map((o: any) => `- **${o.id}**: ${o.goal}${(o.done_when || []).length ? ` — done when: ${o.done_when.join("; ")}` : ""}`),
  "",
  "## Definition of Done",
  ...(briefJson.definitionOfDone.length ? briefJson.definitionOfDone.map((d: any) => `- ${d}`) : ["- (per objectives)"]),
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

// --- Delegation provider selection (E5) — explicit isolated-vs-historical decision, no silent fallback -
// The mode is decided ONCE here and surfaced BEFORE any provider runs, so the historical path is never
// presented as isolated. selectDelegateMode REFUSES (never downgrades) when isolation is requested but
// cannot be guaranteed (incompatible/network provider, missing command, empty/glob write-set). The flag
// is OFF by default ⇒ mode "historical" (provider has repo access, NOT isolated) — behaviour unchanged.
const delegIso: any = require(path.join(ROOT, "runtime", "core", "delegate-isolation.js"));
const delegMode = delegIso.selectDelegateMode({
  isolationRequested: process.env.ODG_DELEGATE_ISOLATION === "1",
  command: process.env.ODG_ISOLATED_PROVIDER_CMD,
  declaredOffline: process.env.ODG_ISOLATED_PROVIDER_OFFLINE === "1",
  writeSet: Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [],
});
console.log("--------------------------------------");
console.log("Delegation mode:", delegMode.isolated ? "ISOLATED (local offline provider — no repo/.git/docker/secrets/network)" : "HISTORICAL (provider has repository access — NOT isolated)");
console.log("        reason :", delegMode.reason);
if (delegMode.mode === "refused") {
  die(`STOP: isolation was requested but cannot be guaranteed — ${delegMode.reason}. Refusing (no silent fallback to the non-isolated path).`, 2);
}
if (delegMode.isolated && prepareOnly) {
  die("STOP: --prepare-only is not applicable in isolated mode (ODG runs the provider itself inside the sandbox).", 2);
}

if (prepareOnly) {
  console.log("--------------------------------------");
  console.log("--prepare-only: stopping before validations.");
  console.log("Hand the brief to Claude Code, apply its patch, then re-run: odg delegate", mission);
  console.log("======================================");
  process.exit(0);
}

// --- EXPERIMENTAL isolated provider run (PROVIDER_ISOLATION_E1_E5) — reached ONLY in mode "isolated" --
// ODG runs the provider ITSELF inside a bwrap sandbox on a working COPY of ONLY the authorized files
// (no real repo/.git/docker socket/host secrets/outbound network), reads its effect back as a diff,
// validates every change against the EXACT write-set, and applies ONLY a fully in-scope proposal.
// FAIL-CLOSED: an unavailable sandbox, an unobserved launch, or an out-of-scope change all STOP here —
// NO silent fallback to unisolated execution. Downstream CM-1 + verify + converge then run unchanged.
if (delegMode.isolated) {
  console.log("--------------------------------------");
  console.log("ISOLATED PROVIDER (experimental — PROVIDER_ISOLATION)");
  const isoWriteSet = Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [];
  // Baseline = the pre-proposal HEAD, persisted on the first (propose) invocation and reused on the
  // post-acceptance invocation so the committed-diff check is scoped correctly. Gitignored artifact.
  const baselineFile = path.join(DELEGATION_DIR, `${mission}.isolation-baseline`);
  let baselineRef: any = null;
  try { baselineRef = fs.existsSync(baselineFile) ? fs.readFileSync(baselineFile, "utf8").trim() : null; } catch { baselineRef = null; }
  if (!baselineRef) { try { baselineRef = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { baselineRef = null; } }
  const isoResult = delegIso.runIsolated({ root: ROOT, writeSet: isoWriteSet, command: process.env.ODG_ISOLATED_PROVIDER_CMD, apply: true });
  if (isoResult.refused || !isoResult.ok) {
    die(`STOP: isolated provider run refused — ${isoResult.reason} (fail-closed, no unisolated fallback).`, 2);
  }
  console.log("Isolated:", isoResult.reason);
  console.log("Applied :", (isoResult.applied && isoResult.applied.applied.join(", ")) || "(none)");
  // HUMAN ACCEPTANCE GATE — resolves the apply↔verify↔converge deadlock WITHOUT bypassing verify.gitClean.
  // verify + converge run ONLY after the human COMMITS the in-scope deliverable. ODG never auto-commits;
  // an out-of-scope working change or an UNAUTHORIZED COMMIT of out-of-scope files BLOCKS (always).
  const gate = delegIso.acceptanceGate({ root: ROOT, writeSet: isoWriteSet, baselineRef });
  console.log("Acceptance:", gate.state, "—", gate.reason);
  if (gate.state === "BLOCKED") {
    die(`STOP: ${gate.reason}. Refusing (no bypass of scope/commit governance).`, 2);
  }
  if (gate.state !== "ACCEPTED") {
    try { fs.mkdirSync(DELEGATION_DIR, { recursive: true }); fs.writeFileSync(baselineFile, String(baselineRef || "")); } catch { /* best-effort */ }
    console.log("--------------------------------------");
    console.log("AWAITING HUMAN ACCEPTANCE — review the in-scope deliverable and COMMIT it, then re-run: odg delegate", mission);
    console.log("ODG never auto-commits; verify + converge run ONLY after acceptance. STOP (not a failure).");
    console.log("======================================");
    process.exit(0);
  }
  try { if (fs.existsSync(baselineFile)) fs.unlinkSync(baselineFile); } catch { /* best-effort */ }
  console.log("Acceptance: committed in-scope deliverable confirmed — proceeding to verify + converge.");
}

// --- Step 5b — WRITE-SET CONFORMANCE (CM-1): ODG independently controls the RECEIVED patch's scope -------
// A delegated patch is applied by the provider directly in the working tree (NOT through the action-gate),
// so ODG must INDEPENDENTLY verify the change stayed within the authorized write-set before trusting it.
// Reuses the shared scope primitive (scope-observer.scopeClean) — no new logic. Any change outside the
// authorized_paths ⇒ REFUSE here (zero verify/converge/archive); the provider never widens its own scope.
console.log("--------------------------------------");
console.log("WRITE-SET CONFORMANCE");
try {
  const { scopeClean } = require(path.join(ROOT, "runtime", "core", "scope-observer.js"));
  const authorized = Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [];
  const conformance = scopeClean(authorized);
  if (!conformance.ok) {
    die(`STOP: delegated patch is OUT OF SCOPE — ${conformance.detail}. The received change touched files outside the authorized write-set; refusing (no verify/converge/archive).`, 2);
  }
  console.log("Conformance:", conformance.detail);
} catch (err: any) {
  die(`STOP: write-set conformance check failed to run (${err.message}); refusing fail-closed.`, 2);
}

// --- Steps 6/7 — receive the patch (whatever is now in the working tree) and verify -------------
console.log("--------------------------------------");
console.log("VERIFY");
// L7-FIX-4: prefer the compiled dist verifier (TS-only) so its transitive core loads from dist; source fallback.
const verifyBin = process.env.ODG_RUNTIME !== "js" && fs.existsSync(path.join(ROOT, "runtime", "dist", "bin", "odg-verify.js")) ? path.join("runtime", "dist", "bin", "odg-verify.js") : path.join(BIN, "odg-verify.js");
const verify = cp.spawnSync(process.execPath, [verifyBin], { cwd: ROOT, stdio: "inherit" });
if (verify.status !== 0) {
  die(`STOP: verify failed for "${mission}".`, verify.status || 1);
}

// --- Step 8 — converge (existing Convergence Orchestrator, writes convergence-report + ledger) ---
console.log("--------------------------------------");
console.log("CONVERGE");
const convergeBin = process.env.ODG_RUNTIME !== "js" && fs.existsSync(path.join(ROOT, "runtime", "dist", "bin", "odg-converge.js")) ? path.join("runtime", "dist", "bin", "odg-converge.js") : path.join(BIN, "odg-converge.js");
const converge = cp.spawnSync(process.execPath, [convergeBin], { cwd: ROOT, stdio: "inherit" });
if (converge.status !== 0) {
  die(`STOP: converge did not reach convergence for "${mission}".`, converge.status || 1);
}

// --- Steps 9/10 — proofs + auto-archive via the existing Mission Ledger lifecycle ---------------
let lifecycle = null;
try {
  const { markArchived } = require(path.join(ROOT, "runtime", "core", "mission-lifecycle.js"));
  lifecycle = markArchived(mission);
} catch (err: any) {
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

export {};
