#!/usr/bin/env node
"use strict";
/*
 * V320+ — NATIVE-AUTONOMY LADDER SCORECARD. PURE, deterministic, fail-closed.
 *
 * The session measured native autonomy across five e2e missions (V317 bounded-deterministic → V318 novel synthesis →
 * V319 multi-module+stack-trace → V319b accept/abstain corpus → V320 multi-module cross-file + router-driven selection),
 * each writing a committed evidence JSON. Those measurements were SCATTERED across five files with five different
 * summary shapes. This module normalises each real evidence summary into one canonical ladder record and reports the
 * result PER DIFFICULTY CATEGORY.
 *
 * Governance (CTO §10.4 / §22): the ladder MUST NOT be collapsed into a single blended "autonomy %" — distinct
 * difficulty categories measure distinct things and a blended headline is misleading. This module therefore reports a
 * per-category breakdown + a plain COUNT census, and EXPLICITLY REFUSES to emit a single capability percentage. It also
 * does NOT invent numbers: every field is derived from the injected evidence summary (schema-keyed normaliser); an
 * unrecognised schema is reported as UNRECOGNISED, never guessed. No network/clock/randomness; composes existing
 * evidence (no new mission, no new engine). This is a read-only measurement VIEW, not a capability claim.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function freeze(o: any): any { return Object.freeze(o); }
function num(v: any): number { return typeof v === "number" && Number.isFinite(v) ? v : 0; }

// Difficulty rungs, ordered weakest→hardest. The ladder is traversed in this order; `category` names stay separate.
const RUNGS = Object.freeze(["bounded-deterministic", "novel-synthesis", "multi-module+stack-trace", "accept/abstain-corpus", "multi-module-routed"]);

/**
 * normaliseMission(evidence) -> canonical frozen record { recognised, schema, rung, category, cases, accepted,
 * generalised, escalatedOrAbstained, independentlyAgreed, honestBoundary }. Schema-keyed; unknown schema ⇒ UNRECOGNISED
 * (never guessed). `generalised`/`independentlyAgreed` are null when the mission did not measure them.
 */
function normaliseMission(evidence: any): any {
  if (!isObj(evidence)) return freeze({ recognised: false, schema: null, reason: "evidence is not an object" });
  const s = isObj(evidence.summary) ? evidence.summary : {};
  const schema = typeof evidence.schema === "string" ? evidence.schema : (typeof s.missionsTotal === "number" ? "v317-e2e" : null);

  if (schema === "v317-e2e") {
    const cases = num(s.missionsTotal);
    const accepted = num(s.nativeRepairedGreen) + num(s.nativeGreen);
    return freeze({ recognised: true, schema, rung: 0, category: "bounded-deterministic", cases, accepted,
      generalised: null, escalatedOrAbstained: num(s.escalatedHonestly), independentlyAgreed: s.ollamaDiscriminatedAll === true,
      honestBoundary: "deterministic catalog repairs (bounded); not novel synthesis" });
  }
  if (schema === "v318-novel-synthesis") {
    return freeze({ recognised: true, schema, rung: 1, category: "novel-synthesis", cases: num(s.total), accepted: num(s.novelAccepted),
      generalised: num(s.acceptedGeneralised), escalatedOrAbstained: num(s.abstained), independentlyAgreed: null,
      honestBoundary: `novel (non-catalog) fixes, model-dependent; overfit=${num(s.acceptedButOverfit)}, exact rollback on abstain` });
  }
  if (schema === "v319-harder-battery") {
    return freeze({ recognised: true, schema, rung: 2, category: "multi-module+stack-trace", cases: num(s.total), accepted: num(s.accepted),
      generalised: num(s.acceptedGeneralised), escalatedOrAbstained: num(s.abstained), independentlyAgreed: s.independentModelAgreedCorrect === s.accepted && num(s.accepted) > 0,
      honestBoundary: `accept-rate ${num(s.acceptRate)} on a harder corpus; abstains restored exactly` });
  }
  if (schema === "v319b-corpus-taxonomy") {
    return freeze({ recognised: true, schema, rung: 3, category: "accept/abstain-corpus", cases: num(s.total), accepted: num(s.accepted),
      generalised: num(s.acceptedGeneralised), escalatedOrAbstained: num(s.abstained), independentlyAgreed: num(s.eval3bAgreed) === num(s.accepted) && num(s.accepted) > 0,
      honestBoundary: `accept-rate ${num(s.acceptRate)} (n=${num(s.total)}); generalised<accepted ⇒ overfit tail documented` });
  }
  if (schema === "v320-multimodule-routed") {
    return freeze({ recognised: true, schema, rung: 4, category: "multi-module-routed", cases: num(s.total), accepted: num(s.accepted),
      generalised: num(s.acceptedGeneralised), escalatedOrAbstained: num(s.escalated), independentlyAgreed: num(s.eval3bAgreed) === num(s.accepted) && num(s.accepted) > 0,
      honestBoundary: `router-driven; ${num(s.escalated)} honest escalation (no local model, not auto-paid); correct-bug-file ${num(s.multiModuleEditedBugFile)}/${num(s.accepted)}` });
  }
  return freeze({ recognised: false, schema, reason: "unrecognised evidence schema — not normalised (no guessing)" });
}

/**
 * ladder(missions) -> frontier + PER-CATEGORY breakdown + a COUNT census. Explicitly REFUSES a single blended
 * autonomy % (CTO §22). `missions` is an array of raw evidence objects. Unrecognised entries are surfaced, not dropped
 * silently, and excluded from the census.
 */
function ladder(missions: any): any {
  const list = Array.isArray(missions) ? missions : [];
  if (!list.length) return freeze({ ok: false, code: "NO_MISSIONS" });
  const normalised = list.map(normaliseMission);
  const recognised = normalised.filter((m: any) => m.recognised).slice().sort((a: any, b: any) => a.rung - b.rung);
  const unrecognised = normalised.filter((m: any) => !m.recognised);

  const census = recognised.reduce((c: any, m: any) => {
    c.missions += 1; c.totalCases += m.cases; c.accepted += m.accepted; c.escalatedOrAbstained += m.escalatedOrAbstained; return c;
  }, { missions: 0, totalCases: 0, accepted: 0, escalatedOrAbstained: 0 });

  const frontier = recognised.length ? recognised[recognised.length - 1].category : null;
  const honestBoundaries = freeze(recognised.map((m: any) => freeze({ category: m.category, boundary: m.honestBoundary })));

  return freeze({
    ok: true,
    frontier,                                   // highest difficulty rung actually reached (measured, not claimed)
    perCategory: freeze(recognised),            // each rung reported SEPARATELY — the canonical view
    census: freeze(census),                     // plain counts only (a census, NOT a capability score)
    unrecognised: freeze(unrecognised),         // surfaced, never silently dropped
    blendedAutonomyScore: null,                 // REFUSED on purpose
    blendedScoreRefusal: "A single blended autonomy percentage is REFUSED (CTO §22): the rungs measure distinct difficulty classes (bounded → novel → multi-module → corpus → routed) and a combined headline would be misleading. Read perCategory + honestBoundaries.",
    note: "read-only measurement view aggregating real committed evidence (V317→V320); normalisation is schema-keyed and invents no numbers; harder rungs remain model- and difficulty-dependent — not a general-autonomy guarantee",
  });
}

const AUTONOMY_LADDER_CONTRACT = Object.freeze({
  id: "V320-AUTONOMY-LADDER-SCORECARD",
  purpose: "normalise the five scattered native-autonomy e2e evidence files into ONE per-category ladder view (V317→V320)",
  reuses: Object.freeze(["docs/odg/autonomy/V317..V320 committed evidence", "odg-model-router measured capability (V320 rung)"]),
  invariants: Object.freeze([
    "report PER DIFFICULTY CATEGORY — never collapse into one blended autonomy % (CTO §10.4/§22)",
    "invent no numbers: every field derives from the injected evidence summary via a schema-keyed normaliser",
    "unrecognised schema ⇒ UNRECOGNISED (surfaced, excluded from census) — never guessed",
    "census is COUNTS only (a census), explicitly NOT a capability score",
    "PURE + deterministic; no network/clock/randomness; composes existing evidence (no new mission/engine)",
    "read-only view: makes NO capability claim beyond what the measured evidence already states",
  ]),
});

module.exports = { RUNGS, normaliseMission, ladder, AUTONOMY_LADDER_CONTRACT };
export {};
