#!/usr/bin/env node
"use strict";
/*
 * V319 Addendum §11.6 — COST-AWARE, LOCAL-FIRST MODEL ROUTER (the one genuine autonomy-mechanism gap from the §4/§11
 * research crosswalk: ODG already has isolated workspaces, durable/resume/recovery, independent eval, policy gates and
 * decomposition — but NO model-capability selector). PURE, deterministic, fail-closed.
 *
 * Routes an engineering task to the CHEAPEST LOCAL model whose capability profile covers the task's difficulty —
 * "never assume the largest model is best" (external best-practice: phase-/difficulty-aware routing to the cheapest
 * sufficient model). Capability profiles come from THIS repo's MEASURED evidence (V318/V319b: qwen2.5-coder:3b handled
 * only easy deterministic repairs; :7b handled moderate novel + multi-module/stack-trace; hard remained below a
 * confident accept-rate) — NOT model marketing. If no local model covers the difficulty, it ESCALATES (a flagged
 * decision requiring authorization — NEVER an auto paid-API call; no spend here). No network/clock/randomness.
 */

const DIFFICULTIES = Object.freeze(["trivial", "easy", "moderate", "hard"]);
// Local pool ordered by COST (ascending). `covers` = difficulties demonstrated within reach by MEASURED evidence.
const LOCAL_POOL = Object.freeze([
  Object.freeze({ id: "qwen2.5:0.5b", costRank: 1, covers: Object.freeze(["trivial"]), evidence: "smallest; trivial/echo only" }),
  Object.freeze({ id: "qwen2.5-coder:3b", costRank: 2, covers: Object.freeze(["trivial", "easy"]), evidence: "V318: solved clamp (easy); abstained on harder (fail-closed)" }),
  Object.freeze({ id: "qwen2.5-coder:7b", costRank: 3, covers: Object.freeze(["trivial", "easy", "moderate"]), evidence: "V318/V319: novel synthesis + multi-module + stack-trace; V319b accept 0.667 on a harder corpus" }),
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function freeze(o: any): any { return Object.freeze(o); }

/**
 * selectModel({ difficulty, requireLocal? }) -> frozen routing decision.
 * Picks the CHEAPEST local model whose `covers` includes the difficulty. No local model covers it ⇒ ESCALATE_TO_PROVIDER
 * (flagged, requiresAuthorization — never an auto paid call). `requireLocal:true` forbids escalation (stays BLOCKED_LOCAL).
 */
function selectModel(input: any): any {
  const i = isObj(input) ? input : {};
  if (!DIFFICULTIES.includes(i.difficulty)) return freeze({ ok: false, code: "BAD_DIFFICULTY", detail: `difficulty must be one of ${DIFFICULTIES.join("|")}` });
  const candidates = LOCAL_POOL.filter((m: any) => m.covers.includes(i.difficulty)); // already cost-ascending
  const considered = LOCAL_POOL.map((m: any) => ({ id: m.id, costRank: m.costRank, covers: m.covers.includes(i.difficulty) }));
  if (candidates.length) {
    const chosen = candidates[0]; // cheapest sufficient — NOT the largest
    return freeze({ ok: true, difficulty: i.difficulty, decision: "LOCAL", model: chosen.id, costRank: chosen.costRank,
      rationale: `cheapest LOCAL model whose measured capability covers '${i.difficulty}' (${chosen.evidence})`,
      considered: freeze(considered), requiresAuthorization: false });
  }
  // no local model covers it
  if (i.requireLocal === true) return freeze({ ok: true, difficulty: i.difficulty, decision: "BLOCKED_LOCAL", model: null,
    rationale: "no local model covers this difficulty and requireLocal=true — refuse rather than overclaim local capability", considered: freeze(considered), requiresAuthorization: false });
  return freeze({ ok: true, difficulty: i.difficulty, decision: "ESCALATE_TO_PROVIDER", model: null,
    rationale: "no local model covers this difficulty; escalation to a frontier provider is a FLAGGED decision requiring authorization — never an automatic paid-API call",
    considered: freeze(considered), requiresAuthorization: true });
}

/** routeBatch(tasks) -> per-task decisions + a cost distribution (how many went to the cheapest tiers vs escalated). */
function routeBatch(tasks: any): any {
  const list = Array.isArray(tasks) ? tasks : [];
  if (!list.length) return freeze({ ok: false, code: "NO_TASKS" });
  const decisions = list.map((t: any, idx: number) => freeze({ taskId: isObj(t) && isStr(t.id) ? t.id : "t" + (idx + 1), ...selectModel(isObj(t) ? t : {}) }));
  const dist: Record<string, number> = {};
  for (const d of decisions) { const k = d.decision || d.code || "ERROR"; dist[k] = (dist[k] || 0) + 1; }
  const byModel: Record<string, number> = {};
  for (const d of decisions) if (d.model) byModel[d.model] = (byModel[d.model] || 0) + 1;
  const escalations = decisions.filter((d: any) => d.decision === "ESCALATE_TO_PROVIDER").length;
  return freeze({ ok: true, total: decisions.length, decisions: freeze(decisions),
    distribution: freeze(dist), byModel: freeze(byModel), escalations,
    note: "local-first, cheapest-sufficient routing; escalations are flagged (require authorization), not auto paid calls" });
}

const MODEL_ROUTER_CONTRACT = Object.freeze({
  id: "V319-ADDENDUM-MODEL-ROUTER",
  purpose: "§11.6 — cost-aware local-first model routing by MEASURED capability; the autonomy-mechanism gap the §4/§11 crosswalk found",
  reuses: Object.freeze(["ollama-provider local pool (qwen2.5-coder:3b/:7b, qwen2.5:0.5b)", "V318/V319b measured capability evidence"]),
  invariants: Object.freeze([
    "route to the CHEAPEST local model whose MEASURED capability covers the difficulty — never assume the largest is best",
    "capability profiles come from this repo's measured accept-rates (V318/V319b), NOT model marketing",
    "no local model covers ⇒ ESCALATE_TO_PROVIDER, a FLAGGED decision requiring authorization — NEVER an auto paid-API call (no spend)",
    "requireLocal=true forbids escalation (BLOCKED_LOCAL) — refuse rather than overclaim local capability",
    "PURE + deterministic; no network/clock/randomness; composes the existing provider pool (no new provider/engine)",
  ]),
});

module.exports = { DIFFICULTIES, LOCAL_POOL, selectModel, routeBatch, MODEL_ROUTER_CONTRACT };
export {};
