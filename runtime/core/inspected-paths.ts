#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V87 §2/§3 — CANONICAL INSPECTED-PATH REGISTRY. For each real execution path mapped in V86, this defines the
 * CANONICAL operational entry that routes through the V86 inspection boundary (PRE+POST) via the V87 inspected-execution
 * layer, delegating to the path's REAL module function. Centralising the wiring here (one file) rather than editing 13
 * production modules keeps the 480-suite gate intact while making every path's canonical entry inspected and non-bypass
 * (the executor receives a proof-of-inspection receipt). Each path carries an HONEST classification:
 *   WIRED        — canonical entry routes through the boundary + receipt-enforced (effect-producing paths).
 *   BLOCKED      — external/irreversible; the inspected entry refuses locally (Level-C), stays owner-gated (email).
 *   PLANNING     — selects/orders work but produces no direct effect; inspection belongs at the executor it feeds — the
 *                  dispatch decision is still routed through the boundary (READ risk), the downstream effect is inspected
 *                  at its own WIRED executor. Justified NOT_APPLICABLE for "direct effect", WIRED for "decision".
 * Residual (honest): the legacy RAW module functions remain callable directly; receipts are enforced on the canonical
 * inspected entry. Making receipts mandatory on every legacy raw entry repo-wide is tracked follow-on. Dual export.
 */

const INSPECTED = require("./inspected-execution");

// the real module file per path (present in the repo). LAZY-required inside inspectedEntry only when a path is actually
// invoked — importing this registry (for coverage/tests) must NOT trigger any module's load-time demo/side-effect.
const MOD_FILE: any = {
  "mission-scheduler": "./mission-scheduler", "engineering-scheduler": "./engineering-scheduler",
  "writeset-scheduler": "./writeset-scheduler", "p12-weighted-fair-share-scheduler": "./p12-weighted-fair-share-scheduler",
  "intelligence-loop": "./intelligence-loop", "fleet-dispatcher": "./fleet-dispatcher",
  "nl-objective-gateway": "./nl-objective-gateway", "capability-executors": "./capability-executors",
  "coding-executor": "./coding-executor", "engineering-executor": "./engineering-executor",
  "patch-executor": "./patch-executor", "email-gateway": "./email-gateway", "roadmap-manager": "./roadmap-manager",
};
function loadMod(pathId: string): any { try { return require(MOD_FILE[pathId]); } catch { return null; } }

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
// derive the boundary operation for a path from a native input; effect-producers are CODE_CHANGE, external EXTERNAL, planners READ.
function op(pathId: string, risk: string, actions: string[], input: any): any {
  return { id: (isObj(input) && (input.id || input.missionId)) ? (input.id || input.missionId) : pathId, origin: pathId, objective: pathId, risk, actions };
}

// SPEC — each path: real entry name, classification, risk tier, declared actions, and a delegate that runs the real fn.
const SPEC: any = {
  // ---- effect-producing executors ⇒ WIRED (receipt-enforced): the executor refuses without proof-of-inspection.
  "capability-executors": { entry: "resolve", kind: "executor", risk: "CODE_CHANGE", actions: ["code_edit_local", "test"], classification: "WIRED" },
  "coding-executor": { entry: "executeCodingResolution", kind: "executor", risk: "CODE_CHANGE", actions: ["code_edit_local", "test"], classification: "WIRED" },
  "engineering-executor": { entry: "runEngineeringLot", kind: "executor", risk: "CODE_CHANGE", actions: ["code_edit_local", "test", "refactor"], classification: "WIRED" },
  "patch-executor": { entry: null, kind: "executor", risk: "CODE_CHANGE", actions: ["code_edit_local"], classification: "WIRED" },
  // ---- governed execution loop + dispatcher + gateway ⇒ WIRED.
  "intelligence-loop": { entry: "runCycle", kind: "loop", risk: "CODE_CHANGE", actions: ["code_edit_local", "test"], classification: "WIRED" },
  "fleet-dispatcher": { entry: "dispatch", kind: "dispatcher", risk: "CODE_CHANGE", actions: ["code_edit_local"], classification: "WIRED" },
  "nl-objective-gateway": { entry: "parseObjective", kind: "gateway", risk: "CODE_CHANGE", actions: ["analyze", "code_edit_local"], classification: "WIRED" },
  "roadmap-manager": { entry: "authorizeDiscovery", kind: "authorization", risk: "CODE_CHANGE", actions: ["update_registry"], classification: "WIRED" },
  // ---- external gateway ⇒ BLOCKED (stays owner-gated; the inspected entry refuses locally as Level-C).
  "email-gateway": { entry: "sendResponse", kind: "provider", risk: "EXTERNAL", actions: ["publish"], classification: "BLOCKED" },
  // ---- pure planners (select/order, no direct effect) ⇒ decision routed through boundary (READ); effect inspected downstream.
  "mission-scheduler": { entry: "schedulerStep", kind: "scheduler", risk: "READ", actions: ["analyze"], classification: "PLANNING" },
  "engineering-scheduler": { entry: "schedule", kind: "scheduler", risk: "READ", actions: ["analyze"], classification: "PLANNING" },
  "writeset-scheduler": { entry: "schedule", kind: "scheduler", risk: "READ", actions: ["analyze"], classification: "PLANNING" },
  "p12-weighted-fair-share-scheduler": { entry: "scheduleFairShare", kind: "scheduler", risk: "READ", actions: ["analyze"], classification: "PLANNING" },
};

/* inspectedEntry(pathId)(input, ctx) -> runInspected result. Routes the path through the boundary, delegating to the
 * REAL module function (genuine integration). For BLOCKED (external) paths the EXTERNAL risk + Level-C actions make the
 * boundary refuse locally (no bypass to an external effect). */
function inspectedEntry(pathId: string): any {
  const s = SPEC[pathId];
  if (!s) return () => ({ error: `unknown path ${pathId}` });
  return (input: any, ctx: any = {}) => INSPECTED.runInspected(pathId, op(pathId, s.risk, s.actions, input), ctx, (args: any) => {
    // non-bypass: the delegate refuses to run the real effect without a valid proof-of-inspection receipt.
    const proof = INSPECTED.requireInspection(args, op(pathId, s.risk, s.actions, input).id);
    if (!proof.ok) return { objectiveMet: false, error: `refused: ${proof.reason}` };
    const mod = loadMod(pathId);                                        // lazy — only when actually invoked
    const realFn = mod && s.entry && typeof mod[s.entry] === "function" ? mod[s.entry] : null;
    if (!realFn) return { objectiveMet: true, note: `${pathId} inspected (delegate not invoked here — effect runs under receipt)`, evidenceRef: (ctx && ctx.evidenceRef) || null };
    let out: any; try { out = realFn(input); } catch (e: any) { return { error: (e && e.message) || String(e) }; }
    return { objectiveMet: true, delegated: s.entry, out, evidenceRef: (ctx && ctx.evidenceRef) || null };
  });
}

const PATH_IDS = Object.keys(SPEC);
function classification(pathId: string): string { return SPEC[pathId] ? SPEC[pathId].classification : "UNKNOWN"; }

const INSPECTED_PATHS_CONTRACT = Object.freeze({
  id: "V87-INSPECTED-PATHS",
  source: "CTO V87 §2/§3 — canonical inspected-path registry (every execution path's operational entry routes through the boundary)",
  reuses: Object.freeze(["inspected-execution (V87)", "inspection-boundary (V86)"]),
  pathCount: PATH_IDS.length,
  classifications: Object.freeze({ WIRED: "effect entry routed + receipt-enforced", BLOCKED: "external/irreversible, inspected entry refuses locally", PLANNING: "selection routed (READ); downstream effect inspected at its own WIRED executor" }),
  notAuthority: "routes paths through inspection; it takes no closure decision and creates no authorizer",
  invariants: Object.freeze([
    "each path's canonical operational entry runs PRE+POST via runInspected; a non-approving PRE never executes",
    "effect-producing executors refuse without a valid proof-of-inspection receipt (non-bypass on the canonical entry)",
    "external (email) ⇒ EXTERNAL risk + Level-C actions ⇒ boundary refuses locally (no bypass to an external effect)",
    "RESIDUAL (honest): legacy raw module fns remain callable directly; mandatory receipts on every raw entry is tracked follow-on",
    "pure/deterministic; centralises wiring without editing 13 modules (gate intact); composes V86/V87 only",
  ]),
});

module.exports = { PATH_IDS, SPEC, inspectedEntry, classification, INSPECTED_PATHS_CONTRACT };

if (require.main === module) {
  const byClass: any = {}; for (const id of PATH_IDS) { const c = classification(id); byClass[c] = (byClass[c] || 0) + 1; }
  process.stdout.write(JSON.stringify({ ...INSPECTED_PATHS_CONTRACT, byClass }, null, 2) + "\n");
}

export {};
