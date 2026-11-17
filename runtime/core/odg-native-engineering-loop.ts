#!/usr/bin/env node
"use strict";

/*
 * V250 §3 — NATIVE ENGINEERING LOOP (the decide→drive layer V249 found missing). PURE, deterministic. It does NOT build a
 * repair engine: odg-transform-catalog ALREADY does real deterministic native repair (runRepair ⇒ NATIVE_REPAIRED_GREEN,
 * structurally verified, no eval, no model). The gap V249 proved was that NO autonomous loop DROVE it. This is that loop:
 * OBSERVE → DIAGNOSE → DECIDE → SCOPE (write-set) → EXECUTE (the real transform) → TEST/VERIFY → IMPACT (before/after) →
 * propose ACCEPTANCE (never self-accept). It runs a BATCH, separates deterministic tasks (done NATIVELY, no provider, no
 * generative model) from novel/judgment tasks (DEFERRED to a provider mandate), and reuses delegate-isolation for scope.
 *
 * This is the FIRST real, measured dependency reduction: for the class of deterministic transforms the catalog supports,
 * the loop EXECUTES the repair itself — no Claude Code per task, no Ollama. Novel code generation + judgment still require
 * the bounded provider (a honest DEFER, not a fabricated native success). Builds NO 2nd orchestrator/engine, no 10th primitive.
 */

const T = require("./odg-transform-catalog.js");   // the REAL deterministic repair catalog (runRepair / runTransform)
const DI = require("./delegate-isolation.js");     // validateScope — canonical write-set check (reuse)

const DISPOSITION = Object.freeze(["NATIVE_REPAIRED", "ALREADY_CLEAN", "REFUSED_OUT_OF_SCOPE", "DEFERRED_TO_PROVIDER", "FAILED"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/*
 * driveTask(task, policy) -> one pass of the native loop over a single task.
 * task: { classId, filePath?, source? }. policy: { writeSet:[] }. A task whose classId is NOT a known deterministic
 * transform is DEFERRED (novel code / judgment ⇒ provider mandate). A filePath outside the write-set is REFUSED.
 */
function driveTask(task: any, policy: any): any {
  const t = isObj(task) ? task : {};
  const p = isObj(policy) ? policy : {};
  const classId = typeof t.classId === "string" ? t.classId : null;
  const known = arr(T.TRANSFORM_IDS).includes(classId);

  // DECIDE: deterministic vs novel. Novel ⇒ honest DEFER (never faked as native).
  if (!known) return Object.freeze({ id: t.id || classId, disposition: "DEFERRED_TO_PROVIDER", nativelyExecuted: false, reason: "no deterministic transform for '" + classId + "' ⇒ requires a provider code mandate (novel/judgment)", providerMandate: Object.freeze({ objective: "write a deterministic transform/fix for " + classId, scope: t.filePath || null }) });

  // SCOPE: enforce the write-set before any action (deny-by-default). filePath optional for in-memory source tasks.
  if (typeof t.filePath === "string") {
    const scope = DI.validateScope([{ rel: t.filePath }], arr(p.writeSet));
    if (scope.ok !== true) return Object.freeze({ id: t.id || classId, disposition: "REFUSED_OUT_OF_SCOPE", nativelyExecuted: false, reason: "filePath '" + t.filePath + "' not in the authorized write-set ⇒ DENY" });
  }

  // EXECUTE the REAL deterministic transform natively (no model, no provider). Seed-and-repair when no source supplied.
  let res: any;
  try { res = typeof t.source === "string" ? T.runTransform({ classId, source: t.source }) : T.runRepair(classId); }
  catch (e: any) { return Object.freeze({ id: t.id || classId, disposition: "FAILED", nativelyExecuted: false, reason: "transform threw: " + String(e && e.message || e) }); }

  // TEST/VERIFY + IMPACT, mapping the catalog's full OUTCOME enum precisely.
  const O = isObj(T.OUTCOME) ? T.OUTCOME : {};
  const before = res.before !== undefined ? res.before : res.faulty;
  const after = res.after;
  const changed = typeof before === "string" && typeof after === "string" && before !== after;
  // already compliant (NATIVE_GREEN) or precondition not applicable (NATIVE_REFUSED) ⇒ ALREADY_CLEAN (no false repair).
  if (res.outcome === O.GREEN || res.outcome === O.REFUSED || res.outcome === "NATIVE_GREEN" || res.outcome === "NATIVE_REFUSED")
    return Object.freeze({ id: t.id || classId, disposition: "ALREADY_CLEAN", nativelyExecuted: true, changed: false, reason: res.outcome === O.REFUSED || res.outcome === "NATIVE_REFUSED" ? "transform precondition not applicable / source already clean" : "source already compliant (NATIVE_GREEN)" });
  // the catalog itself escalating a case it cannot deterministically fix ⇒ honest DEFER to a provider mandate.
  if (res.outcome === O.ESCALATED || res.outcome === "ESCALATED_TO_PROVIDER")
    return Object.freeze({ id: t.id || classId, disposition: "DEFERRED_TO_PROVIDER", nativelyExecuted: false, reason: "catalog escalated '" + classId + "' ⇒ requires a provider mandate", providerMandate: Object.freeze({ objective: "deterministically repair " + classId, scope: t.filePath || null }) });
  const verified = res.verified === true || res.outcome === O.REPAIRED || res.outcome === "NATIVE_REPAIRED_GREEN";
  if (!verified) return Object.freeze({ id: t.id || classId, disposition: "FAILED", nativelyExecuted: true, changed, reason: "transform ran but verification failed ⇒ not a native success" });

  // propose ACCEPTANCE — the loop NEVER self-accepts; ODG/independent decides. accepted stays false here.
  return Object.freeze({ id: t.id || classId, disposition: "NATIVE_REPAIRED", nativelyExecuted: true, changed, verified: true,
    proposedAcceptance: true, accepted: false,
    evidence: Object.freeze({ classId, outcome: res.outcome, beforeLen: typeof before === "string" ? before.length : null, afterLen: typeof after === "string" ? after.length : null }),
    reason: "deterministic transform applied + structurally verified (native; no model, no provider) ⇒ PROPOSED for independent acceptance" });
}

/* run(tasks, policy) -> drive the whole batch; aggregate the honest dependency-reduction measure. */
function run(tasks: any, policy: any): any {
  const rows = arr(tasks).map((t) => driveTask(t, policy));
  const count = (d: string) => rows.filter((r) => r.disposition === d).length;
  const nativelyExecuted = rows.filter((r) => r.nativelyExecuted === true).length;
  const deferred = count("DEFERRED_TO_PROVIDER");
  const total = rows.length;
  return Object.freeze({
    total, rows: Object.freeze(rows),
    nativeRepaired: count("NATIVE_REPAIRED"), alreadyClean: count("ALREADY_CLEAN"),
    refusedOutOfScope: count("REFUSED_OUT_OF_SCOPE"), deferredToProvider: deferred, failed: count("FAILED"),
    nativelyExecuted,
    dependencyReduction: Object.freeze({
      tasksDoneNativelyNoProvider: nativelyExecuted, tasksDeferredToProvider: deferred,
      nativeShare: total > 0 ? Math.round((nativelyExecuted / total) * 1000) / 10 : 0,
      note: "REAL execution: the loop drove odg-transform-catalog to repair deterministic tasks NATIVELY (no Claude Code, no Ollama); only novel/judgment tasks are DEFERRED to a provider mandate (honest). The loop PROPOSES acceptance — it never self-accepts.",
    }),
  });
}

/* demonstrate() -> actually RUN the loop over the real deterministic transform classes + one out-of-scope + one novel task. */
function demonstrate(): any {
  const deterministic = arr(T.TRANSFORM_IDS).map((id: string) => ({ id: "det:" + id, classId: id })); // seed→repair each, natively
  const outOfScope = { id: "oos", classId: arr(T.TRANSFORM_IDS)[0], filePath: "etc/secret.ts", source: "x" };
  const novel = { id: "novel", classId: "add-a-brand-new-feature@1", filePath: "runtime/core/x.ts" };
  const result = run([...deterministic, outOfScope, novel], { writeSet: ["runtime/core/x.ts"] });
  return Object.freeze({ result,
    nativeExecutionProven: result.nativeRepaired >= 4 && result.nativelyExecuted >= 4,
    scopeEnforced: result.refusedOutOfScope === 1,
    honestDefer: result.deferredToProvider === 1 && result.rows.some((r: any) => r.id === "novel" && r.disposition === "DEFERRED_TO_PROVIDER") });
}

const NATIVE_ENGINEERING_LOOP_CONTRACT = Object.freeze({
  id: "V250-NATIVE-ENGINEERING-LOOP",
  purpose: "§3 — the decide→drive loop that REALLY executes deterministic repairs natively via odg-transform-catalog; the first measured provider-dependency reduction",
  dispositions: DISPOSITION,
  invariants: Object.freeze([
    "REUSES odg-transform-catalog (real deterministic repair) + delegate-isolation (write-set) — builds NO 2nd engine/orchestrator, no 10th primitive",
    "deterministic tasks are EXECUTED NATIVELY (no Claude Code, no Ollama); novel/judgment tasks are honestly DEFERRED to a provider mandate (never faked as native)",
    "deny-by-default: a filePath outside the write-set is REFUSED before any action; a transform that fails verification is FAILED (not a native success)",
    "the loop PROPOSES acceptance and NEVER self-accepts; ODG/independent decides — proposing ≠ accepting",
  ]),
});

module.exports = { driveTask, run, demonstrate, DISPOSITION, NATIVE_ENGINEERING_LOOP_CONTRACT };
export {};
