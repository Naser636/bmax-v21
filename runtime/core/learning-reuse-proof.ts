#!/usr/bin/env node
/**
 * learning-reuse-proof — a REPRODUCIBLE experiment that demonstrates the full learning lifecycle end to end and, most
 * importantly, distinguishes RECORDED from RETRIEVED from REUSED from EFFECTIVE (Mandate §2). It is built ENTIRELY from
 * existing mechanisms — NO new primitive, NO vector DB, NO separate service:
 *   - evidence-provenance.stampProvenance/verifyProvenance  (seal a learning + detect tamper)
 *   - excellence-gate.gateLearningReuse  (the REAL gated reuse decision: refuses unsealed/tampered/out-of-domain)
 *   - excellence-gate.decideWithLearning (proves the applied learning actually CHANGED a decision)
 *   - learning-chain.classifyLearningState (honest CAPTURED→PERSISTED→DISCOVERABLE→REUSED→EFFECTIVE grading — an
 *     EFFECTIVE claim without a measured, DIFFERING before/after is downgraded; no fabricated gain)
 *   - a file-backed store so persistence survives process termination (cross-process reproducibility).
 *
 * The task is a controlled, FAIR capability-resolution: both arms resolve the SAME objective; the ONLY difference is
 * whether the learning is present+reusable. Baseline (no learning) ⇒ MISS (resolution cost MISS_COST, must guess);
 * learned (sealed in-domain learning) ⇒ HIT (cost HIT_COST). Improvement = measured cost delta. This is a controlled
 * experiment over a synthetic resolution cost, NOT a field claim about real missions — stated honestly in the proof.
 */
"use strict";

const fs = require("fs");
const prov = require("./evidence-provenance.js");
const EG = require("./excellence-gate.js");
const CHAIN = require("./learning-chain.js");

const MODEL = "learning-reuse-proof/1";
const MISS_COST = 2;   // a miss must guess + retry
const HIT_COST = 1;    // a hit resolves directly

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function loadStore(storePath: string, sink: any): any { try { const s = JSON.parse(sink.readFileSync(storePath, "utf8")); return isObj(s) && Array.isArray(s.learnings) ? s : { version: 1, learnings: [] }; } catch { return { version: 1, learnings: [] }; } }
function saveStore(storePath: string, store: any, sink: any): void { sink.writeFileSync(storePath, JSON.stringify(store)); }

/** persistLearning(store, spec): seal provenance + append. spec = { id, goal, domain, capability, claims?, stale? }. */
function persistLearning(store: any, spec: any): any {
  const provenanceSealed = prov.stampProvenance({ id: spec.id, goal: spec.goal, practice: spec.capability }, {});
  store.learnings.push({ id: spec.id, goal: spec.goal, domain: spec.domain, capability: spec.capability, practice: spec.capability, claims: spec.claims || [], provenanceSealed, stale: spec.stale === true });
  return store;
}

/**
 * resolve(store, goal, domain, opts): resolve a capability via the REAL reuse gate. Returns
 * { hit, capability, cost, influenced, reason }. A learning is a candidate ONLY if it matches goal+domain and is not
 * marked stale (out-of-domain / stale ⇒ MISS); a candidate still must pass gateLearningReuse (unsealed/tampered ⇒ MISS).
 */
function resolve(store: any, goal: string, domain: string, opts: any = {}): any {
  const cand = (store.learnings || []).find((l: any) => l.goal === goal && l.domain === domain && l.stale !== true);
  if (!cand) {
    const staleExists = (store.learnings || []).some((l: any) => l.goal === goal && l.domain === domain && l.stale === true);
    return { hit: false, capability: null, cost: MISS_COST, influenced: false, reason: staleExists ? "only a STALE learning matches — not applied" : "no in-domain learning" };
  }
  const g = EG.gateLearningReuse({ learning: cand, registry: opts.registry || [], now: opts.now || "", reviewer: opts.reviewer });
  if (!g.applied) return { hit: false, capability: null, cost: MISS_COST, influenced: false, reason: `reuse gate refused: ${g.provOk ? ("excellence " + (g.reviewVerdict || "blocked")) : g.provReason}` };
  const d = EG.decideWithLearning([cand.capability, "guess"], g);   // proves the learning changed the decision
  return { hit: true, capability: g.appliedPractice, cost: HIT_COST, influenced: d.influencedByLearning === true, decided: d.chosen, reason: "applied" };
}

/**
 * runExperiment(opts): run the controlled A/B + all controls. opts = { storePath?, now?, registry?, reviewer?,
 * resume? }. With storePath it is file-backed (survives process termination). resume:true skips re-persisting (a fresh
 * process reading a store a prior run wrote). Returns { ok, proof } — verdict PROVEN only if every check holds.
 */
function runExperiment(opts: any = {}): any {
  const sink = opts.fs || fs;
  const now = typeof opts.now === "string" ? opts.now : "2026-10-29";
  const gopts = { now, registry: opts.registry || [], reviewer: opts.reviewer };
  const GOAL = "parse-csv", DOMAIN = "data", OTHER_GOAL = "charge-card", OTHER_DOMAIN = "billing";

  // (1) BASELINE / control — an EMPTY store (no learning) ⇒ MISS.
  const baseline = resolve({ version: 1, learnings: [] }, GOAL, DOMAIN, gopts);

  // (2)(3) observe + persist the learning (sealed provenance) into the durable store.
  let store = opts.storePath ? loadStore(opts.storePath, sink) : { version: 1, learnings: [] };
  const already = store.learnings.some((l: any) => l.id === "L-csv");
  if (!opts.resume && !already) persistLearning(store, { id: "L-csv", goal: GOAL, domain: DOMAIN, capability: "csv-parser", claims: [] });
  if (opts.storePath && !opts.resume) saveStore(opts.storePath, store, sink);

  // (4)(5) a later mission RETRIEVES + REUSES it ⇒ HIT, and the decision is INFLUENCED by the learning.
  const learned = resolve(store, GOAL, DOMAIN, gopts);

  // (7) OUT-OF-DOMAIN control: a different goal/domain ⇒ the learning is NOT applied (MISS).
  const outOfDomain = resolve(store, OTHER_GOAL, OTHER_DOMAIN, gopts);

  // (8a) STALE control: a learning explicitly marked stale ⇒ not applied.
  const s2 = { version: 1, learnings: store.learnings.slice() };
  persistLearning(s2, { id: "L-stale", goal: "legacy-goal", domain: DOMAIN, capability: "old-parser", claims: [], stale: true });
  const staleRes = resolve(s2, "legacy-goal", DOMAIN, gopts);
  // (8b) CONTRADICTORY/TAMPERED control: a sealed learning whose content was mutated after sealing ⇒ gate refuses.
  const tamperedStore = { version: 1, learnings: [] as any[] };
  persistLearning(tamperedStore, { id: "L-tamper", goal: "tampered-goal", domain: DOMAIN, capability: "x", claims: [] });
  // mutate a field INSIDE the sealed payload so its contentSha256 no longer matches ⇒ verifyProvenance fails ⇒ refused.
  tamperedStore.learnings[0].provenanceSealed.practice = "MUTATED-after-sealing";
  const tamperedRes = resolve(tamperedStore, "tampered-goal", DOMAIN, gopts);

  // (6) measured improvement (same task, fair baseline; the only difference is learning presence).
  const improvement = baseline.cost - learned.cost;

  // honest chain grading — EFFECTIVE only with a measured, DIFFERING before/after.
  const record = {
    id: "L-csv",
    captured: { description: `${GOAL} ⇒ csv-parser`, cause: "capability unknown in baseline (miss)" },
    persisted: opts.storePath ? { file: opts.storePath, id: "L-csv" } : { id: "L-csv (in-memory)" },
    discoverable: { index: "store.learnings", anchor: `goal=${GOAL},domain=${DOMAIN}` },
    reused: learned.hit && learned.influenced ? { count: 1, consumers: ["resolve@mission-2"] } : { count: 0 },
    effective: { baseline: { cost: baseline.cost }, after: { cost: learned.cost } },
  };
  const chainState = CHAIN.classifyLearningState(record);

  const checks = {
    baselineMiss: baseline.hit === false,
    learnedHit: learned.hit === true,
    reuseInfluencedDecision: learned.influenced === true,
    measuredImprovement: improvement > 0,
    outOfDomainNotApplied: outOfDomain.hit === false,
    staleNotApplied: staleRes.hit === false,
    tamperedRefused: tamperedRes.hit === false,
    chainEffective: chainState.complete === true,
  };
  const verdict = Object.values(checks).every(Boolean) ? "PROVEN" : "NOT_PROVEN";

  return {
    ok: true,
    proof: {
      model: MODEL, now, storePath: opts.storePath || null, resume: opts.resume === true,
      arms: { baseline, learned }, improvement,
      controls: { outOfDomain, stale: staleRes, tampered: tamperedRes },
      chainState: { state: chainState.state, complete: chainState.complete, reason: chainState.reason },
      checks, verdict,
      honest: improvement > 0
        ? "controlled A/B over a synthetic resolution cost — reuse DEMONSTRABLY lowered cost vs an equal baseline; NOT a field claim about real-mission speedups."
        : "no improvement measured in this run — reported as-is (no fabricated gain).",
    },
  };
}

export { MODEL, MISS_COST, HIT_COST, persistLearning, resolve, runExperiment };
module.exports = { MODEL, MISS_COST, HIT_COST, persistLearning, resolve, runExperiment };

if (require.main === module) {
  const storePath = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : undefined;
  const resume = process.argv.includes("--resume");
  const r = runExperiment({ storePath, resume });
  process.stdout.write(JSON.stringify(r.proof, null, 2) + "\n");
  process.exit(r.proof.verdict === "PROVEN" ? 0 : 1);
}
