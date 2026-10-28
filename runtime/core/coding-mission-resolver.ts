#!/usr/bin/env node
/**
 * coding-mission-resolver — V47 Lot C (register C-08): the RESOLVER that connects the canonical MissionContext to
 * ODG's proven coding capabilities. It is the FIRST real consumer of the official MissionContext (which, per the
 * context-builder, nothing read before) and the first caller of code-mission-intake — closing the "detector/intake/
 * check/repair are built but never reached from the canonical path" gap. It is a RESOLVER (one of the nine
 * primitives), NOT a new orchestrator/registry: it reads the official context, resolves the coding action, and
 * returns a concrete bounded PLAN plus the objective-fidelity contract. It does NOT execute or schedule.
 *
 * Flow: MissionContext (official) + repoSignals (files/manifests from RuntimeContext/project-context)
 *   → code-mission-intake.routeCodeMission → { EXECUTE | ROUTE_UNSUPPORTED | ABSTAIN }
 *   → concrete plan (which proven module + authorized writeSet + acceptance) bounded to context.authorizedPaths
 *   → objective-fidelity contract derived from the mission's definitionOfDone / objectives.
 * Fail-closed; never fabricates a capability; honestly surfaces BLOCKED/UNSUPPORTED with the next action.
 */
"use strict";

const INTAKE = require("./code-mission-intake.js");
const FIDELITY = require("./objective-fidelity.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Known coding task families and the proven module each maps to (all live-verified in V45–V47).
const FAMILY_PLAN: Record<string, any> = Object.freeze({
  check: { module: "code-execution", entry: "runSyntaxCheck", desc: "real syntax/type CHECK (JS/TS/Python)" },
  "repair-exports": { module: "task-fix-exports", entry: "buildFixExportsTask→runRepairWorkflow", desc: "repair a defined-but-not-exported symbol" },
  "add-tests": { module: "task-add-tests", entry: "buildAddTestsTask→runRepairWorkflow", desc: "generate a characterization test from provided examples" },
  repair: { module: "repair-workflow", entry: "runRepairWorkflow", desc: "bounded repair from a supplied change (edits/fixers)" },
});

/** Build an objective-fidelity contract from the mission's definitionOfDone / objectives (each ⇒ a required outcome). */
function fidelityContractFrom(ctx: any): any {
  const outcomes: any[] = [];
  const dod = Array.isArray(ctx.definitionOfDone) ? ctx.definitionOfDone : [];
  dod.forEach((d: any, i: number) => outcomes.push({ id: `dod-${i + 1}`, acceptance: typeof d === "string" ? d : (d && d.text) || `criterion ${i + 1}` }));
  if (outcomes.length === 0) {
    const objs = Array.isArray(ctx.objectives) ? ctx.objectives : [];
    objs.forEach((o: any, i: number) => outcomes.push({ id: (o && o.id) || `obj-${i + 1}`, acceptance: (o && (o.done_when || o.goal)) || `objective ${i + 1}` }));
  }
  if (outcomes.length === 0) outcomes.push({ id: "default", acceptance: "mission objective satisfied with evidence" });
  return { objectiveId: ctx.mission, statement: `Coding mission: ${ctx.mission}`, requiredOutcomes: outcomes };
}

/**
 * resolveCodingMission(missionContext, repoSignals, opts?): resolve the canonical context to a concrete coding plan.
 * opts.family selects the task family (default "check" — the always-available capability). opts.toolchain overrides
 * the probe (tests). Returns { ok, codingMission, route, plan, fidelityContract, reason, nextAction }.
 */
function resolveCodingMission(missionContext: any, repoSignals: any, opts: any = {}): any {
  if (!isObj(missionContext) || typeof missionContext.mission !== "string") return { ok: false, code: "INVALID_INPUT", reason: "official MissionContext (with .mission) required" };
  if (!isObj(repoSignals)) return { ok: false, code: "INVALID_INPUT", reason: "repoSignals { files[], manifests{} } required (from RuntimeContext)" };

  const family = typeof opts.family === "string" && FAMILY_PLAN[opts.family] ? opts.family : "check";
  const authorizedPaths = Array.isArray(missionContext.authorizedPaths) ? missionContext.authorizedPaths : [];

  // Real routing decision from the proven intake (detection drives it).
  const routed = INTAKE.routeCodeMission(repoSignals, opts.toolchain ? { toolchain: opts.toolchain } : {});
  if (routed.ok === false) return { ok: false, code: routed.code || "INVALID_INPUT", reason: routed.detail || "intake rejected the repo signals" };

  const fidelityContract = fidelityContractFrom(missionContext);
  const famPlan = FAMILY_PLAN[family];

  let codingMission = true, plan: any = null, nextAction: string, reason: string;
  if (routed.route === "EXECUTE") {
    if (authorizedPaths.length === 0) {
      // Fail-closed: an executable coding mission with NO authorized write-set cannot safely make changes.
      return { ok: true, codingMission: true, route: "BLOCKED", plan: null, fidelityContract,
        reason: `language ${routed.language} is executable but the MissionContext has no authorizedPaths — refusing an unbounded write-set`,
        nextAction: "ODG must declare authorizedPaths for this mission before any repair/change family runs" };
    }
    plan = { family, module: famPlan.module, entry: famPlan.entry, language: routed.language, writeSet: authorizedPaths, acceptance: "mission-declared (definitionOfDone)", desc: famPlan.desc };
    reason = `${routed.language} is executable (verified checker + toolchain); mapped to family '${family}'`;
    nextAction = `execute ${famPlan.module}.${famPlan.entry} within authorizedPaths, then assess via objective-fidelity.assessCompletion`;
  } else if (routed.route === "ROUTE_UNSUPPORTED") {
    plan = { family: null, module: null, writeSet: authorizedPaths, desc: "no executable ODG checker/toolchain for the detected stack" };
    reason = `detected ${routed.language} but not executable here — ${routed.reason}`;
    nextAction = "route to axis-D subcontracting/partner (ODG does not fake execution)";
  } else { // ABSTAIN
    plan = null;
    reason = "no language detected / ambiguous repo";
    nextAction = "request a manifest or clearer inputs; do not proceed";
  }

  return { ok: true, codingMission, route: routed.route, language: routed.language, plan, fidelityContract,
    detection: routed.detection, reason, nextAction,
    note: "First real consumer of the official MissionContext + code-mission-intake. A RESOLVER (not an orchestrator): it returns a bounded plan + fidelity contract; execution is performed by the proven modules and assessed by objective-fidelity.assessCompletion against collected evidence.",
  };
}

/** assessCodingMissionCompletion(resolved, deliverables): convenience pass-through to the fidelity guard. */
function assessCodingMissionCompletion(resolved: any, deliverables: any): any {
  if (!isObj(resolved) || !resolved.fidelityContract) return { ok: false, code: "INVALID_INPUT", reason: "resolved mission with fidelityContract required" };
  return FIDELITY.assessCompletion(resolved.fidelityContract, deliverables);
}

export { resolveCodingMission, assessCodingMissionCompletion, fidelityContractFrom, FAMILY_PLAN };
module.exports = { resolveCodingMission, assessCodingMissionCompletion, fidelityContractFrom, FAMILY_PLAN };
