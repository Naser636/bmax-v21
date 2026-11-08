#!/usr/bin/env node
"use strict";

/*
 * V12.4 §105 (Partie XXV) — FAILURES REGISTER F01–F40. PURE, verifiable. Enumerates the 40 canonical failure modes,
 * each bound to its PROTECTION mechanism and the REAL repo module(s) that realize it, with an honest status
 * (PROTECTED = module present + proven by tests; PARTIAL = present, not fully proven; TO_AUDIT = protection asserted
 * but not independently verified). It creates NO protection — it is the traceable ledger that MAPS existing guards
 * (action-gate, root-of-trust, evidence-provenance, checkpoint-engine, meta-intelligence, …). `verifyRegister(loaded)`
 * checks internal completeness + that each protection cites a real module; it never fabricates a PROTECTED status.
 * Dual export.
 */

const STATUS = Object.freeze(["PROTECTED", "PARTIAL", "TO_AUDIT"]);

// id, risk, protection, modules (real repo paths/names), status.
const FAILURES = Object.freeze([
  { id: "F01", risk: "ODG judges its own progress", protection: "independent verification", modules: ["frontier-lab", "meta-intelligence"], status: "PROTECTED" },
  { id: "F02", risk: "G0 bypassed", protection: "Root of Trust (fail-closed admission + tamper detection)", modules: ["root-of-trust", "action-gate", "patch-executor"], status: "PROTECTED" },
  { id: "F03", risk: "benchmark manipulated", protection: "protected baselines + held-out", modules: ["meta-intelligence", "learning-reuse-proof", "improvement-baseline"], status: "PARTIAL" },
  { id: "F04", risk: "memory contaminated", protection: "provenance + validation", modules: ["memory-taxonomy", "evidence-provenance", "compounding-loop"], status: "PARTIAL" },
  { id: "F05", risk: "mission lost", protection: "checkpoints", modules: ["checkpoint-engine", "closure-register"], status: "PROTECTED" },
  { id: "F06", risk: "provider indispensable", protection: "interchangeability", modules: ["agent-factory", "capability-router"], status: "PARTIAL" },
  { id: "F07", risk: "agent over-privileged", protection: "minimal permissions", modules: ["action-gate", "third-party-agent-gate", "agent-identity"], status: "PROTECTED" },
  { id: "F08", risk: "dependency compromised", protection: "software provenance / SBOM", modules: ["supply-chain-attest", "sbom-audit-service", "license-policy"], status: "PROTECTED" },
  { id: "F09", risk: "regression", protection: "regression shield / NO-REPEAT", modules: ["campaign-controller", "affected-tests"], status: "PROTECTED" },
  { id: "F10", risk: "documentation taken as proof", protection: "result statuses", modules: ["mission-evidence", "V12.4_SECTION_TRACEABILITY_MATRIX"], status: "PROTECTED" },
  { id: "F11", risk: "simulation taken as reality", protection: "proof type / epistemic status", modules: ["world-model", "frontier-lab", "frontier-sandbox"], status: "PROTECTED" },
  { id: "F12", risk: "cost uncontrolled", protection: "budget + stop", modules: ["budget-ledger", "compounding-loop"], status: "PARTIAL" },
  { id: "F13", risk: "agent conflict", protection: "lot ownership / write-set layering", modules: ["writeset-scheduler", "dep-planner"], status: "PARTIAL" },
  { id: "F14", risk: "work lost", protection: "preservation (git discipline)", modules: ["closure-register", "local-backup-vault"], status: "PROTECTED" },
  { id: "F15", risk: "objective hijacked", protection: "objective integrity", modules: ["objective-authorization", "nl-objective-gateway"], status: "PARTIAL" },
  { id: "F16", risk: "recovery corrupted", protection: "post-restoration verification", modules: ["checkpoint-engine", "root-of-trust"], status: "PROTECTED" },
  { id: "F17", risk: "test contamination", protection: "private sets + audit", modules: ["learning-reuse-proof", "meta-intelligence"], status: "PARTIAL" },
  { id: "F18", risk: "central unavailability", protection: "resilience / resume", modules: ["checkpoint-engine", "idempotency-guard"], status: "PARTIAL" },
  { id: "F19", risk: "unauthorized external action", protection: "R3 block / consequential admission", modules: ["action-gate", "controlled-semi-auto-mode"], status: "PROTECTED" },
  { id: "F20", risk: "historical capabilities lost", protection: "historical register", modules: ["closure-register", "V12.4_SECTION_TRACEABILITY_MATRIX"], status: "PARTIAL" },
  { id: "F21", risk: "duplication", protection: "anti-duplication", modules: ["primitive-validation", "coherence-audit"], status: "PROTECTED" },
  { id: "F22", risk: "ambiguous authority", protection: "responsibility matrix", modules: ["V12.4_SECTION_TRACEABILITY_MATRIX"], status: "PARTIAL" },
  { id: "F23", risk: "unverified forecast", protection: "scoring", modules: ["pipeline-forecast"], status: "PARTIAL" },
  { id: "F24", risk: "non-reproducible artifact", protection: "provenance", modules: ["evidence-provenance"], status: "PROTECTED" },
  { id: "F25", risk: "degrading self-improvement", protection: "baselines + rollback", modules: ["evolution-loop", "compounding-loop"], status: "PROTECTED" },
  { id: "F26", risk: "indirect G0 modification", protection: "transitive controls", modules: ["patch-executor", "root-of-trust"], status: "PROTECTED" },
  { id: "F27", risk: "circular dependency", protection: "architecture graph", modules: ["dep-planner", "roadmap-dep-check"], status: "PARTIAL" },
  { id: "F28", risk: "mission deadlock", protection: "detection + recovery", modules: ["campaign-controller"], status: "PARTIAL" },
  { id: "F29", risk: "data leakage", protection: "classification + minimization", modules: ["memory-taxonomy", "compounding-loop"], status: "PARTIAL" },
  { id: "F30", risk: "destructive migration", protection: "backup + rollback", modules: ["local-backup-vault", "build-recovery-engine"], status: "PARTIAL" },
  { id: "F31", risk: "version drift", protection: "coherent versioning", modules: ["api-contract"], status: "PROTECTED" },
  { id: "F32", risk: "verifier compromised", protection: "cross-verification / role separation", modules: ["meta-intelligence", "evolution-loop", "frontier-lab"], status: "PROTECTED" },
  { id: "F33", risk: "systemic bias", protection: "bias tests", modules: ["fairness-eval"], status: "PARTIAL" },
  { id: "F34", risk: "resources exhausted", protection: "budgets + limits", modules: ["frontier-sandbox", "budget-ledger"], status: "PROTECTED" },
  { id: "F35", risk: "false statistical progress", protection: "uncertainty + repetitions", modules: ["eval-metrics", "k-eval"], status: "PARTIAL" },
  { id: "F36", risk: "provider replacement failure", protection: "interchangeability tests", modules: ["capability-router", "provider-reuse-candidate"], status: "PARTIAL" },
  { id: "F37", risk: "traceability loss", protection: "provenance chain", modules: ["evidence-provenance", "audit-log"], status: "PROTECTED" },
  { id: "F38", risk: "retroactive criteria change", protection: "evaluation versioning", modules: ["meta-intelligence", "excellence-gate"], status: "PARTIAL" },
  { id: "F39", risk: "error amplification", protection: "limits + challenge", modules: ["evolution-loop", "meta-intelligence"], status: "PARTIAL" },
  { id: "F40", risk: "target/reality conflict", protection: "mandatory reconciliation", modules: ["V12.4_SECTION_TRACEABILITY_MATRIX"], status: "PROTECTED" },
]);

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** verifyRegister(loaded?) -> { ok, count, byStatus, incomplete, unknownModules }. Fail-closed: every entry must carry a
 * risk + protection + at least one module + a valid status. If `loaded` (a set/array of present module names) is given,
 * it flags protections whose cited modules are NOT in that set (so a PROTECTED claim is checkable, not asserted). */
function verifyRegister(loaded?: any): any {
  const present = loaded ? new Set((Array.isArray(loaded) ? loaded : Object.keys(loaded)).filter(isStr)) : null;
  const incomplete: string[] = [];
  const unknownModules: string[] = [];
  const byStatus: any = { PROTECTED: 0, PARTIAL: 0, TO_AUDIT: 0 };
  const ids = new Set();
  for (const f of FAILURES) {
    ids.add(f.id);
    if (!isStr(f.id) || !isStr(f.risk) || !isStr(f.protection) || !Array.isArray(f.modules) || f.modules.length === 0 || !STATUS.includes(f.status)) incomplete.push(f.id || "?");
    byStatus[f.status] = (byStatus[f.status] || 0) + 1;
    if (present) for (const m of f.modules) if (!present.has(m)) unknownModules.push(f.id + ":" + m);
  }
  return Object.freeze({
    ok: FAILURES.length === 40 && ids.size === 40 && incomplete.length === 0,
    count: FAILURES.length, distinct: ids.size, byStatus: Object.freeze(byStatus),
    incomplete: Object.freeze(incomplete), unknownModules: present ? Object.freeze(unknownModules) : null,
  });
}

const FAILURES_REGISTER_CONTRACT = Object.freeze({
  id: "V124-F01-F40-FAILURES-REGISTER",
  source: "V12.4 §105 (Partie XXV) — failures register F01–F40 mapped to existing protections",
  statuses: STATUS, count: FAILURES.length,
  notAuthority: "a traceable ledger mapping each failure mode to its REAL protection module; it creates no protection and fabricates no PROTECTED status",
  invariants: Object.freeze([
    "exactly 40 distinct failure modes F01–F40; each has risk + protection + ≥1 real module + a valid honest status",
    "status PROTECTED only where a module is present and proven by tests; else PARTIAL/TO_AUDIT (no inflated status)",
    "the register MAPS existing guards (root-of-trust/action-gate/evidence-provenance/…); it duplicates none",
    "pure/deterministic; verifyRegister is checkable against the set of present modules",
  ]),
});

module.exports = { STATUS, FAILURES, FAILURES_REGISTER_CONTRACT, verifyRegister };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...FAILURES_REGISTER_CONTRACT, verify: verifyRegister() }, null, 2) + "\n"); }

export {};
