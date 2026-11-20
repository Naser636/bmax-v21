#!/usr/bin/env node
"use strict";
/*
 * V327 §4 — NATIVE→PROVIDER ESCALATION DECISION ("fournisseur si nécessaire"). PURE, deterministic, fail-closed.
 * Completes the §4 chain step after native execution: when ODG's OWN local compute is MEASURED-insufficient for a task
 * AND a local attempt has failed, ODG delegates the task to the controlled provider via the EXISTING
 * odg-sovereign-delegation chain (createMission ⇒ the deny-by-default ODG→provider state machine; the provider CANNOT
 * self-authorize/self-accept, ODG remains the authority, an independent review gates acceptance).
 *
 * HONEST, EVIDENCE-GATED discipline (the whole point):
 *  - escalate ONLY when the calibrated resource policy flagged escalateIfStillFails (i.e. a CALIBRATED-LOW success rate)
 *    AND the local attempt actually failed. A THIN/UNKNOWN history ⇒ NO escalation (keep probing to gather evidence —
 *    escalation is never premature). A CALIBRATED-HIGH class that fluked a failure ⇒ NO escalation (retry locally).
 *  - escalation is NOT an autonomy win: the handoff is attributed CLAUDE_CODE_PROVIDER (ODG's authority decided it;
 *    the provider executes under the deny-by-default contract). It is the honest fallback, never a fabricated native success.
 * Composes odg-local-model-execution-policy + odg-sovereign-delegation; builds NO engine; authorizes nothing beyond
 * CREATING the (deny-by-default) delegation — the sovereign chain's gates still apply. No network/clock/randomness.
 */

const SD = require("./odg-sovereign-delegation.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * decideEscalation({ task, policyResult, localAttemptAccepted }) -> { escalate, reason, attribution, delegation }.
 *   task: { id, type? } — the failing task.  policyResult: odg-local-model-execution-policy.chooseExecutionPolicy(...).
 *   localAttemptAccepted: boolean — did the INDEPENDENT verifier accept the local build? (true ⇒ never escalate.)
 * delegation is a sovereign-delegation mission (CREATED) ONLY when escalating; otherwise null.
 */
function decideEscalation(input: any): any {
  const i = isObj(input) ? input : {};
  const task = isObj(i.task) ? i.task : {};
  const pol = isObj(i.policyResult) ? i.policyResult : {};
  const id = typeof task.id === "string" && task.id ? task.id : (typeof task.type === "string" ? task.type : "task");

  if (i.localAttemptAccepted === true)
    return freeze({ escalate: false, reason: "local attempt was ACCEPTED by the independent verifier — no provider escalation needed", attribution: "ODG_LOCAL_MODEL_EXECUTION", delegation: null });

  // Evidence gate: escalate ONLY on a CALIBRATED-LOW verdict (policy.escalateIfStillFails) AND a real local failure.
  if (pol.escalateIfStillFails !== true)
    return freeze({ escalate: false, reason: `local attempt failed but the policy did NOT flag escalation (tier=${pol.tier || "?"}, quality=${pol.quality || "?"}) — insufficient calibrated evidence of unsolvability ⇒ keep probing natively; escalation is evidence-gated, never premature`, attribution: "ODG_LOCAL_MODEL_EXECUTION", delegation: null });

  // ODG delegates to the controlled provider via the EXISTING sovereign-delegation chain (deny-by-default).
  const delegation = SD.createMission({
    id,
    objective: `provider handoff for "${id}": ODG's local compute is calibrated-unreliable (P=${pol.pForPlanner}) and the local attempt failed ⇒ delegate to the controlled provider`,
    reason: "evidence-gated native→provider escalation (CALIBRATED-low + local failure); deny-by-default; provider cannot self-accept; ODG remains the authority; an independent review gates acceptance",
  });
  return freeze({
    escalate: true,
    reason: `calibrated-low (P=${pol.pForPlanner}) AND local attempt failed ⇒ delegate to the provider (honest fallback, NOT a native success)`,
    attribution: "CLAUDE_CODE_PROVIDER",
    delegation,                       // sovereign-delegation mission in CREATED state — the deny-by-default chain follows
    note: "escalation hands execution to the provider; the result is NEVER attributed to ODG-native autonomy. ODG's authority decided the handoff from calibrated evidence; the sovereign-delegation chain (authorize→contract→provider-accept→execute→odg-verify→independent-review→accept) still gates everything.",
  });
}

const NATIVE_ESCALATION_CONTRACT = Object.freeze({
  id: "V327-NATIVE-ESCALATION",
  purpose: "§4 — the native→provider escalation DECISION ('fournisseur si nécessaire'): delegate a MEASURED-unsolvable task to the controlled provider via the EXISTING sovereign-delegation chain, evidence-gated and honestly attributed",
  reuses: Object.freeze(["odg-sovereign-delegation.createMission (the deny-by-default ODG→provider chain — not reimplemented)", "odg-local-model-execution-policy verdict (escalateIfStillFails from a CALIBRATED-low rate)"]),
  invariants: Object.freeze([
    "a local attempt ACCEPTED by the independent verifier ⇒ NEVER escalate",
    "escalate ONLY on a CALIBRATED-LOW policy verdict (escalateIfStillFails) AND a real local failure — a THIN/UNKNOWN history keeps probing (escalation is evidence-gated, never premature)",
    "escalation is the honest fallback, attributed CLAUDE_CODE_PROVIDER — NEVER a fabricated ODG-native success",
    "the handoff is a sovereign-delegation mission in CREATED state; the deny-by-default chain (provider cannot self-accept; independent review) still gates acceptance; ODG remains the authority",
    "composes policy + sovereign-delegation; builds NO engine/orchestrator; PURE/deterministic/frozen/fail-closed",
  ]),
});

module.exports = { decideEscalation, NATIVE_ESCALATION_CONTRACT };
export {};
