#!/usr/bin/env node
"use strict";
/*
 * COMPASS AUTO-UPDATE (§8) — records a VERIFIED mission result into a machine-readable compass checkpoint,
 * fail-closed + idempotent. NOT a new primitive/orchestrator/registry: a thin recorder that reuses the
 * existing compass (ODG_PROJECT_STATE.md stays the human prose, link-based) + a structured companion
 * runtime/generated/compass-checkpoint.json (gitignored host state, like the other *-checkpoint.json).
 *
 * HARD RULES (so a broken/incomplete mission can NEVER be recorded complete):
 *  - A status of PASS is accepted ONLY if acceptanceMet===true AND every evidence ref is a file that
 *    ACTUALLY EXISTS. A claimed PASS with a missing evidence file is DOWNGRADED to BLOCKED (never PASS).
 *  - result.verified!==true (interrupted/unverified) NEVER overwrites the last verifiedCheckpoint; it is
 *    recorded as inProgress only.
 *  - FAIL/BLOCKED/NOT_RUN/PARTIAL are recorded as-is (failures are never hidden).
 *  - Idempotent: replaying the SAME (mission,commit,status,evidence) event is a no-op (no duplicate history).
 *  - A recommendation (nextAction) is advisory data only — it carries no authority and cannot self-execute.
 *
 * Pure of clock only via an injected `now` (deterministic tests). No network. Fail-closed on malformed input.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VALID = ["PASS", "FAIL", "BLOCKED", "NOT_RUN", "PARTIAL"];

function sig(r) {
  return crypto.createHash("sha256").update(JSON.stringify([r.mission, r.commit, r.status, (r.evidence || []).slice().sort()])).digest("hex").slice(0, 16);
}

// Resolve the effective status under the fail-closed rule. repoRoot used to check evidence files exist.
function effectiveStatus(result, repoRoot) {
  if (!result || typeof result !== "object") throw new Error("compass-update: malformed result (object required)");
  if (!result.mission || typeof result.mission !== "string") throw new Error("compass-update: mission required");
  if (!VALID.includes(result.status)) throw new Error("compass-update: status must be one of " + VALID.join("/"));
  const evidence = Array.isArray(result.evidence) ? result.evidence : [];
  if (result.status === "PASS") {
    if (result.acceptanceMet !== true) return { status: "BLOCKED", reason: "PASS claimed but acceptanceMet!==true ⇒ fail-closed BLOCKED" };
    const missing = evidence.filter((e) => !fs.existsSync(path.join(repoRoot, e)));
    if (evidence.length === 0) return { status: "BLOCKED", reason: "PASS claimed with NO evidence ⇒ fail-closed BLOCKED" };
    if (missing.length) return { status: "BLOCKED", reason: "PASS claimed but evidence missing: " + missing.join(",") + " ⇒ fail-closed BLOCKED" };
    return { status: "PASS", reason: "acceptance met + all evidence present" };
  }
  return { status: result.status, reason: result.reason || "" };
}

function update(result, opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || path.resolve(__dirname, "..");
  const file = opts.file || path.join(repoRoot, "runtime", "generated", "compass-checkpoint.json");
  const now = opts.now || (() => new Date().toISOString());
  let state;
  try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch { state = { schema: "compass-checkpoint/1", verifiedCheckpoint: null, lastMission: null, inProgress: null, history: [] }; }

  const eff = effectiveStatus(result, repoRoot);
  const evt = { mission: result.mission, commit: result.commit || null, status: eff.status, reason: eff.reason, evidence: result.evidence || [], acceptanceMet: result.acceptanceMet === true, nextAction: result.nextAction || null, recordedAt: now() };
  const s = sig({ mission: evt.mission, commit: evt.commit, status: evt.status, evidence: evt.evidence });

  // Idempotent: same verified event as the last history entry ⇒ no-op.
  const last = state.history[state.history.length - 1];
  if (last && last._sig === s) return { changed: false, state, effective: eff, note: "idempotent no-op (event already recorded)" };

  if (result.verified !== true) {
    // interrupted/unverified ⇒ record inProgress ONLY; never touch the last verifiedCheckpoint.
    state.inProgress = { ...evt, _sig: s };
    writeAtomic(file, state);
    return { changed: true, state, effective: eff, note: "recorded inProgress (unverified) — verifiedCheckpoint untouched" };
  }
  evt._sig = s;
  state.lastMission = evt;
  state.history.push(evt);
  if (state.history.length > 50) state.history = state.history.slice(-50);
  if (eff.status === "PASS" && result.commit) state.verifiedCheckpoint = { commit: result.commit, branch: result.branch || null, worktreeClean: result.worktreeClean === true, mission: evt.mission, at: evt.recordedAt };
  state.inProgress = null; // a verified completion clears any prior in-progress marker
  writeAtomic(file, state);
  return { changed: true, state, effective: eff, note: eff.status === "PASS" ? "verified checkpoint advanced" : "recorded non-PASS (failure not hidden)" };
}

function writeAtomic(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file); // atomic ⇒ an interrupted write never corrupts the last verified checkpoint
}

function gitId(repoRoot) {
  const run = (a) => { try { return require("child_process").execSync(`git ${a}`, { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };
  return { commit: run("rev-parse HEAD"), branch: run("rev-parse --abbrev-ref HEAD") };
}

/*
 * Derive a VERIFIED result from the real mission artifacts. TWO anti-stale guards make a leftover report
 * incapable of fabricating a PASS or mis-attributing an outcome (fail-closed), which is ESSENTIAL for a
 * trap that fires on every terminal path (SUCCESS/STOP/FAIL/interruption):
 *   1) MISSION-IDENTITY — report.mission MUST equal the mission we are recording; else NOT_RUN. Stops a
 *      previous DIFFERENT mission's report from being attributed to this one.
 *   2) FRESHNESS (opts.sinceMs) — the report file mtime MUST be >= the run's start epoch; else NOT_RUN.
 *      Stops a SAME-mission earlier report (e.g. this mission ran green before, now re-ran and crashed
 *      before rewriting the report) from being replayed as a fresh PASS.
 * PASS additionally requires validated===true AND status===SUCCESS (and update() re-checks evidence exists).
 */
function fromReport(mission, repoRoot, opts) {
  opts = opts || {};
  const reportPath = path.join(repoRoot, "runtime", "generated", "mission-report.json");
  const notRun = (reason) => ({ mission, ...gitId(repoRoot), status: "NOT_RUN", acceptanceMet: false, evidence: [], reason, nextAction: null, verified: true });

  let report = {}, mtimeMs = 0;
  try { report = JSON.parse(fs.readFileSync(reportPath, "utf8")); mtimeMs = fs.statSync(reportPath).mtimeMs; } catch { return notRun("no mission-report readable for this mission"); }

  // Guard 1 — identity.
  const reportMission = typeof report.mission === "string" ? report.mission : null;
  if (!reportMission || reportMission !== mission) return notRun(reportMission ? `report mission "${reportMission}" ≠ "${mission}" (stale ⇒ not attributed)` : "mission-report has no mission identity");
  // Guard 2 — freshness (only when a run-start epoch is supplied).
  if (typeof opts.sinceMs === "number" && mtimeMs < opts.sinceMs) return notRun(`report mtime ${Math.round(mtimeMs)} < run-start ${Math.round(opts.sinceMs)} (not written this run ⇒ stale)`);

  const validated = report.validated === true;
  const reportStatus = report.status || "UNKNOWN";
  const pass = validated && reportStatus === "SUCCESS";
  // Faithful status mapping (never flatten a BLOCKED/PARTIAL into a bare FAIL, never a non-SUCCESS into PASS).
  let status;
  if (pass) status = "PASS";
  else if (reportStatus === "BLOCKED") status = "BLOCKED";
  else if (reportStatus === "PARTIAL") status = "PARTIAL";
  else if (reportStatus === "UNKNOWN") status = "NOT_RUN";
  else status = "FAIL";
  const evidence = ["runtime/generated/mission-report.json"];
  if (fs.existsSync(path.join(repoRoot, "runtime", "generated", "runtime-verify.json"))) evidence.push("runtime/generated/runtime-verify.json");
  return {
    mission, ...gitId(repoRoot),
    status, acceptanceMet: pass, evidence,
    reason: pass ? "mission-report validated+SUCCESS (identity+freshness ok)" : `report status=${reportStatus} validated=${validated}`,
    nextAction: null, verified: true,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let result;
  if (args[0] === "--from-report") {
    const mission = args[1];
    if (!mission) { process.stderr.write("compass-update --from-report <mission> [--since <epochMs>]\n"); process.exit(2); }
    const si = args.indexOf("--since");
    const sinceMs = si >= 0 && args[si + 1] ? Number(args[si + 1]) : undefined;
    result = fromReport(mission, path.resolve(__dirname, ".."), { sinceMs });
  } else {
    result = JSON.parse(args[0] || "{}");
  }
  const r = update(result);
  process.stdout.write("compass-update: " + r.effective.status + " — " + r.note + "\n");
}
module.exports = { update, effectiveStatus, sig, fromReport };
