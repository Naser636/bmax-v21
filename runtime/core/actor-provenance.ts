#!/usr/bin/env node
/**
 * actor-provenance (P0-AUTONOMY-MEASURE slice 2, MEASURE-ONLY) — PURE resolver that maps a mission's
 * patch-execution evidence to a SINGLE honest EXECUTOR actor, or to NOTHING when provenance is absent,
 * mission-mismatched, unmappable, or contradictory. It REUSES the autonomy-measure AUTHORED_BY vocabulary and
 * mirrors its one applied-sentinel; it invents no provenance and never reads proven/validated as an actor signal.
 *
 * Gate-B decisions encoded here: (1) source = the mission-scoped patch-execution.json (the ledger reads it, this
 * module interprets it); (2) this is a NEW module (no edit to autonomy-measure); (3) MEASURE-ONLY — the default
 * odg-delegate HISTORICAL path stamps no provenance, so its missions correctly resolve to NOTHING (omit), not ODG.
 *
 * Hard rules (CTO Gate-B invariants):
 *  - No ODG attribution without CONCORDANT author AND executor (authoredBy ∈ ODG_AUTHORS AND appliedBy = ODG_EXECUTOR).
 *  - Absent / contradictory / invalid / ambiguous evidence ⇒ NO attribution (return actor:null ⇒ the ledger omits).
 *  - Author ≠ executor: provider-authored content APPLIED by ODG is TECHNICAL_PROVIDER, never ODG.
 *  - Pure/deterministic; no fs/clock/net/mutable state (the caller injects the already-read report). No 10th primitive.
 */
"use strict";

const AM = require("./autonomy-measure.js");
const AUTHORED_BY = AM.AUTHORED_BY; // { ODG_CAPABILITY, ODG_RULES, PROVIDER, OPERATOR, CONTRACT, UNKNOWN }

// Honest EXECUTOR categories (superset of what the slice-2 WRITER produces). The writer emits only
// ODG | TECHNICAL_PROVIDER | HUMAN (or nothing); AUTOMATED_SYSTEM + UNKNOWN exist for the aggregator's defensive
// classification of any externally-written/hand-edited ledger value and for future provenance sources.
const EXECUTOR = Object.freeze({
  ODG: "ODG",
  TECHNICAL_PROVIDER: "TECHNICAL_PROVIDER",
  HUMAN: "HUMAN",
  AUTOMATED_SYSTEM: "AUTOMATED_SYSTEM",
  UNKNOWN: "UNKNOWN",
});
const RECOGNIZED = Object.freeze(new Set([EXECUTOR.ODG, EXECUTOR.TECHNICAL_PROVIDER, EXECUTOR.HUMAN, EXECUTOR.AUTOMATED_SYSTEM]));

// Mirrors autonomy-measure: ODG authorship set + the applied-by-ODG sentinel + the provider author strings.
const ODG_AUTHORS = Object.freeze(new Set([AUTHORED_BY.ODG_CAPABILITY, AUTHORED_BY.ODG_RULES]));
const APPLIED_BY_ODG = "ODG_EXECUTOR"; // mirrors autonomy-measure.APPLIED_BY_ODG (internal there)
const PROVIDER_AUTHORS = Object.freeze(new Set([AUTHORED_BY.PROVIDER, "LOCAL_PROVIDER"])); // reconcile LOCAL_PROVIDER → provider
const HUMAN_AUTHORS = Object.freeze(new Set([AUTHORED_BY.OPERATOR, AUTHORED_BY.CONTRACT]));

/**
 * resolveEntryActor(e): honest actor for ONE executed[] entry, or null when not confidently classifiable.
 *  - HUMAN: humanMandatory === true, or authoredBy ∈ {OPERATOR, CONTRACT}.
 *  - ODG: authoredBy ∈ {ODG_CAPABILITY, ODG_RULES} AND appliedBy === ODG_EXECUTOR (concordant author AND executor).
 *  - TECHNICAL_PROVIDER: authoredBy ∈ {PROVIDER, LOCAL_PROVIDER}.
 *  - null otherwise (unmapped author, or ODG-authored but NOT ODG-applied ⇒ demoted, never ODG).
 */
function resolveEntryActor(e: any): string | null {
  if (!e || typeof e !== "object") return null;
  if (e.humanMandatory === true) return EXECUTOR.HUMAN;
  const author = typeof e.authoredBy === "string" ? e.authoredBy : null;
  if (author && HUMAN_AUTHORS.has(author)) return EXECUTOR.HUMAN;
  if (author && ODG_AUTHORS.has(author) && e.appliedBy === APPLIED_BY_ODG) return EXECUTOR.ODG;
  if (author && PROVIDER_AUTHORS.has(author)) return EXECUTOR.TECHNICAL_PROVIDER;
  return null; // absent/unmapped author, or ODG-authored-but-not-ODG-applied ⇒ not confidently attributable
}

/**
 * resolveMissionActor(patchExecution, mission): reduce a mission's patch-execution.json to a SINGLE executor
 * actor. Returns { actor, executedBy, reason }. actor is non-null ONLY when a UNIQUE recognized actor resolves
 * across the executed[] entries (concordant). Fail-closed to { actor:null } on: absent report, mission mismatch
 * (strict ===), no executed[], no resolvable entry, or CONFLICTING resolved actors (ambiguous).
 */
function resolveMissionActor(patchExecution: any, mission: any): { actor: string | null; executedBy: string | null; reason: string } {
  if (!patchExecution || typeof patchExecution !== "object") return { actor: null, executedBy: null, reason: "no patch-execution evidence" };
  if (patchExecution.mission !== mission) return { actor: null, executedBy: null, reason: `patch-execution mission "${patchExecution.mission}" !== "${mission}" (cross-mission, refused)` };
  const executed: any[] = Array.isArray(patchExecution.executed) ? patchExecution.executed : [];
  if (executed.length === 0) return { actor: null, executedBy: null, reason: "no executed[] entries" };
  const resolved: string[] = [];
  for (const e of executed) { const a = resolveEntryActor(e); if (a !== null) resolved.push(a); }
  if (resolved.length === 0) return { actor: null, executedBy: null, reason: "no executed[] entry resolves to a recognized actor" };
  const distinct = Array.from(new Set(resolved));
  if (distinct.length > 1) return { actor: null, executedBy: null, reason: `contradictory executor signals [${distinct.join(", ")}] — ambiguous, no attribution` };
  const actor = distinct[0];
  // Compact audit trail of the raw signals that produced the stamp (only when a stamp is produced).
  const executedBy = executed
    .map((e: any) => `authoredBy=${(e && e.authoredBy) || "?"};appliedBy=${(e && e.appliedBy) || "none"}${e && e.humanMandatory === true ? ";humanMandatory" : ""}`)
    .join(" | ");
  return { actor, executedBy, reason: "unique recognized actor" };
}

module.exports = { resolveEntryActor, resolveMissionActor, EXECUTOR, RECOGNIZED };
export {};

if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const pe = (() => { try { return JSON.parse(fs.readFileSync(path.join("runtime", "generated", "patch-execution.json"), "utf8")); } catch { return null; } })();
  const mission = process.argv[2] || (pe && pe.mission) || "";
  process.stdout.write(JSON.stringify(resolveMissionActor(pe, mission), null, 2) + "\n");
}
