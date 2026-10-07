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
  return {
    executed,
    executedOrder: executed.map((e) => e.objectiveId || e.action).filter(Boolean),
    runProbe: probe, // optional injected probe runner (reuse capability-probes) for proof verification
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
};

function hypothesize(divergence) {
  const list = HYPOTHESES[divergence.category] || [{ cause: "unclassified divergence", test: "re-observe with additional instrumentation" }];
  return list.map((h) => ({ ...h, supportedBy: divergence.evidence_refs }));
}

/*
 * V33 — OPTIMAL NEXT-CHECK SELECTION (pure, deterministic, ADVISORY).
 *
 * Given an incident (divergences + their candidate causes/tests), rank the candidate DIAGNOSTIC CHECKS
 * so the Agent runs the most informative one FIRST, instead of executing them in detection order. This
 * chooses WHAT TO INVESTIGATE NEXT — never what is authorized, written, proven, accepted, or released.
 * It reads only the current incident (NO memory, NO repository I/O), mutates no governed state, and
 * marks nothing successful. The hypotheses are left intact — uncertainty is ordered, never collapsed.
 *
 * Deterministic model (simple by design — no probabilistic math): each check is scored on dimensions
 * all derivable from the incident itself —
 *   safetyClass     : OBSERVE (read-only predicate) vs MUTATE (a test that would change state). A
 *                     mutating/irreversible check is NEVER preferred over a safe one.
 *   severityWeight  : the check's divergence is CRITICAL (2) or ERROR (1).
 *   informationGain : how many competing causes it discriminates (its divergence's candidate count)
 *                     PLUS a bonus when the SAME test discriminates across multiple divergences.
 *   cost / reversible / blastRadius : OBSERVE ⇒ cheap / reversible / zero-blast.
 * Order (best first): OBSERVE before MUTATE → higher severity → higher information gain → lower cost →
 * deterministic (category, test) tiebreak. Ties / missing data ⇒ the safest deterministic fallback
 * (the natural head of this stable order), never a silent collapse.
 */
const MUTATION_HINT = /\b(apply|commit|push|delete|remove|modify|write|overwrite|mutate|rebuild|install)\b/i;

function classifyCheck(test) {
  // Every current discriminating `test` is a read-only predicate description; a future test that
  // implies a state change is conservatively treated as MUTATE so it can never outrank a safe check.
  return MUTATION_HINT.test(String(test || "")) ? "MUTATE" : "OBSERVE";
}

function rankChecks(incident) {
  try {
    const groups = incident && Array.isArray(incident.hypotheses) ? incident.hypotheses : [];
    const sevByDivergence = new Map(
      (incident && Array.isArray(incident.divergences) ? incident.divergences : []).map((d) => [d.category, d.severity]),
    );
    // How many distinct divergences each test string discriminates (shared-discriminator bonus).
    const sharedCount = new Map();
    for (const g of groups) {
      const seenHere = new Set();
      for (const c of (Array.isArray(g.candidates) ? g.candidates : [])) {
        const t = c && typeof c.test === "string" ? c.test : null;
        if (t && !seenHere.has(t)) { seenHere.add(t); sharedCount.set(t, (sharedCount.get(t) || 0) + 1); }
      }
    }
    const checks = [];
    for (const g of groups) {
      const candidates = Array.isArray(g.candidates) ? g.candidates : [];
      const discriminates = candidates.length; // a check here distinguishes among this many causes
      for (const c of candidates) {
        if (!c || typeof c.test !== "string" || !c.test) continue; // unavailable diagnostic ⇒ skip
        const safetyClass = classifyCheck(c.test);
        const severity = sevByDivergence.get(g.divergence) === "CRITICAL" ? "CRITICAL" : "ERROR";
        const severityWeight = severity === "CRITICAL" ? 2 : 1;
        const informationGain = discriminates + (Math.max(1, sharedCount.get(c.test) || 1) - 1);
        const cost = 1; // all diagnostic observations are cheap; present for the model, uniform today
        checks.push({
          divergence: g.divergence,
          at: g.at,
          cause: c.cause,
          test: c.test,
          safetyClass,
          reversible: safetyClass === "OBSERVE",
          blastRadius: 0,
          severity,
          informationGain,
          cost,
          // Advisory display score (sort still uses the explicit tuple below to avoid collisions).
          score: (safetyClass === "OBSERVE" ? 1000 : 0) + severityWeight * 100 + informationGain * 10 - cost,
          supportedBy: Array.isArray(c.supportedBy) ? c.supportedBy : [],
        });
      }
    }
    checks.sort((a, b) => {
      if (a.safetyClass !== b.safetyClass) return a.safetyClass === "OBSERVE" ? -1 : 1; // safe first
      const sev = (b.severity === "CRITICAL" ? 2 : 1) - (a.severity === "CRITICAL" ? 2 : 1);
      if (sev !== 0) return sev;                                   // higher severity first
      if (b.informationGain !== a.informationGain) return b.informationGain - a.informationGain; // more gain
      if (a.cost !== b.cost) return a.cost - b.cost;               // cheaper first
      return (a.divergence + "|" + a.test).localeCompare(b.divergence + "|" + b.test); // stable tiebreak
    });
    return checks;
  } catch {
    return []; // fail-closed: never throw; an unrankable incident yields no suggestion (escalate)
  }
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
  // V33 — advisory optimal next-check ranking (pure, read-only; NOT part of the stable id above, so it
  // never changes incident identity/de-duplication). Suggests which diagnostic to run first; decides nothing.
  incident.rankedChecks = rankChecks(incident);
  incident.nextCheck = incident.rankedChecks.length > 0 ? incident.rankedChecks[0] : null;
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
  rankChecks,
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
