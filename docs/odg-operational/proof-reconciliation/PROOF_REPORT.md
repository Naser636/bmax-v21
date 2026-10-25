# ODG_END_TO_END_PROOF_REPORT — Governed Reconciliation (Phase E)

Date 2026-10-25 · €0 · no network · reproducible. This is a REAL local end-to-end capability test (not a unit-test-only exercise) representing a costly, universal B2B process: **month-end bank/ledger reconciliation with independent verification**. It demonstrates ODG's differentiator — reliable execution **with a no-false-success gate** — on a domain-C task using domain-B governance.

## Scenario & contract
- **Problem:** finance ops must reconcile an accounting LEDGER against a BANK statement and surface every discrepancy (amount, missing, duplicate, date). Manual reconciliation is slow and error-prone; missed discrepancies are costly.
- **User/outcome:** a finance controller receives a complete, correct discrepancy report that an auditor can trust.
- **Inputs & rights:** synthetic `ledger.csv` (15 rows) + `bank.csv` (16 rows) with 5 planted discrepancies + a ground-truth `answer-key.json`. No confidential data, no purchase, no deployment.
- **Success:** every planted discrepancy caught (recall 1.0), no spurious findings (precision 1.0), structural invariants hold, and an INDEPENDENT verifier (separate code path) confirms it.
- **Failure/negative conditions tested:** missing/malformed/non-numeric input; a tampered report that HIDES a discrepancy, INFLATES matches, or ADDS a spurious finding; absent report.

## Artifacts (paths)
- `gen-fixtures.mjs` → `ledger.csv`, `bank.csv`, `answer-key.json`
- `reconcile.mjs` → `reconciliation-report.json` (the deliverable)
- `verify-reconciliation.mjs` (INDEPENDENT verifier — the no-false-success gate)
- `reconcile.test.mjs` (positive + negative + no-false-success)

## Reproduce
```
cd docs/odg-operational/proof-reconciliation
node gen-fixtures.mjs && node reconcile.mjs && node verify-reconciliation.mjs   # positive path
node reconcile.test.mjs                                                          # full suite
```

## Results (observed)
- **Positive:** `RECONCILE: 12 matched | 5 findings {AMOUNT_MISMATCH:1,DUPLICATE_IN_BANK:1,MISSING_IN_BANK:1,DATE_MISMATCH:1,MISSING_IN_LEDGER:1}` · runtime **<0.2s** · €0.
- **Independent verify:** `PASS | recall 1.0 precision 1.0 | caught 5/5 planted, 0 spurious`.
- **Suite:** `RECONCILE PROOF TESTS: PASS (pass=10 fail=0)` — incl. fail-closed on missing/malformed/non-numeric input; **hidden-discrepancy → FAIL**, **inflated-matches → FAIL**, **spurious-finding → FAIL**; idempotent; no-report → FAIL (not a silent pass).
- **Robustness highlight:** on the first run the verifier FAILED a *correct* engine output because the author's answer-key `expectedMatchedCount` was miscomputed (10 vs 12). The verifier caught the ground-truth inconsistency rather than rubber-stamping; the key was corrected to 12 → PASS. This is the no-false-success property in action.

## Metrics
| Metric | Value |
|---|---|
| Discrepancies planted / caught | 5 / 5 (recall 1.0) |
| Spurious findings | 0 (precision 1.0) |
| Runtime | <0.2s |
| Paid cost | €0 (CPU only) |
| Human interventions | 0 (automated); human ACCEPTANCE still distinct |
| False-success attempts caught | 3/3 (hidden, inflated, spurious) |

## Independent verdict
PASS — the deliverable satisfies the contract AND a separate verifier confirms it. The gate demonstrably rejects fabricated success.

## Evidence labels
REAL-LOCAL: engine, verifier, tests (all ran, €0). SYNTHETIC: the dataset (author-planted ground truth). NOT-TESTED: unstructured documents (PDF/scan OCR+LLM extraction — a required step for the full IDP offer, not yet built), live ERP/bank integrations, real client data, production deployment.

## Capability shown vs still needed
- **Shown:** structured-data reconciliation + classification + **independent no-false-success verification** + fail-closed I/O + idempotency, at ~€0 marginal cost.
- **Needed for the sellable product:** (1) an **extraction front-end** for unstructured inputs (invoices/statements as PDF/scan) — needs an OCR/LLM step (cost + proof); (2) connectors to a real source (ERP/bank export) — gated; (3) packaging (SLA, audit log, UI) and a **buyer**.
