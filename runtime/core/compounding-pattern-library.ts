#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 8 / M-CH5-02 (Compounding engine — program §8). PURE, deterministic. Two capabilities:
 *  (1) admitPattern — the §8.2 method/pattern library: a repair/method pattern is admitted as an official PROCEDURE
 *      only if it is VALIDATED, carries provenance, AND declares its conditions of application + limits (§8.2:
 *      "chaque motif doit comporter ses conditions d'application, ses limites et ses contre-exemples"). An
 *      OBSERVED-but-unvalidated pattern is WORKING (not yet a procedure); one missing conditions/limits is INCOMPLETE.
 *  (2) classifyMemory — the §8.3 rule: an observation is NOT automatically a fact; an unvalidated result does NOT
 *      become an official procedure. Classifies a record into working/episodic/semantic/procedural/strategic with its
 *      fact/procedure eligibility. REUSES memory-taxonomy.qualityOf as the validation lens. Fail-closed. Dual export.
 */

const TAX = require("./memory-taxonomy");              // qualityOf — validation/provenance/staleness lens

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

const TIER = Object.freeze(["PROCEDURE", "WORKING", "INCOMPLETE", "REJECTED"]);
const MEMORY_FAMILIES = Object.freeze(["working", "episodic", "semantic", "procedural", "strategic"]);

/** admitPattern(pattern) -> { tier, admittedAsProcedure, reasons }. A pattern is a PROCEDURE only if VALIDATED + provenance + conditions + limits. */
function admitPattern(pattern: any): any {
  const p = isObj(pattern) ? pattern : {};
  const reasons: string[] = [];
  const hasShape = isStr(p.id) && isStr(p.method);
  if (!hasShape) return gate("REJECTED", false, ["pattern needs a stable id + method"]);
  // §8.2: a pattern without its conditions of application + limits is unsafe to reuse.
  const hasConditions = arr(p.conditions).length > 0;
  const hasLimits = arr(p.limits).length > 0;
  if (!hasConditions || !hasLimits) { if (!hasConditions) reasons.push("missing conditions of application"); if (!hasLimits) reasons.push("missing limits"); return gate("INCOMPLETE", false, reasons); }

  const validated = isObj(p.validation) && p.validation.status === "VALIDATED" && isStr(p.validation.provenance);
  if (!validated) { reasons.push("not VALIDATED (or no provenance) ⇒ WORKING pattern, not yet an official procedure (§8.3)"); return gate("WORKING", false, reasons); }
  reasons.push("VALIDATED + provenance + conditions + limits ⇒ admitted as an official PROCEDURE");
  return gate("PROCEDURE", true, reasons);
}

function gate(tier: string, admittedAsProcedure: boolean, reasons: string[]): any { return Object.freeze({ tier, admittedAsProcedure, reasons: Object.freeze(reasons) }); }

/**
 * classifyMemory(record, asOf) -> { family, quality, isFact, isProcedure }. §8.3 fail-closed:
 * an observation is a FACT only if VALIDATED (quality OK, not unverified/invalidated); an unvalidated result is NOT a procedure.
 */
function classifyMemory(record: any, asOf: any): any {
  const r = isObj(record) ? record : {};
  const family = MEMORY_FAMILIES.includes(r.family) ? r.family : "working";
  const quality = TAX.qualityOf(r, asOf);              // OK / UNVERIFIED / STALE / NO_PROVENANCE / INVALIDATED
  const validated = quality === "OK";
  // an observation becomes a FACT only when validated; a semantic/procedural claim is official only when validated.
  const isFact = validated && (r.kind === "observation" ? r.corroborated === true : true) && family !== "working";
  const isProcedure = validated && family === "procedural";
  return Object.freeze({
    family, quality,
    isFact,                 // §8.3: an observation is NOT automatically a fact
    isProcedure,            // §8.3: an unvalidated result does NOT become an official procedure
    note: validated ? "validated record" : `quality ${quality} ⇒ not a fact/procedure (fail-closed)`,
  });
}

const COMPOUNDING_PATTERN_LIBRARY_CONTRACT = Object.freeze({
  id: "V5-COMPOUNDING-PATTERN-LIBRARY",
  source: "ODG Master program §8 (Compounding) — §8.2 pattern library + §8.3 five memories + fact/procedure discipline",
  tiers: TIER, memoryFamilies: MEMORY_FAMILIES,
  reuses: Object.freeze(["memory-taxonomy.qualityOf (validation/provenance/staleness lens)", "compounding-loop (consolidation discipline)"]),
  notAuthority: "a read-only admission/classification lens over patterns & memory; it consolidates nothing itself and grants no authority",
  invariants: Object.freeze([
    "a pattern is an official PROCEDURE only if VALIDATED + provenance + conditions of application + limits (§8.2); missing conditions/limits ⇒ INCOMPLETE",
    "an OBSERVED-but-unvalidated pattern is WORKING, never an official procedure",
    "§8.3: an observation is NOT automatically a fact (needs validation + corroboration); an unvalidated result does NOT become an official procedure",
    "classification uses memory-taxonomy.qualityOf; a non-OK quality ⇒ not a fact/procedure (fail-closed)",
    "pure/deterministic: pattern/record + asOf in → tier/classification out; no clock/random/network",
  ]),
});

module.exports = { admitPattern, classifyMemory, MEMORY_FAMILIES, COMPOUNDING_PATTERN_LIBRARY_CONTRACT };

if (require.main === module) {
  const proc = admitPattern({ id: "p1", method: "null-guard", conditions: ["input may be null"], limits: ["not for async"], validation: { status: "VALIDATED", provenance: "mission:M1" } });
  const obs = admitPattern({ id: "p2", method: "x", conditions: ["c"], limits: ["l"], validation: { status: "OBSERVED" } });
  process.stdout.write(JSON.stringify({ ...COMPOUNDING_PATTERN_LIBRARY_CONTRACT, demo: { validated: proc.tier, observed: obs.tier } }, null, 2) + "\n");
}

export {};
