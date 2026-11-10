#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V36→LOT C — MULTI-MÉTIER COORDINATOR. PURE, deterministic, fail-closed. It does NOT reopen the closed
 * V17–V23 qualification nor rebuild the métier-parcours orchestrator — it COMPOSES it to add collective intelligence:
 * select the RELEVANT subset of the 15 métiers for a request (never all 15 by reflex), order by dependency, run them
 * (via the existing parcours — injected seam), cross-verify for contradictions, consolidate FAIL-CLOSED, and measure the
 * real collaboration gain vs an individual baseline. Decision power stays in ODG; a métier never self-authorizes.
 *
 * Each métier keeps its domain + contracts (from metier-parcours). Coordination adds: relevance selection, dependency
 * ordering, contradiction detection, consolidation, and a measured gain — nothing more. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// Métier → competency tags (which concerns each of the 15 covers). Used to pick the relevant subset.
const METIER_COMPETENCIES: any = Object.freeze({
  P1: ["quality", "semantic-regression"], P2: ["ai", "reliability"], P3: ["security", "supply-chain", "dependency"],
  P4: ["data", "drift"], P5: ["platform", "progressive-delivery", "canary"], P6: ["evaluation", "metrics"],
  P7: ["sre", "slo", "latency"], P8: ["release", "semver", "versioning"], P9: ["finops", "cost"],
  P10: ["regulatory", "incident", "compliance"], P11: ["document", "routing"], P12: ["resilience", "circuit-breaker"],
  P13: ["sustainability", "carbon"], P14: ["devex", "scaffold"], P15: ["workflow", "saga"],
});

/**
 * selectMetiers({ competenciesNeeded }) -> { selected, justification, excluded }. Picks only métiers whose competencies
 * intersect the request — NEVER all 15 by reflex. Fail-closed: an empty/unknown need ⇒ empty selection (ask, don't run all).
 */
function selectMetiers(input: any): any {
  const o = isObj(input) ? input : {};
  const needs = arr(o.competenciesNeeded).map((s) => String(s).toLowerCase());
  const selected: any[] = []; const excluded: any[] = [];
  for (const m of Object.keys(METIER_COMPETENCIES)) {
    const match = METIER_COMPETENCIES[m].some((c: string) => needs.includes(c));
    if (match) selected.push(m); else excluded.push(m);
  }
  return Object.freeze({
    selected: Object.freeze(selected), excludedCount: excluded.length,
    justification: selected.length ? `selected ${selected.length}/15 métiers whose competencies match [${needs.join(", ")}] — the other ${excluded.length} are not run (no reflexive 15-métier execution)` : "no competency match — nothing selected (fail-closed; clarify the request rather than run all 15)",
  });
}

/** orderByDependency(selected, deps) -> ordered ids (topological); a cycle ⇒ fail-closed, returns the input order + a flag. */
function orderByDependency(selected: any, deps: any = {}): any {
  const ids = arr(selected).map(String); const depmap = isObj(deps) ? deps : {};
  const order: string[] = []; const seen = new Set<string>(); const temp = new Set<string>(); let cycle = false;
  const visit = (id: string) => { if (seen.has(id)) return; if (temp.has(id)) { cycle = true; return; } temp.add(id); for (const d of arr(depmap[id])) if (ids.includes(String(d))) visit(String(d)); temp.delete(id); seen.add(id); order.push(id); };
  for (const id of ids) visit(id);
  return Object.freeze({ order: Object.freeze(cycle ? ids : order), cycle });
}

/** detectContradictions(results) -> contradictions[]. results: [{ metier, decision }]. Two métiers on the SAME subject
 *  that disagree (ADMIT vs REJECT) are flagged. */
function detectContradictions(results: any): any {
  const rs = arr(results).filter(isObj);
  const bySubject: any = {};
  for (const r of rs) { const k = r.subject || "(shared)"; (bySubject[k] = bySubject[k] || []).push(r); }
  const contradictions: any[] = [];
  for (const k of Object.keys(bySubject)) { const group = bySubject[k]; const admits = group.filter((g: any) => g.decision === "ADMIT"); const rejects = group.filter((g: any) => g.decision === "REJECT"); if (admits.length && rejects.length) contradictions.push(Object.freeze({ subject: k, admit: admits.map((a: any) => a.metier), reject: rejects.map((a: any) => a.metier) })); }
  return Object.freeze(contradictions);
}

/**
 * consolidate(results) -> { verdict, reason, contradictions }. FAIL-CLOSED: any REJECT ⇒ overall REJECT; a contradiction
 * (same subject, ADMIT vs REJECT) ⇒ ESCALATE (cross-verification needed, not a silent pick); all ADMIT ⇒ ADMIT.
 */
function consolidate(results: any): any {
  const rs = arr(results).filter(isObj);
  const contradictions = detectContradictions(rs);
  if (contradictions.length) return Object.freeze({ verdict: "ESCALATE", reason: "métiers contradict on a shared subject — cross-verification required (not resolved silently)", contradictions });
  if (rs.some((r) => r.decision === "REJECT")) return Object.freeze({ verdict: "REJECT", reason: "at least one métier REJECTS (fail-closed: a single reject blocks)", contradictions });
  if (rs.length && rs.every((r) => r.decision === "ADMIT")) return Object.freeze({ verdict: "ADMIT", reason: "all selected métiers ADMIT", contradictions });
  return Object.freeze({ verdict: "INCONCLUSIVE", reason: "no decisive result", contradictions });
}

/** collaborationGain(individualQuality, collaborativeQuality) -> { gain, better }. Measures whether coordination actually
 *  beats a single-métier baseline (not assumed). */
function collaborationGain(individualQuality: any, collaborativeQuality: any): any {
  const a = Number(individualQuality), b = Number(collaborativeQuality);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Object.freeze({ gain: null, better: null, note: "insufficient data to measure a collaboration gain" });
  return Object.freeze({ gain: Number((b - a).toFixed(4)), better: b > a, note: b > a ? "collaboration improved quality over the individual baseline" : "collaboration did NOT improve over the individual baseline (don't coordinate for its own sake)" });
}

const METIER_COORDINATOR_CONTRACT = Object.freeze({
  id: "V124-METIER-COORDINATOR",
  source: "CTO LOT C — multi-métier collective intelligence composing metier-parcours (no reopening V17–V23)",
  reuses: Object.freeze(["metier-parcours (the 15 guarded métiers — run via an injected seam)", "plan-evaluator discipline (constrained choice)"]),
  notAuthority: "selects/orders/cross-verifies/consolidates métier results; decision power stays in ODG; a métier never self-authorizes",
  invariants: Object.freeze([
    "only the RELEVANT competency-matching subset is selected — never all 15 by reflex; no match ⇒ nothing selected (clarify)",
    "consolidation is FAIL-CLOSED: any REJECT ⇒ REJECT; a contradiction (ADMIT vs REJECT on a subject) ⇒ ESCALATE (never resolved silently)",
    "dependency ordering is topological; a cycle is flagged fail-closed",
    "the collaboration gain is MEASURED vs an individual baseline — coordination is not assumed beneficial",
    "pure/deterministic; the closed V17–V23 qualification is not reopened; each métier keeps its domain + contracts",
  ]),
});

module.exports = { METIER_COMPETENCIES, selectMetiers, orderByDependency, detectContradictions, consolidate, collaborationGain, METIER_COORDINATOR_CONTRACT };

if (require.main === module) {
  const sel = selectMetiers({ competenciesNeeded: ["security", "release"] });
  const con = consolidate([{ metier: "P3", subject: "dep", decision: "ADMIT" }, { metier: "P8", subject: "dep", decision: "REJECT" }]);
  process.stdout.write(JSON.stringify({ ...METIER_COORDINATOR_CONTRACT, demo: { selected: sel.selected, notAll15: sel.selected.length < 15, contradictionEscalated: con.verdict === "ESCALATE" } }, null, 2) + "\n");
}

export {};
