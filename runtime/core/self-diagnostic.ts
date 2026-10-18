#!/usr/bin/env node

/*
 * Self-Diagnostic (TypeScript port; parity with runtime/core/self-diagnostic.js).
 *
 * READ-ONLY OBSERVER: turns CHECKPOINT + CONTRACT + INVARIANTS + EVIDENCE/TRACES into a first-class
 * INCIDENT by comparing EXPECTED vs OBSERVED and locating the FIRST DIVERGENCE. Reads existing generated
 * artifacts, computes divergences, raises incidents (persisted via the EXISTING autonomy-store), attaches
 * candidate causes + the smallest discriminating check, and ranks next checks (advisory). Grants NO
 * authority, changes NO governed state, weakens NO gate; repairs are PREPARE_NOT_APPLY. Deterministic
 * (wall-clock injectable via opts.now; stable content-hash incident id). deps=2 (state-transition,
 * autonomy-store — both already TS, co-located in dist). Strict port: all 16 exports, every divergence
 * category + detection order, the mission-identity guards, the V33 next-check ranking, the repair routes
 * and the ledger-lifecycle diagnostic are preserved EXACTLY, INCLUDING the pre-existing report-write
 * behaviour (mkdir honours opts.generatedDir; writeFileSync targets the fixed cwd-relative REPORT_FILE;
 * opts.write===false disables the write). The historical .js remains the behavioural reference.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const stateTransition = require("./state-transition");
const store = require("./autonomy-store");
const evidenceProvenance = require("./evidence-provenance");

const GENERATED_DIR = "runtime/generated";
const INCIDENTS_FILE = "self-diagnostic-incidents"; // autonomy-store key (it appends .json), under its DIR
const REPORT_FILE = path.join(GENERATED_DIR, "self-diagnostic-report.json");
const DEFAULT_MAX_ATTEMPTS = 3; // loop protection: freeze an oscillating/repeated incident

function readJsonSafe(file: any): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function fileEvidenceOk(p: any): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

// Stable, order-independent hash — reuses the state-transition canonicalizer.
function stableId(obj: any): string {
  const canon = stateTransition.canonicalize(obj);
  return "INC-" + crypto.createHash("sha256").update(JSON.stringify(canon)).digest("hex").slice(0, 16);
}

/*
 * EXPECTED — derived from the loaded mission plan/contract.
 */
function buildExpected(plan: any): any {
  const p = plan && typeof plan === "object" ? plan : {};
  const objectives = Array.isArray(p.objectives) ? p.objectives.map((o: any) => o.id).filter(Boolean) : [];
  const requiredProofs = Array.isArray(p.verify)
    ? p.verify.filter((v: any) => v && v.required !== false && typeof v.evidence === "string").map((v: any) => v.evidence)
    : [];
  const declaredEvidence = Array.isArray(p.evidence) ? p.evidence.filter((e: any) => typeof e === "string") : [];
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
function observe(generatedDir: any, opts: any = {}): any {
  const dir = generatedDir || GENERATED_DIR;
  const exec = readJsonSafe(path.join(dir, "patch-execution.json"));
  const executed = exec && Array.isArray(exec.executed) ? exec.executed : [];
  const probe = typeof opts.runProbe === "function" ? opts.runProbe : null;
  const verdict = opts.verdict !== undefined ? opts.verdict : readJsonSafe(path.join(dir, "mission-report.json"));
  return {
    mission: exec && typeof exec.mission === "string" ? exec.mission : null,
    executed,
    executedOrder: executed.map((e: any) => e.objectiveId || e.action).filter(Boolean),
    runProbe: probe,
    verdict,
    generatedDir: dir,
  };
}

/*
 * DIVERGENCE DETECTION — compare EXPECTED vs OBSERVED across the catalogue the mission requires.
 */
function detectDivergences(expected: any, observed: any, opts: any = {}): any {
  const div: any[] = [];
  const add = (category: any, firstDifferenceAt: any, exp: any, obs: any, evidence?: any, severity?: any) =>
    div.push({ category, firstDifferenceAt, expected: exp, observed: obs, evidence_refs: evidence || [], severity: severity || "ERROR" });

  // 0. mission-context-stale.
  if (expected.mission && observed.mission && expected.mission !== observed.mission) {
    add(
      "mission-context-stale",
      expected.mission,
      `observed execution belongs to mission ${expected.mission}`,
      `execution belongs to mission ${observed.mission}`,
      ["runtime/generated/patch-execution.json", "runtime/generated/mission-plan.json"],
      "CRITICAL",
    );
    return div;
  }

  const execById = new Map(observed.executed.map((e: any) => [e.objectiveId || e.action, e]));

  // 1. missing-output.
  for (const id of expected.objectives) {
    if (!execById.has(id)) add("missing-output", id, `execution record for ${id}`, "absent", [], "ERROR");
  }

  // 2. wrong-execution-order.
  const observedExpectedOrder = observed.executedOrder.filter((id: any) => expected.objectives.includes(id));
  const contractOrder = expected.objectiveOrder.filter((id: any) => observedExpectedOrder.includes(id));
  if (JSON.stringify(observedExpectedOrder) !== JSON.stringify(contractOrder)) {
    add("wrong-execution-order", contractOrder[0] || null, contractOrder, observedExpectedOrder, [], "ERROR");
  }

  // 3. contradictory-result + 4. missing-output(evidence).
  for (const e of observed.executed) {
    const id = e.objectiveId || e.action;
    if (e.status === "EXECUTED") {
      if (!e.evidence) add("contradictory-result", id, "EXECUTED ⇒ evidence path", "none", [], "ERROR");
      else {
        const evInDir = path.join(observed.generatedDir, path.basename(e.evidence));
        const okInDir = fileEvidenceOk(evInDir);
        if (!okInDir && !fileEvidenceOk(e.evidence))
          add("missing-output", id, `non-empty evidence at ${e.evidence}`, "absent/empty", [e.evidence], "ERROR");
        else {
          // TAMPER/STALENESS (NIST MEASURE-4 / OWASP T8): a provenance-stamped evidence artifact must still
          // verify its own content digest. Existence+size cannot detect an artifact mutated (or produced at
          // a different source revision) after stamping. Fires ONLY when a provenance stamp is present, so a
          // normal unstamped artifact is never falsely flagged.
          const resolved = okInDir ? evInDir : e.evidence;
          const doc = readJsonSafe(resolved);
          if (doc && typeof doc === "object" && doc.provenance) {
            const vr = evidenceProvenance.verifyProvenance(doc);
            if (!vr.ok) add("tampered-evidence", id, "stamped evidence content digest verifies", vr.reason, [e.evidence], "CRITICAL");
          }
        }
      }
    }
    if (e.status === "FAILED") add("failed-action", id, "no failed action", `FAILED: ${String(e.error || "").slice(0, 120)}`, [e.evidence].filter(Boolean), "ERROR");
  }

  // 4b. recorded-noop (RC-4).
  if (expected.engineering) {
    for (const e of observed.executed) {
      if (e && e.status === "RECORDED") {
        add("recorded-noop", e.objectiveId || e.action, "real effect (edit or capability execution + evidence)", "RECORDED no-op (no effect)", [], "ERROR");
      }
    }
  }

  // 5. missing / unexpected permissions.
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

  // 6. failed-invariant.
  if (opts.transition) {
    const v = stateTransition.validateStateTransition(opts.transition);
    if (!v.ok) add("failed-invariant", (v.errors && v.errors[0]) || "invariant", "all C03 invariants hold", v.errors, (opts.transition.evidence_refs || []), "CRITICAL");
  }

  // 7. required-proof-unsatisfied.
  // Only when completion is EXPECTED (a dry-run legitimately has no evidence yet — test case 8). When a
  // probe is available, use it (semantic check). Otherwise FALL BACK to a plain existence+non-empty check
  // so a completion-expected diagnosis WITHOUT a probe still catches a declared required proof whose
  // artifact was never produced — previously this whole block was skipped when runProbe was absent.
  if (opts.expectComplete) {
    for (const ev of expected.requiredProofs) {
      if (observed.runProbe) {
        let r;
        try { r = observed.runProbe(ev, opts.probeCtx || {}); } catch (err: any) { r = { ok: false, detail: String(err && err.message) }; }
        if (!r || r.ok !== true) add("required-proof-unsatisfied", ev, `${ev} verifies`, (r && r.detail) || "not ok", [], "ERROR");
      } else if (!fileEvidenceOk(path.join(observed.generatedDir, path.basename(ev))) && !fileEvidenceOk(ev)) {
        add("required-proof-unsatisfied", ev, `required proof artifact present at ${ev}`, "absent/empty", [ev], "ERROR");
      }
    }
  }

  // 8. regression.
  if (opts.baseline && opts.baseline.proofs && observed.runProbe) {
    for (const [ev, wasOk] of Object.entries(opts.baseline.proofs)) {
      if (wasOk !== true) continue;
      let r;
      try { r = observed.runProbe(ev, opts.probeCtx || {}); } catch { r = { ok: false }; }
      if (!r || r.ok !== true) add("regression", ev, `${ev} stays green (baseline)`, "now failing", [], "CRITICAL");
    }
  }

  // 9. validation-blocked (RC-4).
  const verdictMission = observed.verdict && typeof observed.verdict.mission === "string" ? observed.verdict.mission : null;
  const verdictForThisMission = !(expected.mission && verdictMission && expected.mission !== verdictMission);
  if (verdictForThisMission && observed.verdict && (observed.verdict.status === "BLOCKED" || observed.verdict.validated === false)) {
    const unmet = Array.isArray(observed.verdict.unmet) ? observed.verdict.unmet : [];
    add("validation-blocked", verdictMission || expected.mission, "validation SUCCESS (validated=true)", (observed.verdict.status || "BLOCKED") + " (validated=" + observed.verdict.validated + ")", unmet, "ERROR");
  }

  // Deterministic order so the incident id is stable regardless of detection order.
  div.sort((a, b) => (a.category + String(a.firstDifferenceAt)).localeCompare(b.category + String(b.firstDifferenceAt)));
  return div;
}

function inAuthorized(target: any, authorizedPaths: any): boolean {
  const norm = path.normalize(String(target));
  if (!Array.isArray(authorizedPaths)) return false;
  return authorizedPaths.some((pre: any) => {
    const base = String(pre).replace(/[*].*$/, "").replace(/\/+$/, "");
    return base && (norm === base || norm.startsWith(base + "/") || norm === String(pre));
  });
}

/*
 * ROOT-CAUSE SUPPORT.
 */
const HYPOTHESES: any = {
  "missing-output": [
    { cause: "capability executor did not run (no matching executor / resolve returned null)", test: "resolve(patch) is non-null for the objective" },
    { cause: "executor ran but failed before writing evidence", test: "patch-execution record status is FAILED with an error" },
  ],
  "contradictory-result": [
    { cause: "executor returned EXECUTED without emitting its evidence artifact", test: "evidence path present AND file non-empty" },
  ],
  "mission-context-stale": [
    { cause: "the persisted mission-context/plan was not refreshed for the active mission before diagnosing (a prior mission's context leaked in)", test: "mission-plan.json .mission === patch-execution.json .mission" },
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

function hypothesize(divergence: any): any {
  const list = HYPOTHESES[divergence.category] || [{ cause: "unclassified divergence", test: "re-observe with additional instrumentation" }];
  return list.map((h: any) => ({ ...h, supportedBy: divergence.evidence_refs }));
}

/*
 * V33 — OPTIMAL NEXT-CHECK SELECTION (pure, deterministic, ADVISORY).
 */
const MUTATION_HINT = /\b(apply|commit|push|delete|remove|modify|write|overwrite|mutate|rebuild|install)\b/i;

function classifyCheck(test: any): any {
  return MUTATION_HINT.test(String(test || "")) ? "MUTATE" : "OBSERVE";
}

function rankChecks(incident: any): any {
  try {
    const groups = incident && Array.isArray(incident.hypotheses) ? incident.hypotheses : [];
    const sevByDivergence = new Map(
      (incident && Array.isArray(incident.divergences) ? incident.divergences : []).map((d: any) => [d.category, d.severity]),
    );
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
      const discriminates = candidates.length;
      for (const c of candidates) {
        if (!c || typeof c.test !== "string" || !c.test) continue;
        const safetyClass = classifyCheck(c.test);
        const severity = sevByDivergence.get(g.divergence) === "CRITICAL" ? "CRITICAL" : "ERROR";
        const severityWeight = severity === "CRITICAL" ? 2 : 1;
        const informationGain = discriminates + (Math.max(1, sharedCount.get(c.test) || 1) - 1);
        const cost = 1;
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
          score: (safetyClass === "OBSERVE" ? 1000 : 0) + severityWeight * 100 + informationGain * 10 - cost,
          supportedBy: Array.isArray(c.supportedBy) ? c.supportedBy : [],
        });
      }
    }
    checks.sort((a, b) => {
      if (a.safetyClass !== b.safetyClass) return a.safetyClass === "OBSERVE" ? -1 : 1;
      const sev = (b.severity === "CRITICAL" ? 2 : 1) - (a.severity === "CRITICAL" ? 2 : 1);
      if (sev !== 0) return sev;
      if (b.informationGain !== a.informationGain) return b.informationGain - a.informationGain;
      if (a.cost !== b.cost) return a.cost - b.cost;
      return (a.divergence + "|" + a.test).localeCompare(b.divergence + "|" + b.test);
    });
    return checks;
  } catch {
    return [];
  }
}

/*
 * RAISE INCIDENT — persist/update the incident ledger via the existing autonomy-store.
 */
function raiseIncident(divergences: any, opts: any = {}): any {
  if (!Array.isArray(divergences) || divergences.length === 0) return null;
  const maxAttempts = Number.isInteger(opts.maxAttempts) ? opts.maxAttempts : DEFAULT_MAX_ATTEMPTS;
  const id = stableId(divergences.map((d: any) => ({ c: d.category, f: d.firstDifferenceAt })));
  const ledger = store.read(INCIDENTS_FILE, { incidents: {} });
  if (!ledger.incidents) ledger.incidents = {};
  const prev = ledger.incidents[id];
  // Loop protection is TERMINAL: once FROZEN (attempts >= maxAttempts), a re-raise (e.g. a passive
  // diagnostic read that re-runs diagnose) must NOT inflate the counter — it stays at the freeze ceiling.
  // Unbounded growth corrupted the recurrence `maxAttempts` signal (contaminated by observation, not by
  // real repair attempts — apply is already disallowed once FROZEN). Status/verdict are unchanged.
  const prevAttempts = prev ? prev.attempts : 0;
  const attempts = prevAttempts >= maxAttempts ? maxAttempts : prevAttempts + 1;
  const status = attempts >= maxAttempts ? "FROZEN" : "OPEN";
  const incident: any = {
    id,
    mission: opts.mission || null,
    status,
    attempts,
    maxAttempts,
    createdAt: prev ? prev.createdAt : opts.now || null,
    updatedAt: opts.now || null,
    severity: divergences.some((d: any) => d.severity === "CRITICAL") ? "CRITICAL" : "ERROR",
    divergences,
    hypotheses: divergences.map((d: any) => ({ divergence: d.category, at: d.firstDifferenceAt, candidates: hypothesize(d) })),
    note: status === "FROZEN" ? "Repeated/oscillating incident frozen — escalate (loop protection)." : null,
  };
  incident.rankedChecks = rankChecks(incident);
  incident.nextCheck = incident.rankedChecks.length > 0 ? incident.rankedChecks[0] : null;
  ledger.incidents[id] = incident;
  store.write(INCIDENTS_FILE, ledger);
  return incident;
}

/*
 * DIAGNOSE.
 */
function diagnose(opts: any = {}): any {
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
    observed: { mission: observed.mission, executed: observed.executed, executedOrder: observed.executedOrder },
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
 * REPAIR ROUTING.
 */
const REPAIR_ROUTES: any = {
  "regression": { action: "AUTO", mechanism: "build-recovery-engine.recover (rollback-guarded loop)" },
  "missing-output": { action: "AUTO", mechanism: "patch-executor re-run (idempotent capability executor)" },
  "contradictory-result": { action: "AUTO", mechanism: "patch-executor re-run (idempotent capability executor)" },
  "failed-action": { action: "AUTO", mechanism: "build-recovery-engine.recover / local-fixers (in-scope only)" },
  "unexpected-permission": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "write-set / authority review", protected: true },
  "missing-permission": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "contract authorized_paths review", protected: true },
  "failed-invariant": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "C03 state-transition review", protected: true },
  "wrong-execution-order": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "decision/contract ordering review" },
  "required-proof-unsatisfied": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "capability must actually produce the proof" },
  "recorded-noop": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "capability resolution must produce a real effect (RC-3) - not auto-applied", protected: true },
  "validation-blocked": { action: "HUMAN_APPROVAL_REQUIRED", mechanism: "resolve the validation unmet-evidence (verdict is authoritative)" },
};

function classifyRepairability(divergence: any): any {
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
 * PLAN REPAIR — bounded, prepare-not-apply.
 */
function planRepair(incident: any, opts: any = {}): any {
  const maxRepairFiles = Number.isInteger(opts.maxRepairFiles) ? opts.maxRepairFiles : 10;
  const steps = (incident && incident.divergences ? incident.divergences : []).map(classifyRepairability);
  const auto = steps.filter((s: any) => s.action === "AUTO");
  const humanApproval = steps.filter((s: any) => s.action === "HUMAN_APPROVAL_REQUIRED");
  const blocked = steps.filter((s: any) => s.action === "BLOCKED");
  const overScope = auto.length > maxRepairFiles;
  return {
    incident: incident ? incident.id : null,
    frozen: !!incident && incident.status === "FROZEN",
    bounds: { maxRepairFiles, maxAttempts: incident ? incident.maxAttempts : DEFAULT_MAX_ATTEMPTS, singlePass: true },
    steps,
    autoRepairable: auto,
    humanApprovalRequired: humanApproval,
    blocked,
    applyAllowed: !!incident && incident.status !== "FROZEN" && auto.length > 0 && !overScope,
    note: incident && incident.status === "FROZEN"
      ? "Incident FROZEN (loop protection) — no further auto-repair; escalate."
      : overScope ? "Auto-repair scope exceeds maxRepairFiles — escalate." : null,
  };
}

/*
 * AUDIT — OBSERVE→DIAGNOSE→INCIDENT→(prepare) REPAIR PLAN→RECORD. PREPARE_NOT_APPLY.
 */
function audit(opts: any = {}): any {
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

// P2 (B142) — Ledger lifecycle-consistency diagnostic. OBSERVABILITY ONLY. Pure: a function of its input.
const TERMINAL_PROVEN_STATES = Object.freeze(["VERIFIED", "RELEASED", "ARCHIVED"]);

function detectLedgerLifecycleInconsistencies(entries: any): any {
  const list = Array.isArray(entries) ? entries : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || typeof e !== "object" || typeof e.mission !== "string") continue; // I6: skip malformed
    const claimsProven = e.proven === true || e.validated === true;
    if (!claimsProven) continue; // I3: only proven/validated entries are candidates
    const state = typeof e.state === "string" ? e.state : null;
    if (state !== null && TERMINAL_PROVEN_STATES.includes(state)) continue; // I2: legitimate terminal proof
    const superseded = list.slice(i + 1).some(
      (x: any) => x && typeof x === "object" && x.mission === e.mission
        && (x.proven === true || x.validated === true)
        && typeof x.state === "string" && TERMINAL_PROVEN_STATES.includes(x.state),
    );
    out.push({
      category: "lifecycle-proven-inconsistency",
      mission: e.mission,
      state,
      proven: e.proven === true,
      validated: e.validated === true,
      recordedAt: typeof e.recordedAt === "string" ? e.recordedAt : null,
      superseded,
      severity: superseded ? "WARN" : "ERROR",
      detail: `proven/validated asserted at non-terminal lifecycle state ${JSON.stringify(state)} (terminal proof states: ${TERMINAL_PROVEN_STATES.join("/")})`,
    });
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
  TERMINAL_PROVEN_STATES,
  detectLedgerLifecycleInconsistencies,
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

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (readJsonSafe,
// inAuthorized, HYPOTHESES, REPAIR_ROUTES, ...) are module-scoped, not global script scope (TS2393 guard).
export {};
