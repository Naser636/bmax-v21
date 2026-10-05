#!/usr/bin/env node

/*
 * Self-Diagnostic — the MISSING FRONT of the autonomous engineering cycle.
 *
 * Every downstream stage already exists and is tested: root-cause-engine.ts, build-recovery-engine.js,
 * snapshot-engine.ts, state-transition.js (C03 invariants), mechanical-acceptance.js, checkpoint-
 * engine.js, local-autonomy.js, the fallback/persistent-autonomy controllers. What did NOT exist is the
 * seam that turns a CHECKPOINT + CONTRACT + INVARIANTS + EVIDENCE/TRACES into a first-class INCIDENT by
 * comparing EXPECTED vs OBSERVED and locating the FIRST DIVERGENCE — the ability to discover problems
 * that were NOT listed beforehand. This module is that seam and nothing more.
 *
 * It is a READ-ONLY OBSERVER: it reads existing generated artifacts, computes divergences, raises
 * incidents, attaches candidate causes + the smallest discriminating check for each, and persists the
 * incident ledger through the EXISTING autonomy-store. It grants NO authority, changes NO governed
 * state, weakens NO gate. Routing an incident to repair is delegation to the mechanisms above.
 *
 * Deterministic: canonicalization + a content hash give a stable incident id (same inputs ⇒ same id ⇒
 * reproducible). Wall-clock is injectable (opts.now) so tests are fully deterministic.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const stateTransition = require("./state-transition");
const store = require("./autonomy-store");

const GENERATED_DIR = "runtime/generated";
const INCIDENTS_FILE = "self-diagnostic-incidents"; // autonomy-store key (it appends .json), under its DIR
const REPORT_FILE = path.join(GENERATED_DIR, "self-diagnostic-report.json");
const DEFAULT_MAX_ATTEMPTS = 3; // loop protection: freeze an oscillating/repeated incident

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function fileEvidenceOk(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

// Stable, order-independent hash — reuses the state-transition canonicalizer so the same logical
// divergence set always yields the same incident id (reproduction / de-duplication).
function stableId(obj) {
  const canon = stateTransition.canonicalize(obj);
  return "INC-" + crypto.createHash("sha256").update(JSON.stringify(canon)).digest("hex").slice(0, 16);
}

/*
 * EXPECTED — derived from the loaded mission plan/contract (the same artifact the live pipeline
 * produces). No new vocabulary: objectives, required proofs (verify), declared evidence, authorized
 * paths (permissions), and whether the mission is engineering (write-capable).
 */
function buildExpected(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  const objectives = Array.isArray(p.objectives) ? p.objectives.map((o) => o.id).filter(Boolean) : [];
  const requiredProofs = Array.isArray(p.verify)
    ? p.verify.filter((v) => v && v.required !== false && typeof v.evidence === "string").map((v) => v.evidence)
    : [];
  const declaredEvidence = Array.isArray(p.evidence) ? p.evidence.filter((e) => typeof e === "string") : [];
  const authorizedPaths = Array.isArray(p.authorizedPaths)
    ? p.authorizedPaths
    : Array.isArray(p.authorized_paths)
    ? p.authorized_paths
    : [];
  return {
    mission: p.mission || null,
    objectives,
    objectiveOrder: objectives.slice(),
    requiredProofs,
    declaredEvidence,
    authorizedPaths,
    engineering: p.requiresEngineering === true || authorizedPaths.length > 0,
  };
}

/*
 * OBSERVED — read from the generated artifacts the live pipeline leaves behind. Pure reads.
 */
function observe(generatedDir, opts = {}) {
  const dir = generatedDir || GENERATED_DIR;
  const exec = readJsonSafe(path.join(dir, "patch-execution.json"));
  const executed = exec && Array.isArray(exec.executed) ? exec.executed : [];
  const probe = typeof opts.runProbe === "function" ? opts.runProbe : null;
  // RC-4: the INDEPENDENT validation verdict (validation-engine writes mission-report.json). Read-only
  // and injectable (opts.verdict) so detection consumes SUCCESS/BLOCKED. Absent => null (nothing to
  // contradict); self-diagnostic never writes this file and never weakens validation's gate.
  const verdict = opts.verdict !== undefined ? opts.verdict : readJsonSafe(path.join(dir, "mission-report.json"));
  return {
    executed,
    executedOrder: executed.map((e) => e.objectiveId || e.action).filter(Boolean),
    runProbe: probe, // optional injected probe runner (reuse capability-probes) for proof verification
    verdict, // RC-4: validation verdict (mission-report.json) or null
    generatedDir: dir,
  };
}

/*
 * DIVERGENCE DETECTION — compare EXPECTED vs OBSERVED across the catalogue the mission requires. Each
 * divergence names the FIRST point the two paths differ, carries the evidence that proves it, and a
 * severity. Unknown problems are found here precisely because detection is driven by the declared
 * contract/invariants, not a pre-listed set of bugs.
 */
function detectDivergences(expected, observed, opts = {}) {
  const div = [];
  const add = (category, firstDifferenceAt, exp, obs, evidence, severity) =>
    div.push({ category, firstDifferenceAt, expected: exp, observed: obs, evidence_refs: evidence || [], severity: severity || "ERROR" });

  const execById = new Map(observed.executed.map((e) => [e.objectiveId || e.action, e]));

  // 1. missing-output: an expected objective has no execution record.
  for (const id of expected.objectives) {
    if (!execById.has(id)) add("missing-output", id, `execution record for ${id}`, "absent", [], "ERROR");
  }

  // 2. wrong-execution-order: observed order of expected objectives ≠ contract order.
  const observedExpectedOrder = observed.executedOrder.filter((id) => expected.objectives.includes(id));
  const contractOrder = expected.objectiveOrder.filter((id) => observedExpectedOrder.includes(id));
  if (JSON.stringify(observedExpectedOrder) !== JSON.stringify(contractOrder)) {
    add("wrong-execution-order", contractOrder[0] || null, contractOrder, observedExpectedOrder, [], "ERROR");
  }

  // 3. contradictory-result + 4. missing-output(evidence): status EXECUTED but evidence absent/empty.
  for (const e of observed.executed) {
    const id = e.objectiveId || e.action;
    if (e.status === "EXECUTED") {
      if (!e.evidence) add("contradictory-result", id, "EXECUTED ⇒ evidence path", "none", [], "ERROR");
      else if (!fileEvidenceOk(path.join(observed.generatedDir, path.basename(e.evidence))) && !fileEvidenceOk(e.evidence))
        add("missing-output", id, `non-empty evidence at ${e.evidence}`, "absent/empty", [e.evidence], "ERROR");
    }
    if (e.status === "FAILED") add("failed-action", id, "no failed action", `FAILED: ${String(e.error || "").slice(0, 120)}`, [e.evidence].filter(Boolean), "ERROR");
  }

  // 4b. recorded-noop (RC-4): a RECORDED objective on an ENGINEERING mission produced NEITHER a real
  // edit NOR a capability execution+evidence (the same no-op class validation-engine blocks via
  // noRecordedNoOp). It is a real divergence here so diagnose can no longer call it NO_DIVERGENCE.
  // Scoped to engineering so read-only AUDIT missions keep their behaviour (no false positive).
  if (expected.engineering) {
    for (const e of observed.executed) {
      if (e && e.status === "RECORDED") {
        add("recorded-noop", e.objectiveId || e.action, "real effect (edit or capability execution + evidence)", "RECORDED no-op (no effect)", [], "ERROR");
      }
    }
  }

  // 5. missing / unexpected permissions: an executed edit touched a target outside the authorized set,
  //    or an engineering mission declared no authorized paths.
  if (expected.engineering && expected.authorizedPaths.length === 0) {
    add("missing-permission", expected.mission, "engineering ⇒ ≥1 authorizedPath", "authorizedPaths empty", [], "ERROR");
  }
  for (const e of observed.executed) {
    const edits = Array.isArray(e.edits) ? e.edits : [];
    for (const ed of edits) {
      const target = ed && ed.target;
      if (target && !inAuthorized(target, expected.authorizedPaths)) {
        add("unexpected-permission", target, `target within ${JSON.stringify(expected.authorizedPaths)}`, target, [], "CRITICAL");
      }
    }
  }

  // 6. failed-invariant: when a state-transition record is provided, run the C03 invariants (reuse).
  if (opts.transition) {
    const v = stateTransition.validateStateTransition(opts.transition);
    if (!v.ok) add("failed-invariant", (v.errors && v.errors[0]) || "invariant", "all C03 invariants hold", v.errors, (opts.transition.evidence_refs || []), "CRITICAL");
  }

  // 7. required-proof-unsatisfied (contradictory-result): a REQUIRED proof does not verify against the
  //    observed evidence — but only when the mission was expected to COMPLETE (opts.expectComplete).
  //    In a dry-run (expectComplete=false) an unsatisfied proof is the CORRECT state, not a divergence.
  if (opts.expectComplete && observed.runProbe) {
    for (const ev of expected.requiredProofs) {
      let r;
      try { r = observed.runProbe(ev, opts.probeCtx || {}); } catch (err) { r = { ok: false, detail: String(err && err.message) }; }
      if (!r || r.ok !== true) add("required-proof-unsatisfied", ev, `${ev} verifies`, (r && r.detail) || "not ok", [], "ERROR");
    }
  }

  // 8. regression: a proof/check that passed in a supplied baseline now fails.
  if (opts.baseline && opts.baseline.proofs && observed.runProbe) {
    for (const [ev, wasOk] of Object.entries(opts.baseline.proofs)) {
      if (wasOk !== true) continue;
      let r;
      try { r = observed.runProbe(ev, opts.probeCtx || {}); } catch { r = { ok: false }; }
      if (!r || r.ok !== true) add("regression", ev, `${ev} stays green (baseline)`, "now failing", [], "CRITICAL");
    }
  }

  // 9. validation-blocked (RC-4): consume the INDEPENDENT validation verdict (mission-report.json). If
  // validation judged the mission BLOCKED / not validated, the two signals would otherwise contradict
  // each other, so diagnose MUST surface a divergence and can never report NO_DIVERGENCE. Read-only:
  // the verdict file is never written here and validation's gate is never weakened. An absent verdict
  // adds nothing (there is no verdict to contradict).
  if (observed.verdict && (observed.verdict.status === "BLOCKED" || observed.verdict.validated === false)) {
    const unmet = Array.isArray(observed.verdict.unmet) ? observed.verdict.unmet : [];
    add("validation-blocked", observed.verdict.mission || expected.mission, "validation SUCCESS (validated=true)", (observed.verdict.status || "BLOCKED") + " (validated=" + observed.verdict.validated + ")", unmet, "ERROR");
  }

  // Deterministic order so the incident id is stable regardless of detection order.
  div.sort((a, b) => (a.category + String(a.firstDifferenceAt)).localeCompare(b.category + String(b.firstDifferenceAt)));
  return div;
}

function inAuthorized(target, authorizedPaths) {
  const norm = path.normalize(String(target));
  if (!Array.isArray(authorizedPaths)) return false;
  return authorizedPaths.some((pre) => {
    const base = String(pre).replace(/[*].*$/, "").replace(/\/+$/, "");
    return base && (norm === base || norm.startsWith(base + "/") || norm === String(pre));
  });
}

/*
 * ROOT-CAUSE SUPPORT — for each divergence produce ≥1 candidate cause and the SMALLEST discriminating
 * check (a named, re-runnable predicate description). This is deliberately minimal: it feeds the
 * existing RootCauseEngine's domain (release-gate blockers) and does not duplicate it.
 */
const HYPOTHESES = {
  "missing-output": [
    { cause: "capability executor did not run (no matching executor / resolve returned null)", test: "resolve(patch) is non-null for the objective" },
    { cause: "executor ran but failed before writing evidence", test: "patch-execution record status is FAILED with an error" },
  ],
  "contradictory-result": [
    { cause: "executor returned EXECUTED without emitting its evidence artifact", test: "evidence path present AND file non-empty" },
  ],
  "missing-permission": [{ cause: "engineering contract omitted authorized_paths", test: "contract.authorized_paths length > 0" }],
  "unexpected-permission": [{ cause: "patch targeted a path outside the authorized write-set", test: "every edit.target ∈ authorizedPaths" }],
  "wrong-execution-order": [{ cause: "decision/actions reordered objectives vs contract", test: "executedOrder equals contract objective order" }],
  "failed-invariant": [{ cause: "state transition violated a C03 invariant (version/evidence/shape)", test: "validateStateTransition(record).ok === true" }],
  "required-proof-unsatisfied": [
    { cause: "the capability did not actually produce the required proof (e.g. dry-run / plan-only)", test: "proof probe returns ok:true against real evidence" },
  ],
  "regression": [{ cause: "a recent change broke a previously-green proof", test: "proof green on baseline commit but red now" }],
  "failed-action": [{ cause: "the capability threw during execution", test: "re-run the capability in isolation and capture the error" }],
  "recorded-noop": [
    { cause: "no capability executor resolved for the objective and no real edit was produced (capability-resolution gap, see RC-3)", test: "capabilityExecutors.resolve(patch) is non-null OR the patch carries real edits" },
  ],
  "validation-blocked": [
    { cause: "the independent Validation Engine judged the mission BLOCKED (unmet evidence)", test: "mission-report.json status is SUCCESS AND validated is true" },
  ],
};

function hypothesize(divergence) {
  const list = HYPOTHESES[divergence.category] || [{ cause: "unclassified divergence", test: "re-observe with additional instrumentation" }];
  return list.map((h) => ({ ...h, supportedBy: divergence.evidence_refs }));
}

/*
 * RAISE INCIDENT — persist/update the incident ledger via the existing autonomy-store. Loop protection:
 * a re-raised incident (same stable id) increments attempts; at maxAttempts it is FROZEN and must be
 * escalated (never iterated endlessly).
 */
function raiseIncident(divergences, opts = {}) {
  if (!Array.isArray(divergences) || divergences.length === 0) return null;
  const maxAttempts = Number.isInteger(opts.maxAttempts) ? opts.maxAttempts : DEFAULT_MAX_ATTEMPTS;
  const id = stableId(divergences.map((d) => ({ c: d.category, f: d.firstDifferenceAt })));
  const ledger = store.read(INCIDENTS_FILE, { incidents: {} });
  if (!ledger.incidents) ledger.incidents = {};
  const prev = ledger.incidents[id];
  const attempts = (prev ? prev.attempts : 0) + 1;
  const status = attempts >= maxAttempts ? "FROZEN" : "OPEN";
  const incident = {
    id,
    mission: opts.mission || null,
    status,
    attempts,
    maxAttempts,
    createdAt: prev ? prev.createdAt : opts.now || null,
    updatedAt: opts.now || null,
    severity: divergences.some((d) => d.severity === "CRITICAL") ? "CRITICAL" : "ERROR",
    divergences,
    hypotheses: divergences.map((d) => ({ divergence: d.category, at: d.firstDifferenceAt, candidates: hypothesize(d) })),
    note: status === "FROZEN" ? "Repeated/oscillating incident frozen — escalate (loop protection)." : null,
  };
  ledger.incidents[id] = incident;
  store.write(INCIDENTS_FILE, ledger);
  return incident;
}

/*
 * DIAGNOSE — the single demonstrable entry: CHECKPOINT/CONTRACT → EXPECTED → OBSERVE → DIVERGENCE →
 * INCIDENT (+ hypotheses + loop protection). Writes a self-diagnostic report. Returns the full result.
 */
function diagnose(opts = {}) {
  const generatedDir = opts.generatedDir || GENERATED_DIR;
  const plan = opts.plan || readJsonSafe(path.join(generatedDir, "mission-plan.json")) || {};
  const expected = buildExpected(plan);
  const observed = observe(generatedDir, opts);
  const divergences = detectDivergences(expected, observed, opts);
  const incident = raiseIncident(divergences, { mission: expected.mission, now: opts.now, maxAttempts: opts.maxAttempts });
  const report = {
    tool: "self-diagnostic",
    mission: expected.mission,
    expected,
    observed: { executed: observed.executed, executedOrder: observed.executedOrder },
    divergences,
    incident,
    converged: divergences.length === 0,
    summary: divergences.length === 0 ? "NO_DIVERGENCE" : `${divergences.length} divergence(s) → incident ${incident.id} (${incident.status})`,
  };
  if (opts.write !== false) {
    try {
      fs.mkdirSync(generatedDir, { recursive: true });
      fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    } catch { /* report is best-effort; incident ledger is authoritative */ }
  }
  return report;
}

/*
 * REPAIR ROUTING — classify a divergence's repairability and name the EXISTING mechanism that would
 * handle it. This NEVER applies a repair and NEVER reimplements one: it routes. Anything touching
 * permissions / authority / governance invariants is PROTECTED → HUMAN_APPROVAL_REQUIRED (rule 6/13).
 * Conservative by default: only clearly-safe, reversible, in-scope content/regeneration repairs are
 * AUTO; everything uncertain requires human approval.
 */
const REPAIR_ROUTES = {
  // Safe, reversible, reuses an existing tested engine.
  "regression": { action: "AUTO", mechanism: "build-recovery-engine.recover (rollback-guarded loop)" },
  "missing-output": { action: "AUTO", mechanism: "patch-executor re-run (idempotent capability executor)" },
  "contradictory-result": { action: "AUTO", mechanism: "patch-executor re-run (idempotent capability executor)" },
  "failed-action": { action: "AUTO", mechanism: "build-recovery-engine.recover / local-fixers (in-scope only)" },
  // PROTECTED — authority / permission / governance / ordering-semantics: prepare, never auto-apply.
  "unexpected-permission": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "write-set / authority review", protected: true },
  "missing-permission": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "contract authorized_paths review", protected: true },
  "failed-invariant": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "C03 state-transition review", protected: true },
  "wrong-execution-order": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "decision/contract ordering review" },
  "required-proof-unsatisfied": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "capability must actually produce the proof" },
  // RC-4: both new categories are NEVER auto-repaired (PREPARE_NOT_APPLY preserved). recorded-noop names
  // the capability-resolution gap (RC-3 territory) without implementing it; validation-blocked defers to
  // the authoritative verdict's unmet evidence.
  "recorded-noop": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "capability resolution must produce a real effect (RC-3) - not auto-applied", protected: true },
  "validation-blocked": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "resolve the validation unmet-evidence (verdict is authoritative)" },
};

function classifyRepairability(divergence) {
  const r = REPAIR_ROUTES[divergence.category] || { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "manual investigation" };
  return {
    category: divergence.category,
    at: divergence.firstDifferenceAt,
    action: r.action,
    mechanism: r.mechanism,
    protected: r.protected === true,
    discriminatingTest: (hypothesize(divergence)[0] || {}).test || null,
  };
}

/*
 * PLAN REPAIR — bounded, prepare-not-apply. Produces the repair plan for an incident without touching
 * live state. Bounds: maxRepairFiles (scope), maxAttempts (loop), single pass (no endless exploration).
 */
function planRepair(incident, opts = {}) {
  const maxRepairFiles = Number.isInteger(opts.maxRepairFiles) ? opts.maxRepairFiles : 10;
  const steps = (incident && incident.divergences ? incident.divergences : []).map(classifyRepairability);
  const auto = steps.filter((s) => s.action === "AUTO");
  const humanApproval = steps.filter((s) => s.action === "HUMAN_APPROVAL_REQUIRED");
  const blocked = steps.filter((s) => s.action === "BLOCKED");
  const overScope = auto.length > maxRepairFiles;
  return {
    incident: incident ? incident.id : null,
    frozen: !!incident && incident.status === "FROZEN",
    bounds: { maxRepairFiles, maxAttempts: incident ? incident.maxAttempts : DEFAULT_MAX_ATTEMPTS, singlePass: true },
    steps,
    autoRepairable: auto,
    humanApprovalRequired: humanApproval,
    blocked,
    // Never auto-apply when frozen (loop protection) or when scope is exceeded (bounded repair scope).
    applyAllowed: !!incident && incident.status !== "FROZEN" && auto.length > 0 && !overScope,
    note: incident && incident.status === "FROZEN"
      ? "Incident FROZEN (loop protection) — no further auto-repair; escalate."
      : overScope ? "Auto-repair scope exceeds maxRepairFiles — escalate." : null,
  };
}

/*
 * AUDIT — the bounded orchestration the mission asks for: OBSERVE→DIAGNOSE→INCIDENT→(prepare) REPAIR
 * PLAN→RECORD, delegating actual repair/isolation/rollback to the existing engines named in the plan.
 * It PREPARES repairs (rule 6) and does NOT apply them to live state in this entry point.
 */
function audit(opts = {}) {
  const report = diagnose(opts);
  const repairPlan = report.incident ? planRepair(report.incident, opts) : null;
  const out = { ...report, repairPlan, mode: "PREPARE_NOT_APPLY" };
  if (opts.write !== false) {
    try {
      fs.mkdirSync(opts.generatedDir || GENERATED_DIR, { recursive: true });
      fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
    } catch { /* best-effort */ }
  }
  return out;
}

module.exports = {
  buildExpected,
  observe,
  detectDivergences,
  hypothesize,
  raiseIncident,
  diagnose,
  classifyRepairability,
  planRepair,
  audit,
  stableId,
  INCIDENTS_FILE,
  REPORT_FILE,
  DEFAULT_MAX_ATTEMPTS,
};

// Self-run against the REAL generated artifacts (demonstrates the seam on the live pipeline output).
if (require.main === module) {
  const report = diagnose({});
  console.log("======================================");
  console.log("SELF-DIAGNOSTIC");
  console.log("======================================");
  console.log("Mission     :", report.mission);
  console.log("Expected    :", report.expected.objectives.length, "objective(s),", report.expected.requiredProofs.length, "required proof(s)");
  console.log("Observed    :", report.observed.executedOrder.join(", ") || "(none)");
  console.log("Divergences :", report.divergences.length);
  for (const d of report.divergences) console.log(`  - ${d.category} @ ${d.firstDifferenceAt} (${d.severity})`);
  console.log("Incident    :", report.incident ? `${report.incident.id} ${report.incident.status} (attempt ${report.incident.attempts}/${report.incident.maxAttempts})` : "none");
  console.log("Summary     :", report.summary);
  console.log("Report      :", REPORT_FILE);
  console.log("======================================");
}
