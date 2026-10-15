#!/usr/bin/env node

"use strict";

/*
 * Autonomy Measure (TypeScript port; parity with runtime/core/autonomy-measure.js).
 *
 * PURE, DETERMINISTIC OFFLINE autonomy-share calculator: computes, from already-produced work records,
 * an honest autonomy ratio with an EXPLICIT denominator and per-actor/per-category attribution. No
 * filesystem / network / clock / mutable state. Strict TS port: the ten public exports, every frozen
 * constant, the fail-closed honesty invariants (plan/intention/declaration never counted as executed;
 * no valid evidence ⇒ never numerator; duplicate/ambiguous/null-denominator ⇒ not-measurable), field
 * order and detail messages are preserved EXACTLY. The historical .js remains the behavioural reference.
 */

const ACTOR = Object.freeze({ ODG: "ODG", OPERATOR: "OPERATOR", EXTERNAL: "EXTERNAL" });
const KIND = Object.freeze({ ACTION: "ACTION", PLAN: "PLAN", INTENTION: "INTENTION", DECLARATION: "DECLARATION" });

const CATEGORY = Object.freeze({
  ODG_EXECUTED_VERIFIED: "ODG_EXECUTED_VERIFIED",
  ODG_EXECUTED_UNVERIFIED: "ODG_EXECUTED_UNVERIFIED",
  OPERATOR_OR_EXTERNAL: "OPERATOR_OR_EXTERNAL",
  BLOCKED_REFUSED_FAILED: "BLOCKED_REFUSED_FAILED",
  HUMAN_MANDATORY: "HUMAN_MANDATORY",
  NOT_EXECUTED: "NOT_EXECUTED",
});

const DONE_STATUS = Object.freeze(new Set(["EXECUTED", "APPLIED", "DONE"]));
const FAIL_STATUS = Object.freeze(new Set(["FAILED", "BLOCKED", "REFUSED"]));
const NOT_EXECUTED_STATUS = Object.freeze(new Set(["RECORDED", "DEFERRED", "PENDING", "RUNNING"]));
const KNOWN_STATUS = Object.freeze(new Set([...DONE_STATUS, ...FAIL_STATUS, ...NOT_EXECUTED_STATUS]));
const VALID_ACTORS = Object.freeze(new Set([ACTOR.ODG, ACTOR.OPERATOR, ACTOR.EXTERNAL]));
const VALID_KINDS = Object.freeze(new Set([KIND.ACTION, KIND.PLAN, KIND.INTENTION, KIND.DECLARATION]));

const AUTHORED_BY = Object.freeze({
  ODG_CAPABILITY: "ODG_CAPABILITY", ODG_RULES: "ODG_RULES",
  PROVIDER: "PROVIDER", OPERATOR: "OPERATOR", CONTRACT: "CONTRACT", UNKNOWN: "UNKNOWN",
});
const ODG_AUTHORS = Object.freeze(new Set([AUTHORED_BY.ODG_CAPABILITY, AUTHORED_BY.ODG_RULES]));
const APPLIED_BY_ODG = "ODG_EXECUTOR";

function actorFromAuthoredBy(a: any): any {
  if (ODG_AUTHORS.has(a)) return ACTOR.ODG;
  if (a === AUTHORED_BY.PROVIDER) return ACTOR.EXTERNAL;
  if (a === AUTHORED_BY.OPERATOR) return ACTOR.OPERATOR;
  return null;
}

function notMeasurable(reason: string, partial?: any): any {
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

function shapeError(u: any): string | null {
  if (!u || typeof u !== "object") return "unit is not an object";
  if (typeof u.id !== "string" || u.id.length === 0) return "unit.id missing";
  for (const f of ["eligible", "authorized", "verified", "humanMandatory"]) {
    if (typeof u[f] !== "boolean") return `unit.${f} must be boolean (${u.id})`;
  }
  if (typeof u.status !== "string" || u.status.length === 0) return `unit.status missing (${u.id})`;
  if (!KNOWN_STATUS.has(u.status)) return `unit.status unrecognized: "${u.status}" (${u.id})`;
  if (!VALID_KINDS.has(u.kind)) return `unit.kind invalid (${u.id})`;
  if (u.actor !== null && !VALID_ACTORS.has(u.actor)) return `unit.actor invalid (${u.id})`;
  if ("appliedBy" in u && u.appliedBy !== null && typeof u.appliedBy !== "string") return `unit.appliedBy must be string|null (${u.id})`;
  if ("accepted" in u && typeof u.accepted !== "boolean") return `unit.accepted must be boolean (${u.id})`;
  if ("ambiguous" in u && typeof u.ambiguous !== "boolean") return `unit.ambiguous must be boolean (${u.id})`;
  return null;
}

function classify(u: any): any {
  if (u.ambiguous === true) return { ambiguous: `unit flagged ambiguous (${u.id})` };
  if (u.humanMandatory === true) return { category: CATEGORY.HUMAN_MANDATORY };
  if (FAIL_STATUS.has(u.status)) return { category: CATEGORY.BLOCKED_REFUSED_FAILED };
  if (u.kind !== KIND.ACTION) return { category: CATEGORY.NOT_EXECUTED };
  if (DONE_STATUS.has(u.status)) {
    if (u.actor === null) return { ambiguous: `done work without an actor (${u.id})` };
    if (u.actor === ACTOR.ODG) {
      if (u.appliedBy != null && u.appliedBy !== APPLIED_BY_ODG) return { category: CATEGORY.OPERATOR_OR_EXTERNAL };
      return { category: u.verified === true ? CATEGORY.ODG_EXECUTED_VERIFIED : CATEGORY.ODG_EXECUTED_UNVERIFIED };
    }
    return { category: CATEGORY.OPERATOR_OR_EXTERNAL };
  }
  return { category: CATEGORY.NOT_EXECUTED };
}

function measureAutonomy(units: any): any {
  if (!Array.isArray(units)) return notMeasurable("input is not an array");

  const seen = new Set();
  for (const u of units) {
    const err = shapeError(u);
    if (err) return notMeasurable(`malformed work unit: ${err}`);
    if (seen.has(u.id)) return notMeasurable(`duplicate work unit id: ${u.id}`);
    seen.add(u.id);
    if (u.ambiguous === true) return notMeasurable(`ambiguous work unit (eligibility/attribution unprovable): ${u.id}`);
  }

  const eligible = units.filter((u: any) => u.eligible === true && u.authorized === true);
  const excluded = units.length - eligible.length;
  if (eligible.length === 0) {
    return notMeasurable("null denominator: no eligible-authorized units", { denominator: 0, excluded });
  }

  const categories: any = {
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

  const distinctions = {
    completed: eligible.filter((u: any) => DONE_STATUS.has(u.status)).length,
    accepted: eligible.filter((u: any) => u.accepted === true).length,
    evidenceValid: eligible.filter((u: any) => u.verified === true).length,
  };

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

function fromAttribution(attribution: any, metaById: any): any {
  const objectives = attribution && Array.isArray(attribution.objectives) ? attribution.objectives : [];
  const meta = metaById && typeof metaById === "object" ? metaById : {};
  return objectives.map((o: any) => {
    const id = typeof o.objectiveId === "string" && o.objectiveId ? o.objectiveId : `(anon:${o.verdict})`;
    const m = Object.prototype.hasOwnProperty.call(meta, id) ? meta[id] : null;

    let eligible = false;
    let authorized = false;
    let metaAmbiguous = false;
    if (!m) {
      metaAmbiguous = true;
    } else if (m.eligible === false) {
      eligible = false; authorized = false;
    } else if (m.eligible === true && m.authorized === true) {
      eligible = true; authorized = true;
    } else {
      metaAmbiguous = true;
    }

    const base: any = {
      id,
      eligible,
      authorized,
      actor: m && VALID_ACTORS.has(m.actor) ? m.actor : null,
      humanMandatory: m ? m.humanMandatory === true : false,
      kind: m && VALID_KINDS.has(m.kind) ? m.kind : KIND.ACTION,
      accepted: m ? m.accepted === true : false,
    };

    let status; let verified = false; let verdictAmbiguous = false;
    switch (o.verdict) {
      case "EVIDENCED": status = "EXECUTED"; verified = true; break;
      case "RECORDED-NO-EVIDENCE": status = "EXECUTED"; break;
      case "FAILED": status = "FAILED"; break;
      case "UNMATCHED": status = "PENDING"; break;
      case "INCONSISTENT": status = "RECORDED"; verdictAmbiguous = true; break;
      default: status = "RECORDED"; verdictAmbiguous = true; break;
    }

    const unit: any = { ...base, status, verified };
    if (metaAmbiguous || (eligible && verdictAmbiguous)) unit.ambiguous = true;
    return unit;
  });
}

function fromExecution(patchExecution: any, attribution: any, eligibilityByObjective: any, opts?: any): any {
  const executed = patchExecution && Array.isArray(patchExecution.executed) ? patchExecution.executed : [];
  const elig = eligibilityByObjective && typeof eligibilityByObjective === "object" ? eligibilityByObjective : {};
  const runComplete = !!(opts && opts.runComplete === true);
  const verified = new Set();
  const attrObjs = attribution && Array.isArray(attribution.objectives) ? attribution.objectives : [];
  for (const o of attrObjs) {
    if (o && typeof o.objectiveId === "string" && o.verdict === "EVIDENCED") verified.add(o.objectiveId);
  }
  const normStatus = (s: any) => {
    if (DONE_STATUS.has(s) || FAIL_STATUS.has(s) || NOT_EXECUTED_STATUS.has(s)) return s;
    if (s === "DUPLICATE") return "RECORDED";
    return null;
  };
  const idOf = (e: any) => (e && typeof e.objectiveId === "string" && e.objectiveId) ? e.objectiveId
    : (e && typeof e.action === "string" && e.action) ? e.action : "(anon)";

  const byId = new Map();
  const dupIds = new Set();
  for (const e of executed) {
    const id = idOf(e);
    if (byId.has(id)) dupIds.add(id); else byId.set(id, e);
  }
  const ids = new Set([...Object.keys(elig), ...byId.keys()]);

  const units: any[] = [];
  for (const id of ids) {
    const em = Object.prototype.hasOwnProperty.call(elig, id) ? elig[id] : null;
    const base: any = {
      id,
      eligible: em ? em.eligible === true : false,
      authorized: em ? em.authorized === true : false,
      kind: KIND.ACTION,
    };
    if (dupIds.has(id)) {
      units.push({ ...base, actor: null, status: "RECORDED", verified: false, humanMandatory: false, appliedBy: null, ambiguous: true });
      continue;
    }
    const e = byId.get(id) || null;
    if (!e) {
      const unit: any = { ...base, actor: null, status: "PENDING", verified: false, humanMandatory: false, appliedBy: null };
      if (!em || !runComplete) unit.ambiguous = true;
      units.push(unit);
      continue;
    }
    const authoredBy = (typeof e.authoredBy === "string" && e.authoredBy) ? e.authoredBy : AUTHORED_BY.UNKNOWN;
    const actor = actorFromAuthoredBy(authoredBy);
    const status = normStatus(e.status);
    const unit: any = {
      ...base,
      actor,
      status: status || "RECORDED",
      verified: verified.has(id),
      humanMandatory: e.humanMandatory === true,
      appliedBy: (typeof e.appliedBy === "string" || e.appliedBy === null) ? e.appliedBy : null,
    };
    const isDone = DONE_STATUS.has(unit.status);
    if (!em || status === null || (actor === null && isDone)) unit.ambiguous = true;
    units.push(unit);
  }
  return units;
}

function describeExecution(patchExecution: any, attribution: any): any {
  const executed = patchExecution && Array.isArray(patchExecution.executed) ? patchExecution.executed : [];
  const verified = new Set();
  const attrObjs = attribution && Array.isArray(attribution.objectives) ? attribution.objectives : [];
  for (const o of attrObjs) {
    if (o && typeof o.objectiveId === "string" && o.verdict === "EVIDENCED") verified.add(o.objectiveId);
  }
  const normStatus = (s: any) =>
    (DONE_STATUS.has(s) || FAIL_STATUS.has(s) || NOT_EXECUTED_STATUS.has(s)) ? s : (s === "DUPLICATE" ? "RECORDED" : null);
  const idOf = (e: any) => (e && typeof e.objectiveId === "string" && e.objectiveId) ? e.objectiveId
    : (e && typeof e.action === "string" && e.action) ? e.action : "(anon)";
  const counts: any = { odgExecutedVerified: 0, external: 0, blockedFailed: 0, humanMandatory: 0, notExecuted: 0, unknownOrUnverified: 0 };
  const seen = new Set();
  let inconsistent = 0;
  for (const e of executed) {
    const id = idOf(e);
    if (seen.has(id)) { inconsistent += 1; continue; }
    seen.add(id);
    const actor = actorFromAuthoredBy((e && typeof e.authoredBy === "string" && e.authoredBy) ? e.authoredBy : AUTHORED_BY.UNKNOWN);
    const status = normStatus(e && e.status);
    const appliedBy = e && (typeof e.appliedBy === "string" || e.appliedBy === null) ? e.appliedBy : null;
    if (e && e.humanMandatory === true) counts.humanMandatory += 1;
    else if (status && FAIL_STATUS.has(status)) counts.blockedFailed += 1;
    else if (status && NOT_EXECUTED_STATUS.has(status)) counts.notExecuted += 1;
    else if (status && DONE_STATUS.has(status)) {
      if (actor === ACTOR.ODG && appliedBy !== null && appliedBy !== APPLIED_BY_ODG) counts.external += 1;
      else if (actor === ACTOR.ODG && verified.has(id)) counts.odgExecutedVerified += 1;
      else if (actor === ACTOR.EXTERNAL || actor === ACTOR.OPERATOR) counts.external += 1;
      else counts.unknownOrUnverified += 1;
    } else counts.unknownOrUnverified += 1;
  }
  return Object.freeze({ counts: Object.freeze(counts), inconsistent, total: executed.length });
}

function eligibilityFromObjectives(planObjectives: any): any {
  const objectives = Array.isArray(planObjectives) ? planObjectives : [];
  const map: any = {};
  const missing: string[] = [];
  for (const o of objectives) {
    const id = o && typeof o.id === "string" && o.id ? o.id : null;
    if (id === null) { missing.push("(no id)"); continue; }
    const a = o && o.authorization && typeof o.authorization === "object" && !Array.isArray(o.authorization) ? o.authorization : null;
    if (!a) { missing.push(id); continue; }
    if (a.excluded === true) {
      const reasonOk = typeof a.reason === "string" && a.reason.trim().length > 0;
      const contradictory = a.eligible === true;
      if (reasonOk && !contradictory) map[id] = { eligible: false, authorized: false };
      else missing.push(id);
      continue;
    }
    if (typeof a.eligible === "boolean" && typeof a.authorized === "boolean") {
      map[id] = { eligible: a.eligible, authorized: a.authorized };
    } else {
      missing.push(id);
    }
  }
  return { map, complete: missing.length === 0, missing };
}

module.exports = { measureAutonomy, fromAttribution, fromExecution, describeExecution, eligibilityFromObjectives, CATEGORY, ACTOR, KIND, AUTHORED_BY };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal helpers
// (actorFromAuthoredBy / notMeasurable / shapeError / classify) are MODULE-scoped, not global script
// scope (prevents cross-lot TS2393). The CommonJS API above is unchanged.
export {};
