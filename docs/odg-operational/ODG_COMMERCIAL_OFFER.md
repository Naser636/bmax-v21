# ODG Commercial Offer — Reconciliation Assurance

**As of:** 2026-10-25 · **Status:** OFFER DRAFT (nothing sent, nothing signed, €0 collected)
**Proof basis:** demonstrator PROVEN on synthetic data (see `ODG_PRODUCT_READINESS.md`, `proof-reconciliation/`)

> Terminology discipline (never conflated): **proposed price** ≠ **offer sent** ≠ **signed contract** ≠
> **invoice issued** ≠ **cash collected**. This document is a *proposed price in a draft offer*. Nothing beyond
> that stage exists. No prospect has been contacted; no engagement is agreed.

---

## 1. Value proposition

Finance/operations teams reconcile ledgers against bank statements, invoices against orders/payments. The risk
is not just *missing a discrepancy* — it is **believing a reconciliation is clean when it isn't** (false success).
Our differentiator is ODG's governance applied to the result: an **independent verifier** (separate code path)
that must confirm every finding against ground truth and **blocks a "reconciled OK" claim it cannot substantiate**,
plus full **provenance** (every finding traces to source file + line) and **explainability** (why each item is
flagged, and whether it is CERTAIN or NEEDS human REVIEW). The output is a **reproducible audit report** suitable
for a finance review or an auditor.

In one line: *reconciliation you can defend in an audit, because the tool refuses to over-claim.*

## 2. Ideal customer profile (ICP)

- France / Europe **private** companies (public sector explicitly out of scope).
- Finance, accounting-services (expertise comptable), fintech ops, e-commerce/marketplace ops, or SaaS billing teams.
- Pain signal: monthly/weekly manual reconciliation in spreadsheets; recurring "we found it too late" incidents;
  audit pressure; growing transaction volume outpacing the team.
- Data they already have in **structured** form (CSV/export from ERP/bank) — our implemented scope.

## 3. Pilot scope (paid, time-boxed)

**In scope:** structured ledger↔bank (and invoice↔payment) reconciliation on the client's **exported CSV** data;
discrepancy detection + CERTAIN/REVIEW classification; independent verification; reproducible audit report;
one run cadence agreed with the client; a short findings review session.

**Explicitly excluded (pilot):** unstructured PDF/scan extraction (not implemented — interface + cost estimate
only); live ERP/bank API integration; multi-currency/FX normalisation; deployment into client infrastructure;
any production SLA. These are roadmap items, quoted separately only after a real provider quote.

**Prerequisites (client provides):** representative **structured** exports with documented columns; a point of
contact; a definition of "a correct reconciliation" for their case (the ground truth the verifier grades against);
a lawful basis + minimised, pseudonymised sample for the pilot (see `ODG_ADMIN_LEGAL_CHECKLIST_FR.md`).

**Measurable acceptance criteria (pilot):**
1. Pipeline runs to completion on the client's structured sample with **0 unhandled errors** (fail-closed on bad rows).
2. Independent verifier returns **PASS** against the client-agreed ground truth, or every non-PASS is explained.
3. **Recall = 1.0** on a jointly-agreed set of planted/known discrepancies; **precision ≥ target** agreed up front.
4. Every finding carries provenance (source file + line) and an explanation — **100% traceable**.
5. Result is **reproducible**: two runs produce byte-identical reports.

## 4. Deliverables

- Configured reconciliation pipeline for the client's structured format.
- Reproducible audit report (JSON + self-contained HTML) per run.
- Independent verification report (verdict + recall/precision + reasons).
- Findings review + limits/roadmap note.
- Runbook so the client can re-run it themselves.

## 5. Security / privacy / data model

- Processing is **local/deterministic**, offline by default; only `node:*` built-ins; **no network egress** in the
  implemented scope. No client data leaves the agreed environment unless a connector is separately commissioned.
- Data model is minimal: `ref, date, amount` (+ optional client columns). No PII required for the core match;
  client should pseudonymise before sharing a pilot sample.
- GDPR posture: data minimisation, purpose limitation, retention agreed and short; DPA to be signed before any
  real personal data (see legal checklist — point-to-confirm with counsel).

## 6. Pricing — derived from scope, delivery cost and capacity

> Prices are **proposed**, in **EUR**, and rest on explicit assumptions. They are re-derived below, not quoted from
> memory. Market context used only as a sanity band (FR data/finance consulting ≈ €800–1,880/day; typical software
> pilots ≈ €5–25k; integration/implementation ≈ €40–250k).

**Cost + capacity assumptions (to be confirmed):**
- Effective billable senior rate target: **€900–1,200 / day** (prudent–favorable).
- Pilot delivery effort estimate: **6–10 person-days** (intake + configuration + runs + verification + review).
- Capacity: **one** delivery stream at a time initially (no parallel pilots until repeatable).

**Proposed pilot price:** **€6,000–€12,000** fixed (central assumption ≈ 8 days × ~€1,000 + margin), time-boxed
2–4 weeks. Rationale: ≥ delivery cost (8×€1,000=€8,000 central) with modest margin, inside the market pilot band.

**Proposed recurring (post-pilot, if value proven):** **€1,500–€4,000 / month** for a managed recurring
reconciliation + audit cadence on structured data (assumes ≤ a few runs/month, bounded volume). Re-price on volume.

**Connector / unstructured-extraction add-ons:** **NOT priced** until a real provider quote exists; today only a
per-page cost *estimate* (OCR ≈ €0.001–0.01, LLM-vision ≈ €0.002–0.02) — order of magnitude, not an offer.

**Assumptions that change the price:** data volume; number of sources/formats; required cadence; whether the client
needs any non-implemented capability (extraction/connectors push effort and cost up materially).

## 7. Ready-to-customise proposal skeleton

```
Objet : Proposition — fiabilisation de rapprochement (pilote)
1. Contexte & besoin (repris du signal client)
2. Périmètre pilote (inclus / exclu / prérequis)  ← §3 ci-dessus
3. Livrables                                       ← §4
4. Critères d'acceptation mesurables               ← §3 acceptance
5. Sécurité & données (local, minimisation, DPA)   ← §5
6. Prix & hypothèses (pilote fixe + récurrent)     ← §6
7. Planning (2–4 semaines) & plan de démo
8. Limites connues (extraction non structurée non implémentée)
9. Étapes suivantes & conditions
```

## 8. Demo plan (for a real prospect call)

1. Run `node run-pipeline.mjs` live; open `audit-report.html`.
2. Show a CERTAIN finding (duplicate/double charge) and a NEEDS_REVIEW finding (amount mismatch).
3. Tamper the report → show the independent verifier returns **FAIL** (anti-false-success).
4. Feed a bad row → show fail-closed STOP (exit 2).
5. State the limits explicitly (synthetic data; extraction not implemented).
6. Map their structured export to our model; agree the pilot acceptance criteria.

## 9. FAQ / objection handling

- *"We already reconcile in Excel."* — The differentiator is the **independent verification + audit trail**: the
  tool proves the reconciliation, flags what needs a human, and refuses to say "clean" when it isn't.
- *"Does it read our PDFs/scans?"* — **Not yet.** Structured exports today; unstructured extraction is an
  interface with a cost estimate, built + verified only under a separate authorization. We will not pretend it works.
- *"Is our data safe?"* — Local, offline, minimal data model, no egress in the implemented scope; DPA before any
  real personal data.
- *"Can we trust the result?"* — Separate verifier module, ground-truth graded, reproducible byte-identical output,
  every finding traceable to source line.
- *"What does it cost to run?"* — €0 compute (plain Node, no paid service) for structured reconciliation.

## 10. Technical proof dossier (what backs every claim)

- `proof-reconciliation/PROOF_REPORT.md` — Phase-E end-to-end proof.
- `ODG_PRODUCT_READINESS.md` — coverage matrix (18/18 + 10/10), extraction-gap honesty.
- `proof-reconciliation/*.mjs` — engine, verifier, ingest, extract-adapter, audit, pipeline (reproducible).
- Current demo result: **12 matched, 5 findings, independent verify PASS (recall 1 / precision 1)**.
