#!/usr/bin/env node
"use strict";

/*
 * V5 ECONOMIC CORE — ECONOMIC VERIFICATION (deterministic, fact-based, INDEPENDENT of pipeline success).
 *
 * Canonical requirement (CTO V5 directive — Economic Accounting & Verification Layer): a technical pipeline
 * that runs "green" (build/tests pass, provider returned OK) says NOTHING about whether the ECONOMIC state
 * is valid. "Pipeline success does NOT imply economic success." A separate, independent verification must be
 * able to look at the economic facts of a metered run and decide whether every economic amount is truthful:
 * observed with provenance, valued deterministically (or honestly left UNKNOWN), and conserved in the ledger
 * — never fabricated, never silently coerced.
 *
 * This module is EXACTLY that complement to mechanical-acceptance.js. It creates NO new primitive and NO
 * second state source. It is a pure ARBITRATION layer that COMPOSES the existing economic vocabularies:
 *   - budget-ledger CONSERVATION invariant (total === available + reserved + committed + spent);
 *   - price-resolution VALUATION_STATUS / VALUATION_BASIS;
 *   - economic-unit BASIS (OBSERVED|ESTIMATED) + provenance ("every economic fact has provenance").
 *
 * IMPORTANT — it evaluates FACTS, never claims, and NEVER fabricates: consumes already-gathered trusted facts;
 * performs NO I/O; deny-by-default (no facts ⇒ UNKNOWN, never VERIFIED); honest GAP (INCOMPLETE) for missing/
 * stale price or NOT_OBSERVED usage; proven VIOLATIONS (FAILED) for the "no false economic success" conditions.
 *
 * STRICT TS PORT (V64 FINANCE/DEC-006, bounded semantics-preserving). The controlled vocabulary, precedence
 * (FAILED>INCOMPLETE>VERIFIED>UNKNOWN), finding classification, deny-by-default and the verdictConsistent
 * evidence-integrity check are byte-identical. Pure (no I/O); reuses the dual-ported ./price-resolution.
 */

const PR: any = require("./price-resolution");

// ---- Controlled vocabulary (frozen) -----------------------------------------------------------
const VERDICT = Object.freeze({
  VERIFIED: "VERIFIED",
  FAILED: "FAILED",
  INCOMPLETE: "INCOMPLETE",
  UNKNOWN: "UNKNOWN",
});

const PRECEDENCE = Object.freeze([VERDICT.FAILED, VERDICT.INCOMPLETE, VERDICT.VERIFIED, VERDICT.UNKNOWN]);

const SEVERITY = Object.freeze({ VIOLATION: "VIOLATION", GAP: "GAP", PROOF: "PROOF" });

const FINDING = Object.freeze({
  LEDGER_IMBALANCE: "LEDGER_IMBALANCE",
  SPEND_WITHOUT_OBSERVATION: "SPEND_WITHOUT_OBSERVATION",
  MISSING_PROVENANCE: "MISSING_PROVENANCE",
  AMBIGUOUS_PRICE: "AMBIGUOUS_PRICE",
  UNIT_MISMATCH: "UNIT_MISMATCH",
  VALUATION_OVERFLOW: "VALUATION_OVERFLOW",
  VALUATION_INCONSISTENT: "VALUATION_INCONSISTENT",
  MISSING_PRICE: "MISSING_PRICE",
  STALE_PRICE: "STALE_PRICE",
  NOT_OBSERVED: "NOT_OBSERVED",
  OBSERVED_WITH_PROVENANCE: "OBSERVED_WITH_PROVENANCE",
  LEDGER_CONSERVED: "LEDGER_CONSERVED",
  DERIVED_VALUATION_OK: "DERIVED_VALUATION_OK",
});

const ECONOMIC_VERIFICATION_CONTRACT = Object.freeze({
  id: "V5-ECONOMIC-CORE-ECONOMIC-VERIFICATION",
  source: "CTO V5 Economic Accounting & Verification Layer; composes price-resolution + budget-ledger conservation + economic-unit BASIS/provenance",
  verdicts: Object.freeze(Object.values(VERDICT)),
  precedence: PRECEDENCE,
  severities: Object.freeze(Object.values(SEVERITY)),
  findingCodes: Object.freeze(Object.values(FINDING)),
  denyByDefault: true,
  rules: Object.freeze([
    "pipeline success is NOT economic success — verdict derived ONLY from economic facts",
    "deny-by-default: no economic facts ⇒ UNKNOWN, never VERIFIED",
    "precedence FAILED > INCOMPLETE > VERIFIED > UNKNOWN",
    "VIOLATION (FAILED): ledger imbalance, spend-without-observation, missing provenance, ambiguous price, unit mismatch, valuation overflow, valuation inconsistency",
    "GAP (INCOMPLETE): missing price, stale price, NOT_OBSERVED usage — honest UNKNOWN, never a failure, never a fabricated value",
    "PROOF (VERIFIED basis): OBSERVED usage WITH provenance, ledger conserved, well-formed DERIVED valuation",
    "FACTS not claims: consumes trusted metering result + observation; performs NO I/O; fabricates no value",
    "additive + standalone: not wired into any live gate (opt-in later); deterministic / pure",
  ]),
});

// ---- Type guards (shared house style) ---------------------------------------------------------
function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isFiniteNumber(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }

function finding(code: string, severity: string, detail: any): any {
  return Object.freeze({ code, severity, detail: isNonEmptyString(detail) ? detail : code });
}

function verifyEconomics(facts: any): any {
  const f = isPlainObject(facts) ? facts : {};
  const metering = isPlainObject(f.metering) ? f.metering : null;
  const observation = isPlainObject(f.observation) ? f.observation : null;
  const findings: any[] = [];

  const add = (code: string, severity: string, detail: any) => findings.push(finding(code, severity, detail));

  // --- LEDGER CONSERVATION (budget-ledger invariant) -------------------------------------------
  if (metering && isPlainObject(metering.snapshot)) {
    const s = metering.snapshot;
    const parts = ["total", "available", "reserved", "committed", "spent"];
    if (parts.every((k) => isFiniteNumber(s[k]))) {
      const sum = s.available + s.reserved + s.committed + s.spent;
      if (sum !== s.total) {
        add(FINDING.LEDGER_IMBALANCE, SEVERITY.VIOLATION,
          `ledger conservation broken: total ${s.total} ≠ available+reserved+committed+spent ${sum}`);
      } else {
        add(FINDING.LEDGER_CONSERVED, SEVERITY.PROOF,
          `ledger conserved: total ${s.total} = available+reserved+committed+spent`);
      }
    }
  }

  // --- SPEND WITHOUT OBSERVATION (fabricated spend) --------------------------------------------
  if (metering && metering.spent === true) {
    const hasObserved = isPlainObject(metering.observed) && isFiniteNumber(metering.observed.minor);
    if (!hasObserved) {
      add(FINDING.SPEND_WITHOUT_OBSERVATION, SEVERITY.VIOLATION,
        "ledger recorded a SPEND but no OBSERVED usage backs it (a spend must be a real observation)");
    }
  }

  // --- PROVENANCE on a genuine OBSERVED observation --------------------------------------------
  if (observation) {
    const qs = Array.isArray(observation.quantities) ? observation.quantities : [];
    if (observation.basis === "OBSERVED" && qs.length > 0) {
      if (isNonEmptyString(observation.provenance)) {
        add(FINDING.OBSERVED_WITH_PROVENANCE, SEVERITY.PROOF, "OBSERVED usage carries provenance");
      } else {
        add(FINDING.MISSING_PROVENANCE, SEVERITY.VIOLATION,
          "OBSERVED usage has no provenance (every economic fact must be provenanced)");
      }
    } else if (observation.basis === "ABSENT" || qs.length === 0) {
      add(FINDING.NOT_OBSERVED, SEVERITY.GAP, "no genuine OBSERVED usage (NOT_OBSERVED) — economic truth absent, not 0");
    }
  }

  // --- VALUATION consistency (reuse price-resolution statuses) ---------------------------------
  if (metering && isPlainObject(metering.valuation)) {
    classifyValuation(metering.valuation, add);
  }

  // --- COMBINE: FAILED > INCOMPLETE > VERIFIED > UNKNOWN, deny-by-default -----------------------
  const violations = findings.filter((x) => x.severity === SEVERITY.VIOLATION);
  const gaps = findings.filter((x) => x.severity === SEVERITY.GAP);
  const proofs = findings.filter((x) => x.severity === SEVERITY.PROOF);

  let verdict;
  if (violations.length > 0) verdict = VERDICT.FAILED;
  else if (gaps.length > 0) verdict = VERDICT.INCOMPLETE;
  else if (proofs.length > 0) verdict = VERDICT.VERIFIED;
  else verdict = VERDICT.UNKNOWN; // nothing economic provided — deny-by-default.

  return Object.freeze({
    verdict,
    findings: Object.freeze(findings.slice()),
    violations: Object.freeze(violations.map((x) => x.code)),
    gaps: Object.freeze(gaps.map((x) => x.code)),
    proofs: Object.freeze(proofs.map((x) => x.code)),
  });
}

function classifyValuation(v: any, add: (code: string, severity: string, detail: any) => void): void {
  const S = PR.VALUATION_STATUS;
  switch (v.status) {
    case S.OK:
      if (v.basis === PR.VALUATION_BASIS.DERIVED && isPlainObject(v.value)) {
        add(FINDING.DERIVED_VALUATION_OK, SEVERITY.PROOF, "valuation OK and tagged DERIVED with an exact value");
      } else {
        add(FINDING.VALUATION_INCONSISTENT, SEVERITY.VIOLATION,
          `valuation status OK but basis/value inconsistent (basis=${v.basis}, value=${v.value === null ? "null" : "present"})`);
      }
      break;
    case S.PRICE_RULE_MISSING:
      add(FINDING.MISSING_PRICE, SEVERITY.GAP, "no price rule for the metered usage (UNKNOWN, not 0)");
      requireNullValue(v, add);
      break;
    case S.PRICE_RULE_STALE:
      add(FINDING.STALE_PRICE, SEVERITY.GAP, "no price rule effective at the as-of (UNKNOWN, not 0)");
      requireNullValue(v, add);
      break;
    case S.USAGE_UNKNOWN:
      add(FINDING.NOT_OBSERVED, SEVERITY.GAP, "usage absent/invalid ⇒ not priced (NOT_OBSERVED, not 0)");
      requireNullValue(v, add);
      break;
    case S.PRICE_RULE_AMBIGUOUS:
      add(FINDING.AMBIGUOUS_PRICE, SEVERITY.VIOLATION, "equally-applicable price rules ⇒ non-deterministic (catalog defect)");
      requireNullValue(v, add);
      break;
    case S.USAGE_UNIT_MISMATCH:
      add(FINDING.UNIT_MISMATCH, SEVERITY.VIOLATION, "observed unit/kind ≠ the rule's priced unit (no implicit conversion)");
      requireNullValue(v, add);
      break;
    case S.VALUATION_OVERFLOW:
      add(FINDING.VALUATION_OVERFLOW, SEVERITY.VIOLATION, "exact value would exceed safe integer — refused (never lossy)");
      requireNullValue(v, add);
      break;
    default:
      add(FINDING.VALUATION_INCONSISTENT, SEVERITY.VIOLATION, `unrecognized valuation status: ${String(v.status)}`);
  }
}

function requireNullValue(v: any, add: (code: string, severity: string, detail: any) => void): void {
  if (v.value !== null && v.value !== undefined) {
    add(FINDING.VALUATION_INCONSISTENT, SEVERITY.VIOLATION,
      `non-OK valuation (${v.status}) carries a value — UNKNOWN must never be a number`);
  }
}

function verdictConsistent(record: any): boolean {
  if (!isPlainObject(record)) return false;
  const violations = Array.isArray(record.violations) ? record.violations : null;
  const gaps = Array.isArray(record.gaps) ? record.gaps : null;
  const proofs = Array.isArray(record.proofs) ? record.proofs : null;
  if (violations === null || gaps === null || proofs === null) return false; // malformed shape ⇒ not trustworthy
  const implied = violations.length > 0 ? VERDICT.FAILED
    : gaps.length > 0 ? VERDICT.INCOMPLETE
      : proofs.length > 0 ? VERDICT.VERIFIED
        : VERDICT.UNKNOWN;
  return record.verdict === implied;
}

module.exports = {
  VERDICT, PRECEDENCE, SEVERITY, FINDING, ECONOMIC_VERIFICATION_CONTRACT,
  verifyEconomics, verdictConsistent,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(ECONOMIC_VERIFICATION_CONTRACT, null, 2) + "\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
