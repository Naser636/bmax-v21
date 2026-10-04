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
 * This module is EXACTLY that complement to mechanical-acceptance.js (which verifies the ENGINEERING chain:
 * build/typescript/tests/write-set). It creates NO new primitive and NO second state source. It is a pure
 * ARBITRATION layer that COMPOSES the existing economic vocabularies and reports on their consistency:
 *   - budget-ledger CONSERVATION invariant (total === available + reserved + committed + spent);
 *   - price-resolution VALUATION_STATUS / VALUATION_BASIS (OK|PRICE_RULE_MISSING|AMBIGUOUS|STALE|
 *     USAGE_UNKNOWN|USAGE_UNIT_MISMATCH|VALUATION_OVERFLOW ; DERIVED);
 *   - economic-unit BASIS (OBSERVED|ESTIMATED) + provenance ("every economic fact has provenance").
 *
 * It is STANDALONE and additive, in the exact style of mechanical-acceptance.js / price-resolution.js: a pure
 * core + a read-only require.main CLI that only prints the contract descriptor. The ONLY consumer is
 * EVIDENCE-ONLY: AutonomyRuntimeAdapter.persistEconomicVerification writes this verdict to a gitignored
 * economic-verification-report.json alongside the live cost-metering report when a mission declares a budget.
 * It is NOT wired into any live GATE — the verdict never blocks or changes a release; enforcing it at a
 * release/verify choke point would be a SEPARATE governance decision. No mission OUTCOME changes behaviour.
 *
 * IMPORTANT — it evaluates FACTS, never claims, and NEVER fabricates:
 *   - It consumes ALREADY-GATHERED, trusted facts (a live-cost-metering result + the raw OBSERVED
 *     observation). It performs NO I/O and runs NO command, so it cannot be fooled by the filesystem.
 *   - Deny-by-default: with no economic facts the verdict is UNKNOWN, NEVER VERIFIED.
 *   - A missing price / stale price / absent (NOT_OBSERVED) usage is an HONEST GAP (INCOMPLETE), not a
 *     failure and not a fabricated value — it means the economic truth is simply not (yet) provable.
 *   - A broken ledger, a spend with no observation behind it, an OBSERVED amount with no provenance, an
 *     ambiguous/mismatched/overflowed valuation, or a valuation whose basis/value are inconsistent are
 *     proven VIOLATIONS (FAILED) — exactly the "no false economic success" conditions.
 */

const PR = require("./price-resolution");

// ---- Controlled vocabulary (frozen) -----------------------------------------------------------
const VERDICT = Object.freeze({
  VERIFIED: "VERIFIED",       // >=1 positive economic proof, no violation, no gap.
  FAILED: "FAILED",           // >=1 proven economic VIOLATION (false economic success / broken invariant).
  INCOMPLETE: "INCOMPLETE",   // no violation, but >=1 honest GAP — economic truth not (yet) provable.
  UNKNOWN: "UNKNOWN",         // nothing economic was provided — deny-by-default.
});

// Precedence when buckets are non-empty: a proven violation dominates a gap dominates positive proof.
const PRECEDENCE = Object.freeze([VERDICT.FAILED, VERDICT.INCOMPLETE, VERDICT.VERIFIED, VERDICT.UNKNOWN]);

// Severity of a finding. VIOLATION ⇒ FAILED. GAP ⇒ INCOMPLETE. PROOF ⇒ positive basis for VERIFIED.
const SEVERITY = Object.freeze({ VIOLATION: "VIOLATION", GAP: "GAP", PROOF: "PROOF" });

// The finding codes this engine can emit (stable identifiers for downstream observability).
const FINDING = Object.freeze({
  LEDGER_IMBALANCE: "LEDGER_IMBALANCE",                 // VIOLATION — conservation broken
  SPEND_WITHOUT_OBSERVATION: "SPEND_WITHOUT_OBSERVATION", // VIOLATION — spent with nothing observed (fabricated)
  MISSING_PROVENANCE: "MISSING_PROVENANCE",             // VIOLATION — OBSERVED usage with no provenance
  AMBIGUOUS_PRICE: "AMBIGUOUS_PRICE",                   // VIOLATION — equal-priority rules (non-deterministic)
  UNIT_MISMATCH: "UNIT_MISMATCH",                       // VIOLATION — observed unit ≠ priced/metered unit
  VALUATION_OVERFLOW: "VALUATION_OVERFLOW",             // VIOLATION — exact value refused (would lose precision)
  VALUATION_INCONSISTENT: "VALUATION_INCONSISTENT",     // VIOLATION — status/basis/value disagree
  MISSING_PRICE: "MISSING_PRICE",                       // GAP — no rule (UNKNOWN, honest, never 0)
  STALE_PRICE: "STALE_PRICE",                           // GAP — no rule effective at the as-of
  NOT_OBSERVED: "NOT_OBSERVED",                         // GAP — usage absent / not a genuine observation
  OBSERVED_WITH_PROVENANCE: "OBSERVED_WITH_PROVENANCE", // PROOF
  LEDGER_CONSERVED: "LEDGER_CONSERVED",                 // PROOF
  DERIVED_VALUATION_OK: "DERIVED_VALUATION_OK",         // PROOF
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
function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function isFiniteNumber(v) { return typeof v === "number" && Number.isFinite(v); }

function finding(code, severity, detail) {
  return Object.freeze({ code, severity, detail: isNonEmptyString(detail) ? detail : code });
}

/**
 * verifyEconomics(facts) -> frozen verification record.
 *
 * `facts` (all optional unless noted):
 *   metering:    a live-cost-metering result { decision, metered, spent, observed, snapshot, valuation }.
 *                `snapshot` carries the budget-ledger conservation fields {total,available,reserved,
 *                committed,spent}. `valuation` is a price-resolution result (or null when no catalog).
 *   observation: the raw E observation { basis, quantities[], provenance } behind the metered call. Used to
 *                check provenance and the genuine OBSERVED/ABSENT distinction (the metering result only
 *                exposes the matched quantity, not its provenance).
 *
 * Returns { verdict, findings[], violations[], gaps[], proofs[] } — frozen, deterministic.
 */
function verifyEconomics(facts) {
  const f = isPlainObject(facts) ? facts : {};
  const metering = isPlainObject(f.metering) ? f.metering : null;
  const observation = isPlainObject(f.observation) ? f.observation : null;
  const findings = [];

  const add = (code, severity, detail) => findings.push(finding(code, severity, detail));

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

// Map a price-resolution valuation result onto an economic finding. A DERIVED OK value is a PROOF; the
// known UNKNOWN statuses split into honest GAPs (missing/stale/not-observed) vs VIOLATIONS (ambiguous /
// unit-mismatch / overflow), and any status/basis/value disagreement is a VIOLATION (no silent coercion).
function classifyValuation(v, add) {
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

// Any non-OK valuation that nonetheless carries a non-null value is a fabricated amount ⇒ VIOLATION.
function requireNullValue(v, add) {
  if (v.value !== null && v.value !== undefined) {
    add(FINDING.VALUATION_INCONSISTENT, SEVERITY.VIOLATION,
      `non-OK valuation (${v.status}) carries a value — UNKNOWN must never be a number`);
  }
}

module.exports = {
  VERDICT, PRECEDENCE, SEVERITY, FINDING, ECONOMIC_VERIFICATION_CONTRACT,
  verifyEconomics,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(ECONOMIC_VERIFICATION_CONTRACT, null, 2) + "\n");
}
