# ODG Demo Runbook — Reconciliation Assurance

**As of:** 2026-10-25 · **Cost to run:** €0 · **Network required:** none · **Data:** SYNTHETIC only

A clean-environment, single-command demonstrator of the reconciliation + independent-verification product.
Nothing here contacts a client, spends money, or uses real data. All figures are deterministic.

---

## 1. Prerequisites (clean environment)

- Node.js ≥ 18 (uses only `node:fs`, `node:crypto`, `node:os`, `node:path`, `node:url`, `node:assert` — no `npm install`).
- A terminal. No internet, no API key, no account.

Verify: `node --version` → v18 or later.

## 2. One-command demo

```
cd docs/odg-operational/proof-reconciliation
node run-pipeline.mjs
```

Expected output (deterministic):

```
PIPELINE: 12 matched | 5 findings (2 review, 3 certain) {"AMOUNT_MISMATCH":1,"DUPLICATE_IN_BANK":1,"MISSING_IN_BANK":1,"DATE_MISMATCH":1,"MISSING_IN_LEDGER":1}
INDEPENDENT VERIFY: PASS | recall 1 precision 1
SUCCESS CLAIM: ASSERTED — independent verification PASSED
AUDIT: audit-report.json + audit-report.html written to .../proof-reconciliation
```

Then open **`audit-report.html`** in a browser (local file — not published anywhere) to see the professional
review view: summary tiles, per-discrepancy table with explanation + provenance + confidence, the independent
verification verdict, and the stated limits. A banner marks the data as SYNTHETIC.

## 3. Show the adversarial / negative cases

```
node pipeline.test.mjs       # 18/18 — valid, invalid, missing, contradictory, duplicate, ambiguous,
                             # hidden-anomaly, falsified, inflated, idempotent, separation, traceability,
                             # extractor-stub contract
node reconcile.test.mjs      # 10/10 — original Phase-E proof incl. 3 no-false-success tests
```

Prove the **fail-closed** behaviour live (bad input must STOP before reconciliation, no success claim):

```
printf 'ref,date,amount\nA,2026-01-01,oops\n' > /tmp/bad.csv
node run-pipeline.mjs /tmp/bad.csv ./bank.csv ; echo "exit=$?"
# → PIPELINE STOPPED (fail-closed): INPUT_VALIDATION_FAILED ... exit=2
```

Prove the **anti-false-success gate** live (tamper the report → independent verifier FAILs): see
`pipeline.test.mjs` tests "falsified" and "inflated", which drop / add a finding and assert verdict FAIL.

## 4. Regenerate the synthetic dataset (optional)

```
node gen-fixtures.mjs        # rewrites ledger.csv (15 rows) + bank.csv (16) + answer-key.json (5 planted findings)
```

The answer key is the ground truth the *independent* verifier grades against — the engine never sees it.

## 5. What the demo shows / does NOT show

**Shows:** end-to-end structured reconciliation, discrepancy classification, explainability, provenance,
independent verification, fail-closed safety, reproducibility.

**Does NOT show (honestly):** unstructured PDF/scan extraction (interface + cost estimate only, not implemented);
live ERP/bank connectors; real client data; any deployment. These are labelled in the HTML "Limites connues".

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `INPUT_MISSING` | wrong path / not in the dir | `cd` into `proof-reconciliation` first, or pass absolute paths |
| `PIPELINE STOPPED` exit 2 | input failed validation | expected for bad input — read the printed reason |
| verify FAIL exit 1 | report tampered / fixtures stale | `node gen-fixtures.mjs` then re-run |
| `UNKNOWN_EXTRACTOR` | bad `kind` | use `csv`, `tsv`, or `text-fixed` (pdf-llm/ocr are stubs) |
