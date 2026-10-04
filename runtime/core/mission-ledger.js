#!/usr/bin/env node

const fs = require("fs");
const { authorizeMission } = require("./governance-kernel");
const { computeLifecycle, markArchived } = require("./mission-lifecycle");
const { evaluateMissionAcceptance } = require("./acceptance-facts");

const LEDGER_FILE = "runtime/generated/mission-ledger.json";

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function recordMission(mission) {
  // Proven-only gate (DEFAULT-DENY). `proven: true` is recorded ONLY when the Validation Engine's
  // report for THIS EXACT mission says validated === true. A report that is ABSENT, belongs to
  // ANOTHER mission, or is not validated is NOT proof, so the ledger refuses to append.
  //
  // Previously this gate was default-ALLOW: it refused only when a mission-matched report existed
  // AND said validated !== true. An absent or mismatched report slipped through and was stamped
  // `proven: true` with no evidence — reachable from callers that never ran the Validation Engine
  // first (fleet-dispatcher records at request-dispatch time; fleet-collector on a governance-only
  // "VALIDATED" exchange; any out-of-band `node mission-ledger.js <mission>`). Default-deny closes
  // that bypass while preserving every legitimate caller, each of which already writes a
  // mission-matched validated report BEFORE recording:
  //   - mse/odg-run pipeline: the Validation Engine stage (runs before this stage, exits non-zero
  //     and halts the pipeline when not proven);
  //   - src/runtime LOCAL route: ledger-record-adapter writes the honest report, then records;
  //   - autonomy RELEASE path: AutonomyRuntimeAdapter runs the Validation Engine for the mission
  //     (writing its report) and only RELEASEs/archives on validated === true.
  const report = readJsonSafe("runtime/generated/mission-report.json");
  const proven = !!report && report.mission === mission && report.validated === true;
  if (!proven) {
    const why = !report
      ? "no mission-report for this mission"
      : report.mission !== mission
        ? `report is for "${report.mission}", not "${mission}"`
        : `validation not proven (status=${report.status})`;
    console.warn(`[MissionLedger] Refusing to record "${mission}": ${why}.`);
    return { skipped: true, reason: "UNPROVEN", entry: { mission } };
  }

  // Controlled-execution gate (OPT-IN). A mission that DECLARES controlled execution
  // (contract control.required === true) must additionally pass MECHANICAL ACCEPTANCE on FACTS before
  // it may be recorded — i.e. released. The worker's validated report (checked above) is a CLAIM; for a
  // controlled mission it is NOT sufficient. evaluateMissionAcceptance gathers facts read-only from the
  // artifacts already on this path (verify booleans, checkpoint diff/status, declared evidence existence)
  // and runs the pure evaluator. Only ACCEPT lets release continue; REJECT/BLOCKED/UNKNOWN (and any
  // ungatherable fact) => refuse, no release. LEGACY missions (no control declared) return controlled:false
  // and this gate is a NO-OP, so their behavior is exactly as before.
  let acceptance;
  try {
    acceptance = evaluateMissionAcceptance(mission);
  } catch (e) {
    // Fail-closed for a declared-controlled mission; never break a legacy mission on a gather error.
    console.warn("[MissionLedger] Acceptance evaluation error:", e.message);
    acceptance = { controlled: false };
  }
  if (acceptance && acceptance.controlled === true && acceptance.verdict !== "ACCEPT") {
    const reasons = acceptance.record
      ? [].concat(acceptance.record.rejections, acceptance.record.blocks, acceptance.record.unknowns).filter(Boolean)
      : [];
    console.warn(`[MissionLedger] Refusing to record controlled mission "${mission}": mechanical acceptance ${acceptance.verdict}. ${reasons.join("; ")}`);
    return { skipped: true, reason: "NOT_ACCEPTED", verdict: acceptance.verdict, entry: { mission } };
  }

  const governance = authorizeMission(mission);

  const plan = readJsonSafe("runtime/generated/mission-plan.json") || {};
  // The authoritative mission identity is this function's argument — every caller passes it
  // (odg-run/mse, fleet dispatcher/collector, the LOCAL route adapter). mission-plan.json is a
  // GLOBAL artifact written only by the Mission Loader; the LOCAL route never regenerates it, so a
  // stale plan from a previous pipeline must not relabel this entry or lend it another mission's
  // objectives. Only trust plan-derived fields when the plan is coherent with the calling mission.
  const scopedPlan = plan && plan.mission === mission ? plan : {};
  const context = readJsonSafe("runtime/generated/runtime-context.json");

  // Run identity for idempotent recording (A2). Two LEGITIMATE finalizers can record the SAME mission
  // in ONE run: the pipeline's "Mission Ledger" stage AND AutonomyRuntimeAdapter.archive() on a
  // RELEASE decision. Deduplicate by (mission, run) using the EXISTING per-run token the Checkpoint
  // Engine already stamps — pipeline-checkpoint.startedAt — reused, NOT invented: it is set once per
  // odg-run.js invocation (checkpoint-engine.begin), stays stable across that run and its archive
  // finalizer, and is fresh on the next execution. It is trusted ONLY when the checkpoint belongs to
  // THIS mission, so a stale checkpoint from another mission (e.g. the TS LOCAL route, which never
  // writes it) yields no run id and the historical append-always behaviour is preserved.
  const checkpoint = readJsonSafe("runtime/generated/pipeline-checkpoint.json");
  const runId =
    checkpoint && checkpoint.mission === mission && typeof checkpoint.startedAt === "string"
      ? checkpoint.startedAt
      : null;

  // Governance lifecycle: advance the state machine from evidence, then archive (recording a proven
  // mission in this immutable ledger IS its archival). The recorded `state` is therefore the REAL
  // achieved governance state — no longer hardcoded to "CREATED". markArchived is a no-op unless the
  // lifecycle reached RELEASED and governance authorizes RELEASED → ARCHIVED.
  let lifecycle;
  try {
    computeLifecycle(mission);
    lifecycle = markArchived(mission);
  } catch (e) {
    lifecycle = null;
    console.warn("[MissionLedger] Lifecycle unavailable (recording CREATED):", e.message);
  }

  const entry = {
    recordedAt: new Date().toISOString(),
    mission: mission,
    runId: runId || undefined,
    state: lifecycle ? lifecycle.achieved : governance.currentState,
    authorized: governance.authorized,
    nextStates: governance.nextStates,
    lifecyclePath: lifecycle ? lifecycle.path : undefined,
    archived: lifecycle ? lifecycle.archived === true : undefined,
    constitutionVersion: governance.constitutionVersion,
    policyVersion: governance.policyVersion,
    strategy: governance.strategy,
    objectives: Array.isArray(scopedPlan.objectives) ? scopedPlan.objectives.length : 0,
    // Only proven executions reach this point (see the gate above), so every entry is proven.
    proven: true,
    validated: report && report.mission === mission ? report.validated === true : undefined
  };

  if (context && context.project) {
    entry.projectFiles = context.project.files;
    entry.projectDirectories = context.project.directories;
  }

  // Immutability: read existing entries, never rewrite past ones.
  let entries = [];
  if (fs.existsSync(LEDGER_FILE)) {
    const existing = readJsonSafe(LEDGER_FILE);
    if (existing === null) {
      // Corrupted / unreadable ledger: do NOT overwrite past evidence.
      console.warn("[MissionLedger] Existing ledger unreadable - skipping append to preserve evidence.");
      return { skipped: true, entry };
    }
    entries = Array.isArray(existing.entries) ? existing.entries : [];
  }

  // Idempotence by (mission, run): if this exact (mission, runId) is already recorded in THIS run, the
  // append is a redundant SECOND finalizer (pipeline stage + archive) — return a NO-OP rather than a
  // duplicate entry. Guarded on a real runId, so a null run id (no mission-matched checkpoint) keeps
  // the original append-always behaviour. Never masks a different mission (keyed on mission), a
  // different run (different startedAt), a failure or an unproven result (the proven-only gate above
  // still runs first and is untouched).
  if (runId && entries.some((e) => e.mission === mission && e.runId === runId)) {
    console.warn(`[MissionLedger] Skipping duplicate record of "${mission}" for run ${runId} (idempotent).`);
    return { skipped: true, reason: "DUPLICATE_RUN", entry, count: entries.length };
  }

  entries.push(entry);

  fs.mkdirSync("runtime/generated", { recursive: true });
  fs.writeFileSync(
    LEDGER_FILE,
    JSON.stringify({ generatedAt: entry.recordedAt, count: entries.length, entries }, null, 2)
  );

  return { skipped: false, entry, count: entries.length };
}

module.exports = { recordMission };

if (require.main === module) {
  const mission = process.argv[2] || "BUILD_RUNTIME";
  try {
    const result = recordMission(mission);
    console.log("======================================");
    console.log("MISSION LEDGER");
    console.log("======================================");
    console.log("Mission   :", result.entry.mission);
    console.log("State     :", result.entry.state);
    console.log("Recorded  :", result.skipped ? "SKIPPED" : "YES");
    if (!result.skipped) console.log("Entries   :", result.count);
    console.log("Output    :", LEDGER_FILE);
    console.log("======================================");
  } catch (err) {
    // Never break the pipeline: ledger is the last, non-blocking stage.
    console.warn("[MissionLedger] Non-blocking error:", err.message);
  }
  process.exit(0);
}
