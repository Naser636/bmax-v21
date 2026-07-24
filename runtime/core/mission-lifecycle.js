#!/usr/bin/env node

/*
 * Mission Lifecycle Driver — evidence-based governance state advancement.
 *
 * BEFORE this stage existed, the deterministic pipeline never advanced the governance state
 * machine: mission-ledger.js recorded `state: "CREATED"` for every mission because
 * authorizeMission() defaults currentState to "CREATED" and nothing drove the transitions
 * (runtime/governance/state-machine.json). This driver closes that gap.
 *
 * It walks the state machine (the single source of truth) from its initialState and advances one
 * transition at a time for as long as the target state's EVIDENCE predicate holds. Each predicate is
 * a pure function of the already-generated pipeline artifacts, so the achieved state is a
 * deterministic function of the run's evidence — never a hardcoded verdict.
 *
 * "Only the Governance Kernel authorizes transitions" (state-machine principle): every advance is
 * gated by governance-kernel.authorizeMission for the current state, so an unauthorized state can
 * never be reached even if evidence is present.
 *
 * The stage runs AFTER the Validation Engine (it consumes mission-report.json) and BEFORE the
 * Mission Ledger (which records the achieved state). It caps at RELEASED; the terminal ARCHIVED
 * transition is owned by the Ledger — recording a mission in the immutable ledger IS its archival —
 * via markArchived() below.
 */

const fs = require("fs");
const path = require("path");
const { authorizeMission } = require("./governance-kernel");

const GENERATED_DIR = "runtime/generated";
const STATE_MACHINE = "runtime/governance/state-machine.json";
const LIFECYCLE_FILE = path.join(GENERATED_DIR, "mission-lifecycle.json");

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/*
 * Evidence predicates keyed by the state being ENTERED. Each returns { ok, evidence } where
 * `evidence` names the concrete artifact/fact that justified the transition (or why it did not
 * hold). Pure functions of on-disk artifacts ⇒ deterministic.
 */
function buildEvidence(mission) {
  const contractPath = path.join("runtime", "missions", `${mission}.json`);
  const plan = readJsonSafe(path.join(GENERATED_DIR, "mission-plan.json"));
  const decision = readJsonSafe(path.join(GENERATED_DIR, "decision.json"));
  const patch = readJsonSafe(path.join(GENERATED_DIR, "patch-plan.json"));
  const execution = readJsonSafe(path.join(GENERATED_DIR, "patch-execution.json"));
  const report = readJsonSafe(path.join(GENERATED_DIR, "mission-report.json"));

  const executed = execution && Array.isArray(execution.executed) ? execution.executed : [];
  const anyFailed = executed.some((e) => e && e.status === "FAILED");
  const validated = !!(report && report.mission === mission && report.validated === true);

  return {
    QUALIFIED: () =>
      fs.existsSync(contractPath)
        ? { ok: true, evidence: `contract present (${contractPath})` }
        : { ok: false, evidence: "no mission contract" },
    ANALYZED: () =>
      plan && Array.isArray(plan.objectives) && plan.objectives.length > 0
        ? { ok: true, evidence: `mission-plan.json (${plan.objectives.length} objectives)` }
        : { ok: false, evidence: "no mission-plan objectives" },
    PLANNED: () =>
      decision && patch && Array.isArray(patch.patches)
        ? { ok: true, evidence: `decision.json + patch-plan.json (${patch.patches.length} patches)` }
        : { ok: false, evidence: "no decision/patch plan" },
    PREPARED: () =>
      patch && patch.status === "READY"
        ? { ok: true, evidence: "patch-plan.json status=READY" }
        : { ok: false, evidence: "patch plan not READY" },
    VALIDATED: () =>
      validated
        ? { ok: true, evidence: "mission-report.json validated=true" }
        : { ok: false, evidence: "mission not validated" },
    EXECUTED: () =>
      executed.length > 0 && !anyFailed
        ? { ok: true, evidence: `patch-execution.json (${executed.length} executed, 0 failed)` }
        : { ok: false, evidence: anyFailed ? "failed execution entries" : "no execution entries" },
    VERIFIED: () =>
      validated
        ? { ok: true, evidence: "validation gates green (mission-report validated=true)" }
        : { ok: false, evidence: "verification gates not green" },
    RELEASED: () =>
      validated
        ? { ok: true, evidence: "mission proven — release authorized by governance" }
        : { ok: false, evidence: "release blocked (mission unproven)" },
    // ARCHIVED is intentionally absent: it is owned by the Mission Ledger (markArchived).
  };
}

function loadStateMachine() {
  const sm = readJsonSafe(STATE_MACHINE);
  if (!sm || !sm.transitions) {
    throw new Error(`state machine unreadable at ${STATE_MACHINE}`);
  }
  return sm;
}

/**
 * Compute the achieved lifecycle state for `mission` by walking the state machine from its
 * initialState, advancing while each next state's evidence predicate holds AND governance authorizes
 * the transition. Writes mission-lifecycle.json and returns the lifecycle object.
 */
function computeLifecycle(mission) {
  const sm = loadStateMachine();
  const evidence = buildEvidence(mission);

  const path_ = [sm.initialState];
  const transitions = [];
  let current = sm.initialState;

  // Walk the single linear chain of the state machine, capping before the terminal ARCHIVED.
  while (true) {
    const nexts = sm.transitions[current] || [];
    if (nexts.length === 0) break;
    const next = nexts[0];
    if (next === sm.terminalState) break; // ARCHIVED is owned by the Ledger

    // Governance must authorize leaving the current state.
    const gov = authorizeMission(mission, current);
    if (!gov.authorized || !gov.nextStates.includes(next)) {
      transitions.push({ from: current, to: next, ok: false, evidence: "governance did not authorize" });
      break;
    }

    const probe = (evidence[next] || (() => ({ ok: false, evidence: "no evidence probe" })))();
    transitions.push({ from: current, to: next, ok: probe.ok, evidence: probe.evidence });
    if (!probe.ok) break;

    current = next;
    path_.push(current);
  }

  const lifecycle = {
    mission,
    initialState: sm.initialState,
    achieved: current,
    terminalState: sm.terminalState,
    archived: false,
    path: path_,
    transitions,
  };

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(LIFECYCLE_FILE, JSON.stringify(lifecycle, null, 2));
  return lifecycle;
}

/**
 * Terminal archival, owned by the Mission Ledger: once a proven mission is appended to the immutable
 * ledger, its governance lifecycle reaches ARCHIVED. Only advances RELEASED → ARCHIVED (and only if
 * governance authorizes it); otherwise leaves the achieved state untouched. Idempotent.
 */
function markArchived(mission) {
  const sm = loadStateMachine();
  const lifecycle = readJsonSafe(LIFECYCLE_FILE) || computeLifecycle(mission);
  if (lifecycle.achieved === sm.terminalState) return lifecycle;

  const gov = authorizeMission(mission, lifecycle.achieved);
  const canArchive =
    gov.authorized && gov.nextStates.includes(sm.terminalState) && lifecycle.achieved === "RELEASED";

  if (canArchive) {
    lifecycle.transitions.push({
      from: lifecycle.achieved,
      to: sm.terminalState,
      ok: true,
      evidence: "recorded in immutable mission ledger",
    });
    lifecycle.achieved = sm.terminalState;
    lifecycle.path.push(sm.terminalState);
    lifecycle.archived = true;
    fs.writeFileSync(LIFECYCLE_FILE, JSON.stringify(lifecycle, null, 2));
  }
  return lifecycle;
}

module.exports = { computeLifecycle, markArchived, LIFECYCLE_FILE };

if (require.main === module) {
  const mission = process.argv[2] || "BUILD_RUNTIME";
  const lifecycle = computeLifecycle(mission);
  console.log("======================================");
  console.log("MISSION LIFECYCLE (governance-driven)");
  console.log("======================================");
  console.log("Mission  :", mission);
  console.log("Achieved :", lifecycle.achieved);
  console.log("Path     :", lifecycle.path.join(" → "));
  const lastBlock = lifecycle.transitions.find((t) => !t.ok);
  if (lastBlock) console.log("Blocked  :", `${lastBlock.from}→${lastBlock.to} (${lastBlock.evidence})`);
  console.log("Output   :", LIFECYCLE_FILE);
  console.log("======================================");
}
