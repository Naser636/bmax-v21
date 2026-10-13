#!/usr/bin/env node

"use strict";

/*
 * Autonomy Measure — Phase 03 OFFLINE autonomy-share calculator (CTO limited authorization 2026-10-11).
 *
 * PURPOSE. Fill the Phase 03 measurement gap: compute, from ALREADY-produced work records, an HONEST
 * autonomy ratio with an EXPLICIT denominator and per-actor/per-category attribution. It does NOT run
 * a mission, does NOT read the filesystem, network, clock, or any mutable runtime state, and is NOT
 * wired into any execution path. It is a PURE, DETERMINISTIC function of its inputs.
 *
 * REUSE, NOT DUPLICATION. The EVIDENCE axis (did an objective run and produce valid evidence) is owned
 * by `objective-attribution.js` (VERDICT = EVIDENCED/RECORDED-NO-EVIDENCE/FAILED/UNMATCHED/INCONSISTENT).
 * This module owns a DIFFERENT, missing axis: the ACTOR/CATEGORY denominator (who did the work, and how
 * much of the eligible-authorized work ODG itself executed AND verified). `fromAttribution()` adapts that
 * module's output into work-units so the two COMPOSE — this module re-implements no evidence logic. To
 * stay pure/offline it does NOT import that module (which transitively loads network-capable probes);
 * the caller/test passes attribution output in as plain data.
 *
 * HARD HONESTY INVARIANTS (by construction):
 *   - A plan / intention / declaration is NEVER counted as executed work (only kind ACTION can be).
 *   - A result without VALID evidence is NEVER counted as a verified ODG step.
 *   - No work unit is counted twice (duplicate ids ⇒ not measurable).
 *   - Missing / inconsistent / ambiguous data ⇒ an EXPLICITLY not-measurable result (percent = null),
 *     never a misleading percentage.
 *   - A null denominator (no eligible-authorized units) ⇒ not measurable.
 *   - Completed, accepted, and evidence-valid are reported as DISTINCT counts; a high percentage is
 *     NEVER an ACCEPTED decision — this module emits no acceptance verdict at all.
 */

const ACTOR = Object.freeze({ ODG: "ODG", OPERATOR: "OPERATOR", EXTERNAL: "EXTERNAL" });
const KIND = Object.freeze({ ACTION: "ACTION", PLAN: "PLAN", INTENTION: "INTENTION", DECLARATION: "DECLARATION" });

const CATEGORY = Object.freeze({
  ODG_EXECUTED_VERIFIED: "ODG_EXECUTED_VERIFIED",     // numerator: ODG did it AND evidence is valid
  ODG_EXECUTED_UNVERIFIED: "ODG_EXECUTED_UNVERIFIED", // ODG did it but no valid evidence (NOT numerator)
  OPERATOR_OR_EXTERNAL: "OPERATOR_OR_EXTERNAL",       // a human operator or external tool did it
  BLOCKED_REFUSED_FAILED: "BLOCKED_REFUSED_FAILED",   // blocked / refused / failed work
  HUMAN_MANDATORY: "HUMAN_MANDATORY",                 // mandatory human intervention required
  NOT_EXECUTED: "NOT_EXECUTED",                       // eligible but not executed (plan/pending/recorded)
});

const DONE_STATUS = Object.freeze(new Set(["EXECUTED", "APPLIED", "DONE"]));
const FAIL_STATUS = Object.freeze(new Set(["FAILED", "BLOCKED", "REFUSED"]));
// Recognized statuses that represent eligible work NOT (yet) executed (outstanding, not a failure).
const NOT_EXECUTED_STATUS = Object.freeze(new Set(["RECORDED", "DEFERRED", "PENDING", "RUNNING"]));
// The FULL authorized status vocabulary of the measurer's contract. A status outside this set is
// unrecognized data (F1): it makes the measurement not-measurable, and is NEVER silently bucketed.
const KNOWN_STATUS = Object.freeze(new Set([...DONE_STATUS, ...FAIL_STATUS, ...NOT_EXECUTED_STATUS]));
const VALID_ACTORS = Object.freeze(new Set([ACTOR.ODG, ACTOR.OPERATOR, ACTOR.EXTERNAL]));
const VALID_KINDS = Object.freeze(new Set([KIND.ACTION, KIND.PLAN, KIND.INTENTION, KIND.DECLARATION]));

// CTO Phase-03 — the closed authoredBy vocabulary (origin of a patch's CREATION, proven at the boundary).
// Only ODG_* origins are ODG-authored. PROVIDER/OPERATOR are known non-ODG. CONTRACT and UNKNOWN are not a
// proven ODG authorship ⇒ they can NEVER enter the numerator and, per contract, make the unit ambiguous.
const AUTHORED_BY = Object.freeze({
  ODG_CAPABILITY: "ODG_CAPABILITY", ODG_RULES: "ODG_RULES",
  PROVIDER: "PROVIDER", OPERATOR: "OPERATOR", CONTRACT: "CONTRACT", UNKNOWN: "UNKNOWN",
});
const ODG_AUTHORS = Object.freeze(new Set([AUTHORED_BY.ODG_CAPABILITY, AUTHORED_BY.ODG_RULES]));
const APPLIED_BY_ODG = "ODG_EXECUTOR";
// Map a proven authoredBy to a measurement actor. A patch APPLIED by ODG is not CREATED by ODG: only an
// ODG_* author maps to ODG. PROVIDER⇒EXTERNAL, OPERATOR⇒OPERATOR. Anything unproven (CONTRACT/UNKNOWN/other)
// ⇒ null, which the builder turns into an ambiguous (not-measurable) unit — never silently counted.
function actorFromAuthoredBy(a) {
  if (ODG_AUTHORS.has(a)) return ACTOR.ODG;
  if (a === AUTHORED_BY.PROVIDER) return ACTOR.EXTERNAL;
  if (a === AUTHORED_BY.OPERATOR) return ACTOR.OPERATOR;
  return null;
}

function notMeasurable(reason, partial) {
  return Object.freeze({
    measurable: false,
    reason,
    autonomyPercent: null,
    denominator: partial && typeof partial.denominator === "number" ? partial.denominator : null,
    categories: null,
    excluded: partial && typeof partial.excluded === "number" ? partial.excluded : null,
    distinctions: null,
  });
}

/**
 * Validate one work-unit's SHAPE (not its semantics). Returns an error string, or null when well-formed.
 * A malformed unit anywhere makes the whole measurement not-measurable (fail-closed on bad data).
 */
function shapeError(u) {
  if (!u || typeof u !== "object") return "unit is not an object";
  if (typeof u.id !== "string" || u.id.length === 0) return "unit.id missing";
  for (const f of ["eligible", "authorized", "verified", "humanMandatory"]) {
    if (typeof u[f] !== "boolean") return `unit.${f} must be boolean (${u.id})`;
  }
  if (typeof u.status !== "string" || u.status.length === 0) return `unit.status missing (${u.id})`;
  // F1: a status outside the authorized vocabulary is unrecognized/incoherent data — reject it here so
  // it can never be silently classified NOT_EXECUTED and yield a percentage over bad input.
  if (!KNOWN_STATUS.has(u.status)) return `unit.status unrecognized: "${u.status}" (${u.id})`;
  if (!VALID_KINDS.has(u.kind)) return `unit.kind invalid (${u.id})`;
  if (u.actor !== null && !VALID_ACTORS.has(u.actor)) return `unit.actor invalid (${u.id})`;
  if ("appliedBy" in u && u.appliedBy !== null && typeof u.appliedBy !== "string") return `unit.appliedBy must be string|null (${u.id})`;
  if ("accepted" in u && typeof u.accepted !== "boolean") return `unit.accepted must be boolean (${u.id})`;
  if ("ambiguous" in u && typeof u.ambiguous !== "boolean") return `unit.ambiguous must be boolean (${u.id})`;
  return null;
}

/**
 * Classify ONE eligible, well-formed unit into exactly one CATEGORY, or return {ambiguous:reason} when
 * the unit cannot be honestly attributed (forces a not-measurable overall result). Mutually exclusive.
 */
function classify(u) {
  if (u.ambiguous === true) return { ambiguous: `unit flagged ambiguous (${u.id})` };
  if (u.humanMandatory === true) return { category: CATEGORY.HUMAN_MANDATORY };
  if (FAIL_STATUS.has(u.status)) return { category: CATEGORY.BLOCKED_REFUSED_FAILED };
  // A plan / intention / declaration is never executed work — regardless of status or actor.
  if (u.kind !== KIND.ACTION) return { category: CATEGORY.NOT_EXECUTED };
  if (DONE_STATUS.has(u.status)) {
    if (u.actor === null) return { ambiguous: `done work without an actor (${u.id})` };
    if (u.actor === ACTOR.ODG) {
      // Author vs applicator: ODG may AUTHOR but not APPLY. If an explicit appliedBy says a non-ODG
      // component applied it, it is not ODG-autonomous end-to-end ⇒ external, never the numerator.
      if (u.appliedBy != null && u.appliedBy !== APPLIED_BY_ODG) return { category: CATEGORY.OPERATOR_OR_EXTERNAL };
      return { category: u.verified === true ? CATEGORY.ODG_EXECUTED_VERIFIED : CATEGORY.ODG_EXECUTED_UNVERIFIED };
    }
    return { category: CATEGORY.OPERATOR_OR_EXTERNAL }; // OPERATOR or EXTERNAL
  }
  // ACTION that is neither done nor failed (e.g. RECORDED / DEFERRED / PENDING): eligible but not executed.
  return { category: CATEGORY.NOT_EXECUTED };
}

/**
 * measureAutonomy — the pure calculator.
 * @param {Array<object>} units  work-unit records (see shapeError for the schema).
 * @returns {object} a frozen result; measurable:false carries a reason and autonomyPercent:null.
 */
function measureAutonomy(units) {
  if (!Array.isArray(units)) return notMeasurable("input is not an array");

  // 1. Shape + duplicate-id validation across ALL units (bad data anywhere ⇒ not measurable).
  const seen = new Set();
  for (const u of units) {
    const err = shapeError(u);
    if (err) return notMeasurable(`malformed work unit: ${err}`);
    if (seen.has(u.id)) return notMeasurable(`duplicate work unit id: ${u.id}`);
    seen.add(u.id);
    // A unit explicitly flagged ambiguous (e.g. eligibility unprovable, or an inconsistent attribution
    // join) poisons the whole measurement — we cannot even safely place it in/out of the denominator.
    if (u.ambiguous === true) return notMeasurable(`ambiguous work unit (eligibility/attribution unprovable): ${u.id}`);
  }

  // 2. Denominator = eligible AND authorized units; the rest are excluded (and never counted).
  const eligible = units.filter((u) => u.eligible === true && u.authorized === true);
  const excluded = units.length - eligible.length;
  if (eligible.length === 0) {
    return notMeasurable("null denominator: no eligible-authorized units", { denominator: 0, excluded });
  }

  // 3. Classify each eligible unit into exactly one category; any ambiguity ⇒ not measurable.
  const categories = {
    [CATEGORY.ODG_EXECUTED_VERIFIED]: 0,
    [CATEGORY.ODG_EXECUTED_UNVERIFIED]: 0,
    [CATEGORY.OPERATOR_OR_EXTERNAL]: 0,
    [CATEGORY.BLOCKED_REFUSED_FAILED]: 0,
    [CATEGORY.HUMAN_MANDATORY]: 0,
    [CATEGORY.NOT_EXECUTED]: 0,
  };
  for (const u of eligible) {
    const c = classify(u);
    if (c.ambiguous) return notMeasurable(`ambiguous attribution: ${c.ambiguous}`, { denominator: eligible.length, excluded });
    categories[c.category] += 1;
  }

  // 4. Distinct counts (never conflated): completed vs accepted vs evidence-valid.
  const distinctions = {
    completed: eligible.filter((u) => DONE_STATUS.has(u.status)).length,
    accepted: eligible.filter((u) => u.accepted === true).length,
    evidenceValid: eligible.filter((u) => u.verified === true).length,
  };

  // 5. Ratio = ODG-executed-AND-verified over the eligible-authorized denominator. One decimal.
  const denominator = eligible.length;
  const numerator = categories[CATEGORY.ODG_EXECUTED_VERIFIED];
  const autonomyPercent = Math.round((numerator / denominator) * 1000) / 10;

  return Object.freeze({
    measurable: true,
    reason: null,
    denominator,
    numerator,
    autonomyPercent,
    categories: Object.freeze(categories),
    excluded,
    distinctions: Object.freeze(distinctions),
  });
}

/**
 * fromAttribution — REUSE adapter. Converts `objective-attribution.js` output (plain data: {objectives:[
 * {objectiveId, verdict, status, ...}]}) + a per-objective metadata map into work-units, WITHOUT importing
 * that module. The attribution VERDICT supplies the evidence axis; `metaById` supplies the actor/eligibility
 * axis that attribution does not carry. Missing metadata for an objective ⇒ an ambiguous unit (fail-closed).
 * Pure: a function of its inputs only.
 */
function fromAttribution(attribution, metaById) {
  const objectives = attribution && Array.isArray(attribution.objectives) ? attribution.objectives : [];
  const meta = metaById && typeof metaById === "object" ? metaById : {};
  return objectives.map((o) => {
    const id = typeof o.objectiveId === "string" && o.objectiveId ? o.objectiveId : `(anon:${o.verdict})`;
    const m = Object.prototype.hasOwnProperty.call(meta, id) ? meta[id] : null;

    // F2: eligibility + authorization must be PROVEN by metadata to enter the denominator. Unknown
    // metadata is read as proof of NEITHER side — it is never defaulted to eligible, and never
    // converted into proof of ineligibility. Only an EXPLICIT eligible:false is a justified exclusion.
    let eligible = false;
    let authorized = false;
    let metaAmbiguous = false;
    if (!m) {
      metaAmbiguous = true; // no metadata ⇒ eligibility unprovable ⇒ poison (not measurable)
    } else if (m.eligible === false) {
      eligible = false; authorized = false; // explicit, justified exclusion from the denominator
    } else if (m.eligible === true && m.authorized === true) {
      eligible = true; authorized = true;
    } else {
      metaAmbiguous = true; // partial/contradictory metadata ⇒ eligibility unprovable ⇒ poison
    }

    const base = {
      id,
      eligible,
      authorized,
      actor: m && VALID_ACTORS.has(m.actor) ? m.actor : null,
      humanMandatory: m ? m.humanMandatory === true : false,
      kind: m && VALID_KINDS.has(m.kind) ? m.kind : KIND.ACTION,
      accepted: m ? m.accepted === true : false,
    };

    // Map the EVIDENCE verdict (owned by objective-attribution) onto status/verified. Statuses stay
    // within the authorized vocabulary (F1); a >1 join is carried as a verdict-level ambiguity.
    let status; let verified = false; let verdictAmbiguous = false;
    switch (o.verdict) {
      case "EVIDENCED": status = "EXECUTED"; verified = true; break;
      case "RECORDED-NO-EVIDENCE": status = "EXECUTED"; break;
      case "FAILED": status = "FAILED"; break;
      case "UNMATCHED": status = "PENDING"; break; // planned, never executed ⇒ NOT_EXECUTED
      case "INCONSISTENT": status = "RECORDED"; verdictAmbiguous = true; break; // >1 join ⇒ not measurable
      default: status = "RECORDED"; verdictAmbiguous = true; break; // unexpected verdict ⇒ not measurable
    }

    const unit = { ...base, status, verified };
    // Meta-level ambiguity ALWAYS poisons (we cannot even safely exclude an unprovable unit). A
    // verdict-level ambiguity poisons only when the unit is actually in the denominator — an
    // explicitly-excluded (eligible:false) objective's join inconsistency is irrelevant to the measure.
    if (metaAmbiguous || (eligible && verdictAmbiguous)) unit.ambiguous = true;
    return unit;
  });
}

/**
 * fromExecution — REUSE adapter building work-units from the EXISTING execution evidence (no 2nd ledger).
 * @param {object} patchExecution  parsed patch-execution.json: { executed:[{objectiveId|action, status,
 *                                  authoredBy, appliedBy, humanMandatory, ...}] }.
 * @param {object|null} attribution objective-attribution output; an objective is `verified` ONLY when its
 *                                  verdict is EVIDENCED. Absent ⇒ nothing is verified (terminal status
 *                                  alone is NOT verification).
 * @param {object} eligibilityByObjective  {objectiveId:{eligible,authorized}} EXPLICITLY proving which
 *                                  CONTRACT objectives are in the authorized denominator (eligibility is
 *                                  never inferred from a mission-level grant). Its keys define the full
 *                                  denominator universe; a recorded result with no entry here ⇒ ambiguous.
 * @param {object} [opts]           { runComplete?: boolean } — assert the run processed EVERY contract
 *                                  objective, so a contract objective absent from results is genuinely
 *                                  NOT_EXECUTED. Absent/false ⇒ an absent objective is ambiguous (an early
 *                                  stop is never treated as proof of non-execution).
 * Pure: a function of its inputs only.
 */
function fromExecution(patchExecution, attribution, eligibilityByObjective, opts) {
  const executed = patchExecution && Array.isArray(patchExecution.executed) ? patchExecution.executed : [];
  const elig = eligibilityByObjective && typeof eligibilityByObjective === "object" ? eligibilityByObjective : {};
  // runComplete asserts the run processed every contract objective (so an absent result is genuinely
  // not-executed, not an early stop). Default false ⇒ an absent objective is ambiguous (fail-closed).
  const runComplete = !!(opts && opts.runComplete === true);
  const verified = new Set();
  const attrObjs = attribution && Array.isArray(attribution.objectives) ? attribution.objectives : [];
  for (const o of attrObjs) {
    if (o && typeof o.objectiveId === "string" && o.verdict === "EVIDENCED") verified.add(o.objectiveId);
  }
  // Normalize a recorded status into the authorized vocabulary. DUPLICATE is a reconciled replay with no
  // fresh effect ⇒ treated as not-executed-this-run. An unrecognized status ⇒ null (⇒ ambiguous unit).
  const normStatus = (s) => {
    if (DONE_STATUS.has(s) || FAIL_STATUS.has(s) || NOT_EXECUTED_STATUS.has(s)) return s;
    if (s === "DUPLICATE") return "RECORDED";
    return null;
  };
  const idOf = (e) => (e && typeof e.objectiveId === "string" && e.objectiveId) ? e.objectiveId
    : (e && typeof e.action === "string" && e.action) ? e.action : "(anon)";

  // Index results by objectiveId; a SAME-objective recorded twice is an inconsistent join (ambiguous).
  const byId = new Map();
  const dupIds = new Set();
  for (const e of executed) {
    const id = idOf(e);
    if (byId.has(id)) dupIds.add(id); else byId.set(id, e);
  }
  // Denominator universe = CONTRACT objectives (eligibility keys) UNION recorded results, so a contract
  // objective with no result is represented (never dropped) and a stray result is never silently ignored.
  const ids = new Set([...Object.keys(elig), ...byId.keys()]);

  const units = [];
  for (const id of ids) {
    const em = Object.prototype.hasOwnProperty.call(elig, id) ? elig[id] : null;
    const base = {
      id,
      eligible: em ? em.eligible === true : false,
      authorized: em ? em.authorized === true : false,
      kind: KIND.ACTION,
    };
    // Inconsistent join (>1 result for one objective) ⇒ ambiguous (no double attribution).
    if (dupIds.has(id)) {
      units.push({ ...base, actor: null, status: "RECORDED", verified: false, humanMandatory: false, appliedBy: null, ambiguous: true });
      continue;
    }
    const e = byId.get(id) || null;
    if (!e) {
      // CONTRACT objective with NO result this run. Interpretable as NOT_EXECUTED (outstanding) ONLY when
      // the run is KNOWN-complete AND eligibility is proven; otherwise an early stop makes the absence
      // ambiguous — never assume non-execution, never claim a complete denominator from inference.
      const unit = { ...base, actor: null, status: "PENDING", verified: false, humanMandatory: false, appliedBy: null };
      if (!em || !runComplete) unit.ambiguous = true;
      units.push(unit);
      continue;
    }
    const authoredBy = (typeof e.authoredBy === "string" && e.authoredBy) ? e.authoredBy : AUTHORED_BY.UNKNOWN;
    const actor = actorFromAuthoredBy(authoredBy);
    const status = normStatus(e.status);
    const unit = {
      ...base,
      actor,
      status: status || "RECORDED",
      verified: verified.has(id),
      humanMandatory: e.humanMandatory === true,
      appliedBy: (typeof e.appliedBy === "string" || e.appliedBy === null) ? e.appliedBy : null,
    };
    // Fail-closed ambiguity: unproven eligibility, or an unrecognized status, ALWAYS poison. An unproven
    // AUTHOR (actor null — CONTRACT/UNKNOWN) poisons ONLY a unit claiming DONE work: a genuine no-op /
    // failure / block is classified by status alone and has no author to prove. This is the RECORDED-as-
    // NOT_EXECUTED projection (the source event is never mutated — the executor's record is read as-is).
    const isDone = DONE_STATUS.has(unit.status);
    if (!em || status === null || (actor === null && isDone)) unit.ambiguous = true;
    units.push(unit);
  }
  return units;
}

/**
 * describeExecution — DESCRIPTIVE per-category ventilation of execution events for OBSERVABILITY.
 * It is explicitly NOT a denominator and NOT a percentage: it classifies every recorded event by proven
 * authorship / applicator / verification / status so a report can show WHAT happened without claiming an
 * eligible+authorized denominator. Uses the SAME primitives as the gated measure (one source of truth).
 * An inconsistent join (same objectiveId twice) is counted once and flagged, never double-counted.
 * @param {object} patchExecution  parsed patch-execution.json.
 * @param {object|null} attribution objective-attribution output (EVIDENCED ⇒ verified; absent ⇒ none).
 * @returns {{counts:object, inconsistent:number, total:number}} frozen.
 */
function describeExecution(patchExecution, attribution) {
  const executed = patchExecution && Array.isArray(patchExecution.executed) ? patchExecution.executed : [];
  const verified = new Set();
  const attrObjs = attribution && Array.isArray(attribution.objectives) ? attribution.objectives : [];
  for (const o of attrObjs) {
    if (o && typeof o.objectiveId === "string" && o.verdict === "EVIDENCED") verified.add(o.objectiveId);
  }
  const normStatus = (s) =>
    (DONE_STATUS.has(s) || FAIL_STATUS.has(s) || NOT_EXECUTED_STATUS.has(s)) ? s : (s === "DUPLICATE" ? "RECORDED" : null);
  const idOf = (e) => (e && typeof e.objectiveId === "string" && e.objectiveId) ? e.objectiveId
    : (e && typeof e.action === "string" && e.action) ? e.action : "(anon)";
  const counts = { odgExecutedVerified: 0, external: 0, blockedFailed: 0, humanMandatory: 0, notExecuted: 0, unknownOrUnverified: 0 };
  const seen = new Set();
  let inconsistent = 0;
  for (const e of executed) {
    const id = idOf(e);
    if (seen.has(id)) { inconsistent += 1; continue; } // inconsistent join: count once, flag — no double count
    seen.add(id);
    const actor = actorFromAuthoredBy((e && typeof e.authoredBy === "string" && e.authoredBy) ? e.authoredBy : AUTHORED_BY.UNKNOWN);
    const status = normStatus(e && e.status);
    const appliedBy = e && (typeof e.appliedBy === "string" || e.appliedBy === null) ? e.appliedBy : null;
    if (e && e.humanMandatory === true) counts.humanMandatory += 1;
    else if (status && FAIL_STATUS.has(status)) counts.blockedFailed += 1;
    else if (status && NOT_EXECUTED_STATUS.has(status)) counts.notExecuted += 1;
    else if (status && DONE_STATUS.has(status)) {
      if (actor === ACTOR.ODG && appliedBy !== null && appliedBy !== APPLIED_BY_ODG) counts.external += 1; // ODG-authored, applied by another
      else if (actor === ACTOR.ODG && verified.has(id)) counts.odgExecutedVerified += 1;
      else if (actor === ACTOR.EXTERNAL || actor === ACTOR.OPERATOR) counts.external += 1;
      else counts.unknownOrUnverified += 1; // ODG-authored but unverified, or CONTRACT/UNKNOWN author on DONE
    } else counts.unknownOrUnverified += 1; // unrecognized status
  }
  return Object.freeze({ counts: Object.freeze(counts), inconsistent, total: executed.length });
}

/**
 * eligibilityFromObjectives — build the eligibility denominator map from EXPLICIT per-objective contract
 * declarations ONLY (CTO Phase-03). It reads `objective.authorization = {eligible, authorized, excluded?,
 * reason?}` and NEVER infers eligibility from authorizedPaths / requiresEngineering / executor identity /
 * status (a contract DECLARATION is not a runtime authorization proof). Returns {map, complete, missing}:
 *   - map[objectiveId] = { eligible, authorized } for a VALID declaration; a justified exclusion
 *     (excluded:true + non-empty reason, not contradicting eligible) ⇒ { eligible:false, authorized:false }.
 *   - complete = every objective produced a valid classification (so the denominator can be complete).
 *   - missing = objective ids whose declaration is absent, invalid, contradictory, or an unjustified
 *     exclusion — the caller MUST treat the mission as NON_MEASURABLE when missing is non-empty.
 * Nothing is ever defaulted to eligible/authorized=true. Pure.
 */
function eligibilityFromObjectives(planObjectives) {
  const objectives = Array.isArray(planObjectives) ? planObjectives : [];
  const map = {};
  const missing = [];
  for (const o of objectives) {
    const id = o && typeof o.id === "string" && o.id ? o.id : null;
    if (id === null) { missing.push("(no id)"); continue; }
    const a = o && o.authorization && typeof o.authorization === "object" && !Array.isArray(o.authorization) ? o.authorization : null;
    if (!a) { missing.push(id); continue; } // no explicit declaration ⇒ UNKNOWN (never defaulted eligible)
    if (a.excluded === true) {
      const reasonOk = typeof a.reason === "string" && a.reason.trim().length > 0;
      const contradictory = a.eligible === true; // excluded yet declared eligible ⇒ contradictory
      if (reasonOk && !contradictory) map[id] = { eligible: false, authorized: false }; // justified exclusion
      else missing.push(id); // unjustified / contradictory exclusion ⇒ ambiguous
      continue;
    }
    if (typeof a.eligible === "boolean" && typeof a.authorized === "boolean") {
      map[id] = { eligible: a.eligible, authorized: a.authorized };
    } else {
      missing.push(id); // non-boolean / incomplete declaration ⇒ ambiguous
    }
  }
  return { map, complete: missing.length === 0, missing };
}

module.exports = { measureAutonomy, fromAttribution, fromExecution, describeExecution, eligibilityFromObjectives, CATEGORY, ACTOR, KIND, AUTHORED_BY };
