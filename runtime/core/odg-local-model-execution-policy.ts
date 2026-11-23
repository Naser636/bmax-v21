#!/usr/bin/env node
"use strict";
/*
 * V327 §3 — LOCAL-MODEL EXECUTION POLICY. PURE, deterministic, fail-closed. Turns the MEASURED §3 findings into an
 * operational resource-adaptation policy: given a mission-type's REAL calibrated-P verdict, choose {model, maxRepair}
 * proportionate to the measured need — so cheap-reliable types stay cheap and hard types get more resource, without
 * wasting compute or over-claiming. It AUTHORIZES NOTHING and promises no fix (the measured data shows some tasks —
 * e.g. cycle-detecting topological sort — are unsolved by BOTH a bigger model AND more repair; those are flagged ESCALATE).
 *
 * The thresholds ENCODE the measured evidence (docs/odg/autonomy/ODG_LOCAL_MODEL_{MODEL_CHOICE,REPAIR_DEPTH}_2026-11-20.json):
 *   - borderline failures were fixed by MODEL SIZE (3b->7b);
 *   - medium-hard failures (infix/lru) were fixed by REPAIR DEPTH (maxRepair 1->3, independent-test-guided);
 *   - the hardest (topo) was fixed by NEITHER -> ESCALATE to the frontier provider / decomposition.
 * It composes odg-calibrated-psuccess (no re-implementation); it chooses resources, it does not execute.
 */

const CP = require("./odg-calibrated-psuccess.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const MODEL = Object.freeze({ SMALL: "qwen2.5-coder:3b", LARGE: "qwen2.5-coder:7b" });
// Measured calibrated-P bands → resource policy (see dossiers). HIGH: reliable, cheap suffices. MEDIUM: repair depth
// helps. LOW: throw the large model + repair depth, and FLAG escalate (some low-P types are unsolved by local compute).
const HIGH = 0.7;   // ≥ HIGH ⇒ cheap/fast is measured-sufficient
const LOW = 0.3;    // < LOW  ⇒ local compute is measured-unreliable ⇒ escalate-flagged

/**
 * chooseExecutionPolicy(missionType, history, opts?) -> { model, maxRepair, escalateIfStillFails, tier, quality,
 * pForPlanner, reason }. Thin/biased/unknown history ⇒ a cheap PROBE policy (gather data; never over-commit resource on
 * no evidence). Deterministic; AUTHORIZES NOTHING.
 */
function chooseExecutionPolicy(missionType: any, history: any, opts: any = {}): any {
  // V15.9: the OPTIONAL measured inputs are stripped before the calibrated-P derivation (it never sees them), and when
  // none is supplied the call below is EXACTLY the pre-V15.9 call (same opts object) ⇒ byte-identical output.
  // V16.4: OPTIONAL opts.strategyMode = { mission, ctx } attaches the strategy-mode selection (NATIVE/HYBRID/PROVIDER/
  // DECISION_REQUIRED). It is stripped first, so absent ⇒ the exact pre-V16.4 path (same opts object) ⇒ byte-identical.
  const o0 = isObj(opts) ? opts : {};
  const wantsStrategy = Object.prototype.hasOwnProperty.call(o0, STRATEGY_OPT_KEY);
  const o = wantsStrategy ? omitKey(o0, STRATEGY_OPT_KEY) : o0;
  const wantsMeasured = MEASURED_OPT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(o, k));
  const base = calibratedPolicy(missionType, history, wantsMeasured ? stripMeasuredOpts(o) : o);
  const out = wantsMeasured ? applyMeasured(base, o) : base;
  if (!wantsStrategy) return out;
  const sm = isObj(o0[STRATEGY_OPT_KEY]) ? o0[STRATEGY_OPT_KEY] : {};
  const SEL = require("./odg-strategy-mode-selector.js"); // lazy: the selector composes this module (no load-time cycle)
  return freeze({ ...out, strategyMode: SEL.selectStrategyMode(sm.mission, isObj(sm.ctx) ? sm.ctx : {}) });
}

const STRATEGY_OPT_KEY = "strategyMode";
function omitKey(o: any, k: string): any { const r: any = {}; for (const x of Object.keys(o)) if (x !== k) r[x] = o[x]; return r; }

function calibratedPolicy(missionType: any, history: any, opts: any): any {
  const d = CP.derivePsuccess(missionType, Array.isArray(history) ? history : [], opts);
  const p = d.pForPlanner;
  let model: string = MODEL.SMALL, maxRepair = 1, tier = "PROBE", escalate = false, why: string;

  if (d.quality !== "CALIBRATED") {
    // No calibrated evidence ⇒ cheap probe (3b, 1 repair) to GATHER data — never spend the large model on a hunch.
    model = MODEL.SMALL; maxRepair = 1; tier = "PROBE";
    why = `no CALIBRATED evidence (${d.quality}) ⇒ cheap probe (3b, maxRepair 1) to gather outcomes; escalate resource only on measured need`;
  } else if (p >= HIGH) {
    model = MODEL.SMALL; maxRepair = 1; tier = "NATIVE_CHEAP";
    why = `calibrated P=${p} ≥ ${HIGH} ⇒ reliable ⇒ cheap/fast is measured-sufficient (3b, maxRepair 1)`;
  } else if (p >= LOW) {
    model = MODEL.SMALL; maxRepair = 3; tier = "NATIVE_REPAIR";
    why = `calibrated P=${p} in [${LOW},${HIGH}) ⇒ medium-hard ⇒ apply measured lever REPAIR DEPTH (3b, maxRepair 3)`;
  } else {
    model = MODEL.LARGE; maxRepair = 3; tier = "NATIVE_MAX_THEN_ESCALATE"; escalate = true;
    why = `calibrated P=${p} < ${LOW} ⇒ measured-unreliable ⇒ max local resource (7b, maxRepair 3) AND flag ESCALATE to provider/decomposition if still failing (some low-P types are unsolved by local compute)`;
  }
  return freeze({
    model, maxRepair, escalateIfStillFails: escalate, tier,
    quality: d.quality, pForPlanner: p, observations: d.observations,
    authorizes: false,
    reason: why,
  });
}

// ---- V15.9 §6 — MEASURED REGISTRY OVERLAY (makes the V155 measured capability registry ACTUALLY USED). ---------------
// The calibrated policy above stays the base. An OPTIONAL measured input — opts.taskClass + opts.measured (an envelope
// from loadMeasuredRegistry over the committed V155 evidence, built by odg-local-model-capability.buildCapabilityRegistry)
// + opts.now (ms, for freshness) — may only make the policy SAFER, never cheaper:
//   (a) RAISE the model to the measured-best QUALIFIED model for the class when it is STRICTLY larger (registry
//       parameterCount) than the calibrated choice — never a smaller/weaker model;
//   (b) set escalateIfStillFails=true when the class is NO_QUALIFIED_LOCAL_MODEL or the final model is DEMOTED for it;
//   (c) record provenance (class, qualified model, pass rate, n, taskset version, evidence sha/time) under `measured`.
// maxRepair / tier / quality / pForPlanner are NEVER changed. Selection REUSES odg-model-router.selectMeasured (no second
// router). Absent/malformed/expired/unknown ⇒ the calibrated decision unchanged + measured.status NOT_MEASURED + reason.

const CAP = require("./odg-local-model-capability.js");
const ROUTER = require("./odg-model-router.js");

const MEASURED_OPT_KEYS = Object.freeze(["taskClass", "measured", "now", "measuredMaxAgeMs"]);
const MEASURED_MAX_AGE_MS = 30 * 24 * 3600 * 1000; // a measurement older than 30 days is EXPIRED ⇒ not used
const FUTURE_SKEW_MS = 24 * 3600 * 1000;           // a generatedAt more than 1 day in the future is malformed
const DEFAULT_EVIDENCE = "docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json";

function stripMeasuredOpts(o: any): any { const r: any = {}; for (const k of Object.keys(o)) if (!MEASURED_OPT_KEYS.includes(k)) r[k] = o[k]; return r; }
function isNum(x: any): boolean { return typeof x === "number" && Number.isFinite(x); }

/** registryProblem(reg) -> null if the registry has the canonical V155 shape, else a reason string (fail-closed). */
function registryProblem(reg: any): string | null {
  if (!isObj(reg)) return "registry missing or not an object";
  if (reg.schema !== CAP.REGISTRY_SCHEMA) return `registry schema '${String(reg.schema)}' ≠ ${CAP.REGISTRY_SCHEMA}`;
  if (!Array.isArray(reg.classes) || !reg.classes.every((c: any) => typeof c === "string")) return "registry.classes malformed";
  if (!Array.isArray(reg.models) || reg.models.length === 0) return "registry.models missing/empty";
  for (const m of reg.models) {
    if (!isObj(m) || typeof m.id !== "string" || !isObj(m.perClass)) return "registry model entry malformed";
    for (const v of Object.values(m.perClass)) {
      const pc: any = v;
      if (!isObj(pc) || typeof pc.status !== "string" || !isObj(pc.passRate)) return `registry perClass malformed for ${m.id}`;
      const pr = pc.passRate.value;
      if (pr !== null && !(isNum(pr) && pr >= 0 && pr <= 1)) return `registry passRate out of range for ${m.id}`;
    }
  }
  return null;
}

function notMeasured(base: any, taskClass: any, reason: string, extra: any = {}): any {
  return freeze({ ...base, measured: freeze({ status: "NOT_MEASURED", taskClass: typeof taskClass === "string" ? taskClass : null, applied: false, ...extra, reason }) });
}

function applyMeasured(base: any, o: any): any {
  const tc = o.taskClass;
  if (typeof tc !== "string" || !tc) return notMeasured(base, null, "no taskClass supplied ⇒ measured registry not consulted (calibrated policy unchanged)");
  const env = o.measured;
  if (!isObj(env)) return notMeasured(base, tc, "no measured registry supplied ⇒ calibrated policy unchanged");
  if (env.ok === false) return notMeasured(base, tc, `measured registry unavailable: ${String(env.reason || "unreadable")}`);
  const prob = registryProblem(env.registry);
  if (prob) return notMeasured(base, tc, `measured registry malformed (${prob}) ⇒ fail-closed, calibrated policy unchanged`);
  const gen = typeof env.generatedAt === "string" ? Date.parse(env.generatedAt) : NaN;
  if (!isNum(gen)) return notMeasured(base, tc, "measured registry has no valid generatedAt ⇒ freshness unverifiable ⇒ fail-closed");
  if (!isNum(o.now)) return notMeasured(base, tc, "no opts.now supplied ⇒ freshness unverifiable ⇒ fail-closed");
  const maxAge = isNum(o.measuredMaxAgeMs) && o.measuredMaxAgeMs > 0 ? o.measuredMaxAgeMs : MEASURED_MAX_AGE_MS;
  if (gen > o.now + FUTURE_SKEW_MS) return notMeasured(base, tc, `measured generatedAt ${env.generatedAt} is in the future ⇒ malformed ⇒ fail-closed`);
  if (o.now - gen > maxAge) return notMeasured(base, tc, `measured registry EXPIRED (generatedAt ${env.generatedAt}, older than ${Math.round(maxAge / 86400000)}d) ⇒ calibrated policy unchanged`, { expired: true });
  const reg = env.registry;
  if (!reg.classes.includes(tc)) return notMeasured(base, tc, `taskClass '${tc}' is not a measured class (${reg.classes.join("|")}) ⇒ calibrated policy unchanged`);

  const sel = ROUTER.selectMeasured({ taskClass: tc, registry: reg });
  if (!sel || sel.ok !== true) return notMeasured(base, tc, `measured selection refused (${sel && sel.code}) ⇒ calibrated policy unchanged`);
  if (sel.decision === ROUTER.MEASURED_DECISION.UNAVAILABLE) return notMeasured(base, tc, "registry reports every model UNAVAILABLE for this class ⇒ calibrated policy unchanged");

  const entry = (id: any) => reg.models.find((m: any) => m.id === id) || null;
  const pc = (id: any) => { const e = entry(id); return e && isObj(e.perClass) && isObj(e.perClass[tc]) ? e.perClass[tc] : null; };
  // Sizes come from the evidence file; a hand-edited size must not be able to "raise" to a smaller model (#912 LOW). A raise
  // is accepted only when BOTH models' registry sizes agree (±10 %) with this reference table of the installed models
  // (Ollama /api/show parameter sizes, V155 evidence); an unknown model ⇒ size unknown ⇒ kept (fail-closed).
  const REFERENCE_PARAMS: Record<string, number> = { "qwen2.5:0.5b": 494e6, "qwen2.5-coder:3b": 3.1e9, "qwen2.5-coder:7b": 7.6e9 };
  const size = (id: any) => {
    const e = entry(id); const ref = REFERENCE_PARAMS[String(id)];
    if (!(e && isNum(e.parameterCount) && e.parameterCount > 0) || !isNum(ref)) return null;
    return Math.abs(e.parameterCount - ref) <= 0.1 * ref ? e.parameterCount : null;
  };
  let model = base.model, raised = false, raiseNote = "";
  if (sel.decision === ROUTER.MEASURED_DECISION.LOCAL && sel.model !== base.model) {
    const sq = size(sel.model), sb = size(base.model);
    if (sq !== null && sb !== null && sq > sb) { model = sel.model; raised = true; raiseNote = `raised ${base.model} → ${sel.model} (measured-best QUALIFIED for '${tc}', larger)`; }
    else if (sq !== null && sb !== null) raiseNote = `measured-best ${sel.model} is not larger than the calibrated ${base.model} ⇒ kept (never downgrade)`;
    else raiseNote = `model size unknown in registry (${sel.model}/${base.model}) ⇒ cannot prove a raise ⇒ kept (fail-closed)`;
  }
  const finalStatus = pc(model) ? pc(model).status : "NOT_MEASURED";
  const noQualified = sel.decision === ROUTER.MEASURED_DECISION.NO_QUALIFIED_LOCAL_MODEL;
  const escalateSet = !base.escalateIfStillFails && (noQualified || finalStatus === CAP.CLASS_STATUS.DEMOTED);
  const qpc = sel.decision === ROUTER.MEASURED_DECISION.LOCAL ? pc(sel.model) : null;
  const passRate = qpc && isNum(qpc.passRate.value) ? qpc.passRate.value : null;
  const n = qpc && isNum(qpc.passRate.n) && qpc.passRate.n > 0 ? qpc.passRate.n : null;
  const why = [raiseNote, noQualified ? `class '${tc}' has NO QUALIFIED local model by measurement ⇒ escalateIfStillFails=true` : "", !noQualified && finalStatus === CAP.CLASS_STATUS.DEMOTED ? `final model ${model} is DEMOTED for '${tc}' ⇒ escalateIfStillFails=true` : ""].filter(Boolean).join("; ") || `measured-best for '${tc}' agrees with the calibrated choice (${base.model}) ⇒ no change`;
  const measured = freeze({
    status: "CONSULTED", applied: raised || escalateSet, taskClass: tc, decision: sel.decision,
    qualifiedModel: sel.decision === ROUTER.MEASURED_DECISION.LOCAL ? sel.model : null, passRate, n,
    finalModelClassStatus: finalStatus, baseModel: base.model, raised, escalateSet,
    taskSetVersion: typeof env.taskSetVersion === "string" ? env.taskSetVersion : null,
    generatedAt: env.generatedAt, evidenceHead: typeof env.head === "string" ? env.head : null,
    source: typeof env.source === "string" ? env.source : null, sha256: typeof env.sha256 === "string" ? env.sha256 : null,
    reason: why,
  });
  return freeze({ ...base, model, escalateIfStillFails: base.escalateIfStillFails || escalateSet,
    reason: measured.applied ? `${base.reason} | MEASURED: ${why}` : base.reason, measured });
}

/**
 * loadMeasuredRegistry(evidencePath?, opts?) -> frozen envelope { ok:true, registry, generatedAt, taskSetVersion, head,
 * source, sha256 } or { ok:false, status:"NOT_MEASURED", reason }. Reads the COMMITTED V155 evidence (the output of the
 * canonical odg-local-model-capability.buildCapabilityRegistry) — it never re-measures. Fail-closed on any read/parse/
 * shape error. opts: { root? (repo root), readFile? (injected for tests) }.
 */
function loadMeasuredRegistry(evidencePath?: any, opts: any = {}): any {
  const path = require("path"); const fs = require("fs"); const crypto = require("crypto");
  const root = isObj(opts) && typeof opts.root === "string" ? opts.root : path.join(__dirname, "..", "..");
  const rel = typeof evidencePath === "string" && evidencePath ? evidencePath : DEFAULT_EVIDENCE;
  const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
  const fail = (reason: string) => freeze({ ok: false, status: "NOT_MEASURED", source: rel, reason });
  let raw: any;
  try { raw = isObj(opts) && typeof opts.readFile === "function" ? opts.readFile(abs) : fs.readFileSync(abs, "utf8"); } catch (e: any) { return fail("evidence unreadable: " + String((e && e.message) || e).slice(0, 160)); }
  if (typeof raw !== "string") return fail("evidence read returned non-text");
  let j: any; try { j = JSON.parse(raw); } catch (e: any) { return fail("evidence is not valid JSON"); }
  if (!isObj(j) || j.schema !== "V155_OLLAMA_CAPABILITY_REGISTRY_EVIDENCE") return fail("evidence schema ≠ V155_OLLAMA_CAPABILITY_REGISTRY_EVIDENCE");
  const prob = registryProblem(j.registry);
  if (prob) return fail("evidence registry malformed: " + prob);
  if (typeof j.generatedAt !== "string" || !isNum(Date.parse(j.generatedAt))) return fail("evidence generatedAt missing/invalid");
  return freeze({ ok: true, registry: j.registry, generatedAt: j.generatedAt,
    taskSetVersion: isObj(j.taskSet) && typeof j.taskSet.version === "string" ? j.taskSet.version : null,
    head: typeof j.head === "string" ? j.head : null, source: rel,
    sha256: crypto.createHash("sha256").update(raw).digest("hex") });
}

const EXECUTION_POLICY_CONTRACT = Object.freeze({
  id: "V327-LOCAL-MODEL-EXECUTION-POLICY",
  purpose: "§3 — operationalize the MEASURED model-size/repair-depth findings into a calibrated resource-adaptation policy ({model, maxRepair}) proportionate to real need; cheap-reliable stays cheap, hard gets more resource, hardest is escalate-flagged",
  reuses: Object.freeze(["odg-calibrated-psuccess.derivePsuccess (CALIBRATED verdict — not reimplemented)", "odg-model-router.selectMeasured + odg-local-model-capability registry (V155 measured overlay — no second router)", "ENCODES docs/odg/autonomy/ODG_LOCAL_MODEL_{MODEL_CHOICE,REPAIR_DEPTH}_2026-11-20.json measured evidence"]),
  invariants: Object.freeze([
    "no CALIBRATED evidence ⇒ cheap PROBE (3b, maxRepair 1) to gather data — never spend the large model on a hunch",
    "resource escalates ONLY with calibrated evidence of lower success (P<HIGH ⇒ repair depth; P<LOW ⇒ large model + repair + ESCALATE flag)",
    "promises NO fix: a low-P type is flagged escalate (measured: topo unsolved by bigger model AND more repair) — honesty over optimism",
    "chooses resources only; AUTHORIZES NOTHING and executes nothing; composes calibrated-P, builds no estimator",
    "PURE/deterministic/frozen; fail-closed",
    "V15.9 MEASURED OVERLAY is monotone-safe: it may only RAISE the model (strictly larger by registry parameterCount), set escalateIfStillFails on NO_QUALIFIED/DEMOTED, and record provenance — never a smaller model, never fewer repairs",
    "absent measured inputs ⇒ byte-identical calibrated output; unreadable/malformed/expired/unknown-class ⇒ unchanged decision + measured.status NOT_MEASURED (a missing measurement is never a number)",
  ]),
});

module.exports = { chooseExecutionPolicy, MODEL, EXECUTION_POLICY_CONTRACT, loadMeasuredRegistry, MEASURED_MAX_AGE_MS, MEASURED_OPT_KEYS, DEFAULT_EVIDENCE, STRATEGY_OPT_KEY };
export {};
