# ODG Product Readiness — Reconciliation Assurance

**As of:** 2026-10-25 · **Status:** DEMONSTRATOR PROVEN on synthetic data · **Cost incurred:** €0 (no purchase, no paid call, no network)

This is an honest engineering readiness record for the **Reconciliation Assurance** product: a deterministic
reconciliation engine whose results are checked by an *independent* verifier that **blocks any success claim that
cannot be substantiated** (ODG's anti-false-success governance applied to a commercial problem).

Everything below is reproducible locally with one command (`node run-pipeline.mjs`) against clearly-labelled
**SYNTHETIC** data. No client data, no live ERP/bank integration, no OCR/LLM extraction is claimed to work.

---

## 1. Product journey — the 10 contracted steps and where each is PROVEN

| # | Step | Module | State | Proof |
|---|------|--------|-------|-------|
| 1 | Import documented inputs | `extract-adapter.mjs` (csv/tsv/text-fixed) | DONE | `pipeline.test.mjs` extractor tests |
| 2 | Validate formats / required fields / consistency | `ingest.mjs` | DONE | tests 2–5 (missing/malformed/non-numeric/empty) |
| 3 | Normalise + keep provenance | `ingest.mjs` (`_src {file,line}`) | DONE | test 14 traceability |
| 4 | Reconcile ledger ↔ bank | `reconcile.mjs` `reconcileRows()` | DONE | `reconcile.test.mjs` + pipeline |
| 5 | Detect gaps / absences / duplicates / ambiguities | `reconcile.mjs` (5 finding types) | DONE | tests 1,6,7,8,9 |
| 6 | Distinguish CERTAIN vs NEEDS_REVIEW | `reconcile.mjs` `REVIEW_TYPES` | DONE | tests 6,7,8 |
| 7 | Explainable + traceable results | `reconcile.mjs` `EXPLAIN` + provenance | DONE | test 14 |
| 8 | Independent verification | `verify-reconciliation.mjs` (separate module) | DONE | test 13 (PASS recall/precision=1) |
| 9 | Block unsubstantiated success | verifier verdict gates pipeline exit code | DONE | tests 10,11 (falsified→FAIL, inflated→FAIL) |
| 10 | Reproducible audit report | `audit-report.mjs` (JSON + self-contained HTML) | DONE | `audit-report.json` / `.html` written |

Single entrypoint: `run-pipeline.mjs` chains 1→10 and **fail-closes** on bad input (exit 2) or non-PASS verdict (exit 1).

---

## 2. Coverage matrix (§3 requested dimensions)

| Dimension | Covered by | State | Risk if removed | Deps | Next action |
|-----------|-----------|-------|-----------------|------|-------------|
| Valid inputs | test 1 | PASS | — | none | — |
| Invalid / malformed inputs | tests 3,4 | PASS | silent bad reconcile | none | — |
| Missing data | test 2 | PASS | crash / false empty | none | — |
| Contradictory data | test 6 | PASS | wrong match | none | — |
| Duplicates | test 7 | PASS | double-pay missed | none | — |
| Ambiguous (date tolerance) | test 8 | PASS | timing false-positive | none | tune tolerance per client |
| Hidden anomalies (bank-only) | test 9 | PASS | unrecorded tx missed | none | — |
| False positives / negatives | tests 10,11 (via verifier) | PASS | **false success** | none | — |
| Falsified / inflated results | tests 10,11 | PASS | **false success** | none | — |
| Idempotence | test 12 | PASS | non-reproducible audit | none | — |
| Engine/verifier separation | test 13 (distinct modules) | PASS | self-grading | none | — |
| Error handling / safe-stop | tests 2–5 + pipeline exit 2 | PASS | partial result | none | — |
| Source/decision traceability | test 14 (provenance + explain) | PASS | unauditable | none | — |
| Unstructured extraction (PDF/scan/OCR/LLM) | `extract-adapter.mjs` interface + stub | **NOT IMPLEMENTED** | over-claim | paid OCR/LLM provider | build + verify under separate paid authorization |

**18/18 coverage tests pass + 10/10 original proof tests pass.** Re-run: `node pipeline.test.mjs && node reconcile.test.mjs`.

---

## 3. The extraction gap — stated honestly

Structured inputs (CSV/TSV, fixed-layout `key: value` invoice text) are **fully implemented and free** — no
third party, no network. Extraction of **unstructured** documents (scanned invoices, arbitrary-layout PDFs) is
**not implemented**. We ship it as an *interface* (`pdf-llm`, `ocr` extractors) that:

- throws `EXTRACTOR_NOT_IMPLEMENTED` with a **cost estimate** (OCR ≈ €0.001–0.01/page; LLM-vision ≈ €0.002–0.02/page — order-of-magnitude, to be confirmed against a real provider quote), and
- ships a **substitute** extractor so the pipeline contract and tests run deterministically without any paid service.

We will **not** claim OCR/LLM extraction works until it is actually built and independently verified under a
separate, explicit paid authorization. Today it is: *interface defined, cost estimated, substitute tested.*

---

## 4. What is PROVEN vs NOT (no over-claim)

**PROVEN (real, local, reproducible, synthetic data):** the full structured reconciliation + independent-verification
+ audit pipeline; fail-closed error handling; anti-false-success gate catching both dropped and inflated findings.

**NOT PROVEN / OUT OF SCOPE TODAY:** unstructured document extraction; live ERP/accounting/bank connectors;
multi-currency/FX; real client data at volume; any deployment; any contact, pilot, contract or revenue.

---

## 5. Reproduce

```
cd docs/odg-operational/proof-reconciliation
node gen-fixtures.mjs        # (re)generate synthetic ledger.csv + bank.csv + answer-key.json
node run-pipeline.mjs        # full 10-step journey → audit-report.{json,html}
node reconcile.test.mjs      # 10/10 original proof tests
node pipeline.test.mjs       # 18/18 coverage-matrix tests
```
