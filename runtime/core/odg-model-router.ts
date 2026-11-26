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

// ---- V155 Step 5 — MEASURED selection over the capability registry (extends this canonical router; no second router).
// selectModel above routes by the static V318/V319b difficulty priors; selectMeasured routes a TASK CLASS by the registry
// built from REAL benchmark trials (odg-local-model-capability.buildCapabilityRegistry). Quality first (measured class pass
// rate), then latency under an optional budget; only QUALIFIED models can be primary; PROBATION models are fallback-only;
// DEMOTED / NOT_MEASURED / UNAVAILABLE models are never chosen. Pure + deterministic.

const MEASURED_DECISION = Object.freeze({ LOCAL: "LOCAL", NO_QUALIFIED_LOCAL_MODEL: "NO_QUALIFIED_LOCAL_MODEL", UNAVAILABLE: "UNAVAILABLE" });

/**
 * selectMeasured({ taskClass, registry, available?, latencyBudgetMs?, qualityTolerance? }) -> frozen decision
 * { decision, model, fallbackOrder, considered, overBudget, requiresAuthorization, rationale }.
 *   available: string[] of installed models from a live probe (null/undefined ⇒ trust registry.available; [] ⇒ daemon
 *   down ⇒ every model UNAVAILABLE). qualityTolerance (default 0): models within this of the best pass rate count as equal
 *   quality, so the faster one (within budget) wins the tie.
 */
function selectMeasured(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.taskClass)) return freeze({ ok: false, code: "BAD_TASK_CLASS", detail: "taskClass (string) required" });
  const models = isObj(i.registry) && Array.isArray(i.registry.models) ? i.registry.models : null;
  if (!models) return freeze({ ok: false, code: "NO_REGISTRY", detail: "a measured registry (buildCapabilityRegistry) is required — no measurement ⇒ no measured selection" });
  const avail = Array.isArray(i.available) ? new Set(i.available) : null;
  const budget = Number.isFinite(i.latencyBudgetMs) && i.latencyBudgetMs > 0 ? i.latencyBudgetMs : null;
  const tol = Number.isFinite(i.qualityTolerance) && i.qualityTolerance >= 0 ? i.qualityTolerance : 0;
  const considered = models.map((m: any) => {
    const pc = isObj(m.perClass) ? m.perClass[i.taskClass] : null;
    const passRate = pc && pc.passRate && typeof pc.passRate.value === "number" ? pc.passRate.value : null;
    const p50 = pc && pc.totalMs && typeof pc.totalMs.p50 === "number" ? pc.totalMs.p50 : null;
    let status = pc ? pc.status : "NOT_MEASURED";
    if (m.available === false || (avail && !avail.has(m.id))) status = "UNAVAILABLE";
    return freeze({ id: m.id, status, passRate, totalMsP50: p50, withinBudget: budget === null ? true : (p50 !== null && p50 <= budget) });
  });
  const rank = (a: any, b: any) => {
    const qa = a.passRate || 0; const qb = b.passRate || 0;
    if (Math.abs(qa - qb) > tol + 1e-9) return qb - qa;                      // quality first
    if (a.withinBudget !== b.withinBudget) return a.withinBudget ? -1 : 1;    // then within the latency budget
    return (a.totalMsP50 === null ? Infinity : a.totalMsP50) - (b.totalMsP50 === null ? Infinity : b.totalMsP50) || (a.id < b.id ? -1 : 1);
  };
  const qualified = considered.filter((c: any) => c.status === "QUALIFIED").sort(rank);
  const probation = considered.filter((c: any) => c.status === "PROBATION").sort(rank);
  if (considered.length && considered.every((c: any) => c.status === "UNAVAILABLE")) {
    return freeze({ ok: true, taskClass: i.taskClass, decision: MEASURED_DECISION.UNAVAILABLE, model: null, fallbackOrder: freeze([]), considered: freeze(considered), overBudget: false, requiresAuthorization: false,
      rationale: "no local model is available (model missing or Ollama down) — honest UNAVAILABLE, nothing fabricated" });
  }
  if (!qualified.length) {
    // NO fallbackOrder here: PROBATION models are listed for the authorizer's information only — nothing is runnable
    // without an explicit authorization (runWithFallback refuses this decision).
    return freeze({ ok: true, taskClass: i.taskClass, decision: MEASURED_DECISION.NO_QUALIFIED_LOCAL_MODEL, model: null, fallbackOrder: freeze([]), probationCandidates: freeze(probation.map((c: any) => c.id)), considered: freeze(considered), overBudget: false, requiresAuthorization: true,
      rationale: `no available local model is QUALIFIED for '${i.taskClass}' by measurement (pass rate ≥ registry minPassRate); escalation is a FLAGGED decision requiring authorization — never an automatic paid-API call` });
  }
  const chosen = qualified[0];
  const fallbackOrder = [...qualified.slice(1), ...probation].map((c: any) => c.id);
  return freeze({ ok: true, taskClass: i.taskClass, decision: MEASURED_DECISION.LOCAL, model: chosen.id, passRate: chosen.passRate, totalMsP50: chosen.totalMsP50,
    fallbackOrder: freeze(fallbackOrder), considered: freeze(considered), overBudget: !chosen.withinBudget, requiresAuthorization: false,
    rationale: `highest MEASURED pass rate for '${i.taskClass}' (${chosen.passRate})${tol ? ` within tolerance ${tol}` : ""}, then latency${budget !== null ? ` under a ${budget}ms budget` : ""}; fallback = remaining QUALIFIED then PROBATION models` + (!chosen.withinBudget ? " — NOTE: the best-quality model is OVER the latency budget (quality was not traded away silently)" : "") });
}

/**
 * runWithFallback(decision, invoke, opts?) -> Promise<{ outcome, model, attempts }>. Tries decision.model then
 * decision.fallbackOrder — ONLY for decision===LOCAL without requiresAuthorization (else REFUSED). invoke(model) -> { ok, unavailable?, timedOut?, reason? }. ONLY an unavailable model (missing /
 * daemon down) or a timeout moves to the next model; a model that answered but FAILED is reported as FAILED (a quality
 * failure is never masked by silently retrying elsewhere). Exhausted ⇒ outcome UNAVAILABLE (honest).
 */
async function runWithFallback(decision: any, invoke: any, opts: any = {}): Promise<any> {
  const d = isObj(decision) ? decision : {};
  // only a measured LOCAL decision that needs no authorization is runnable — NO_QUALIFIED_LOCAL_MODEL / UNAVAILABLE /
  // anything flagged requiresAuthorization is REFUSED (a PROBATION model never runs by fallback without authorization).
  if (d.decision !== MEASURED_DECISION.LOCAL || d.requiresAuthorization === true) return freeze({ outcome: "REFUSED", model: null, attempts: freeze([]), reason: `decision '${String(d.decision)}'${d.requiresAuthorization === true ? " requires authorization" : " is not a runnable LOCAL decision"} — nothing executed` });
  const order = [d.model, ...(Array.isArray(d.fallbackOrder) ? d.fallbackOrder : [])].filter(isStr);
  const maxAttempts = Number.isInteger(opts.maxAttempts) && opts.maxAttempts > 0 ? opts.maxAttempts : order.length;
  const attempts: any[] = [];
  if (typeof invoke !== "function") return freeze({ outcome: "ERROR", model: null, attempts: freeze(attempts), reason: "invoke (function) required" });
  for (const m of order.slice(0, maxAttempts)) {
    // a THROW is a caller/integration bug, not transport unavailability: stop with ERROR (unavailability must be
    // reported in the return value, e.g. generateMeasured's { unavailable:true }).
    let r: any; try { r = await invoke(m); } catch (e: any) { attempts.push(freeze({ model: m, ok: false, unavailable: false, timedOut: false, reason: "invoke threw: " + String((e && e.message) || e).slice(0, 200) })); return freeze({ outcome: "ERROR", model: m, attempts: freeze(attempts), reason: "invoke threw (caller bug, not unavailability)" }); }
    const rec = freeze({ model: m, ok: !!(r && r.ok), unavailable: !!(r && r.unavailable), timedOut: !!(r && r.timedOut), reason: r && r.reason ? String(r.reason).slice(0, 200) : null });
    attempts.push(rec);
    if (rec.ok) return freeze({ outcome: "OK", model: m, attempts: freeze(attempts), result: r });
    if (!rec.unavailable && !rec.timedOut) return freeze({ outcome: "FAILED", model: m, attempts: freeze(attempts), reason: rec.reason });
  }
  return freeze({ outcome: "UNAVAILABLE", model: null, attempts: freeze(attempts), reason: order.length ? "every model in the fallback order was unavailable or timed out" : "no model to try" });
}

// ---- V17.8 P5 — TEST-GATED CHEAP-FIRST CASCADE (extends this canonical router; no second router).
// cascadeOrder: the measured registry's models for a task class, cheapest first (registry cost: parameterCount, else
// sizeBytes; unknown cost ⇒ last), EXCLUDING every DEMOTED / NOT_MEASURED / UNAVAILABLE model (as selectMeasured).
// runTestGatedCascade: generate with each model in that order and STOP at the first result whose sandbox tests PASS;
// escalate ONLY when the tests fail (a test FAIL is the escalation signal, never a silent retry of the same model);
// unavailable / timed-out models are skipped (recorded). The test gate is injected (the caller's sandbox), never self-graded.
const CASCADE_RULE = "CASCADE-1: cheap-first over the measured registry (DEMOTED / NOT_MEASURED / UNAVAILABLE excluded); a model's output is accepted only when the injected sandbox test gate PASSES; a test FAIL escalates to the next (more expensive) model; exhausted ⇒ ALL_FAILED (honest)";
function costOf(m: any): number { return Number.isFinite(m && m.parameterCount) ? m.parameterCount : Number.isFinite(m && m.sizeBytes) ? m.sizeBytes : Infinity; }
function cascadeOrder(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.taskClass)) return freeze({ ok: false, code: "BAD_TASK_CLASS" });
  const models = isObj(i.registry) && Array.isArray(i.registry.models) ? i.registry.models : null;
  if (!models) return freeze({ ok: false, code: "NO_REGISTRY", detail: "a measured registry is required — no measurement ⇒ no cascade" });
  const avail = Array.isArray(i.available) ? new Set(i.available) : null;
  const rows = models.map((m: any) => {
    const pc = isObj(m.perClass) ? m.perClass[i.taskClass] : null;
    let status = pc ? pc.status : "NOT_MEASURED";
    if (m.available === false || (avail && !avail.has(m.id))) status = "UNAVAILABLE";
    return { id: m.id, status, cost: costOf(m) };
  });
  const order = rows.filter((r: any) => r.status === "QUALIFIED" || r.status === "PROBATION").sort((a: any, b: any) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
  return freeze({ ok: true, rule: CASCADE_RULE, taskClass: i.taskClass, order: freeze(order.map((r: any) => r.id)), excluded: freeze(rows.filter((r: any) => !order.includes(r)).map((r: any) => ({ id: r.id, status: r.status }))) });
}
async function runTestGatedCascade(order: any, generate: any, testGate: any): Promise<any> {
  const ids = Array.isArray(order) ? order.filter(isStr) : [];
  if (typeof generate !== "function" || typeof testGate !== "function") return freeze({ outcome: "ERROR", model: null, attempts: freeze([]), reason: "generate and testGate (functions) required" });
  const attempts: any[] = [];
  for (const m of ids) {
    let g: any; try { g = await generate(m); } catch (e: any) { attempts.push(freeze({ model: m, generated: false, reason: "generate threw: " + String((e && e.message) || e).slice(0, 200) })); return freeze({ outcome: "ERROR", model: m, attempts: freeze(attempts), rule: CASCADE_RULE }); }
    if (!g || g.ok !== true) { attempts.push(freeze({ model: m, generated: false, unavailable: !!(g && (g.unavailable || g.timedOut)), reason: g && g.reason ? String(g.reason).slice(0, 200) : "no output" })); continue; }
    let t: any; try { t = await testGate(g, m); } catch (e: any) { t = { pass: false, reason: "test gate threw: " + String((e && e.message) || e).slice(0, 200) }; }
    const pass = !!(t && t.pass === true);
    attempts.push(freeze({ model: m, generated: true, testsPass: pass, reason: t && t.reason ? String(t.reason).slice(0, 200) : null }));
    if (pass) return freeze({ outcome: "PASS", model: m, escalations: attempts.filter((a: any) => a.generated && a.testsPass === false).length, attempts: freeze(attempts), result: g, rule: CASCADE_RULE });
  }
  return freeze({ outcome: "ALL_FAILED", model: null, escalations: attempts.filter((a: any) => a.generated && a.testsPass === false).length, attempts: freeze(attempts), rule: CASCADE_RULE });
}

module.exports = { DIFFICULTIES, LOCAL_POOL, selectModel, routeBatch, MODEL_ROUTER_CONTRACT, MEASURED_DECISION, selectMeasured, runWithFallback, CASCADE_RULE, cascadeOrder, runTestGatedCascade };
export {};
