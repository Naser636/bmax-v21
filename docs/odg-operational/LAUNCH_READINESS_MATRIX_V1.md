# ODG/BMAX — Launch readiness matrix (V1, 2026-10-27)

Honest status per domain: **VÉRIFIÉ** / **PARTIEL** / **NON-VÉRIFIÉ** / **BLOQUÉ** / **EXTERNE (décision/accès/dépense)**.
Every gap has a closure action. **Absolute perfection is NOT claimed.** The only human frontier sought is authorising
the first outreach to the real sourced prospects — plus genuinely external items below.

## A. Commercial chain (Track A)
| Domain | Status | Evidence / closure action |
|---|---|---|
| proposal → pipeline → dashboard | **VÉRIFIÉ** | `proposal-pipeline.ts` (governed bridge) + suite 13/13; chain LEAD→QUALIFIED→PROPOSAL audit-chained; refused proposal ⇒ no entry; no fake signature; no double-count |
| proposed/signed/invoiced/cashed separation | **VÉRIFIÉ** | `pipeline-ledger` fail-closed one-step; `revenue-dashboard` cashed-only-is-revenue |
| €500k linkage | **VÉRIFIÉ (méthode)** / target **NON-VALIDÉ** | dashboard NO_DATA ⇒ gap = full €500k; 0 signed/cashed — target, not forecast |

## B. Offers (Track C)
| Domain | Status | Closure |
|---|---|---|
| Diagnostic offer + executable checklist | **VÉRIFIÉ** | `AI_GOVERNANCE_DIAGNOSTIC_OFFER_V1` + `_CHECKLIST_V1`; tiers map to demonstrated capabilities |
| Prices | **NON-VÉRIFIÉ (HYPOTHÈSE)** | validate with market + CTO before quoting |
| Anti-overclaim enforced | **VÉRIFIÉ** | `proposal-generator.scanClaims` refuses cert/guarantee/superlative |

## C. Standards & obligations (Track D)
| Domain | Status | Closure |
|---|---|---|
| EU AI Act roles + 2026 deadlines | **VÉRIFIÉ (full-text timeline)** | register §4; confirm "Digital Omnibus" claim vs EUR-Lex |
| ISO 27001 / 42001 | **PARTIEL (principle-level, clause text not read)** | self-assessments done; clause-level needs licensed text (EXTERNE: free AFNOR/ANS route TBV else purchase) |
| GDPR / B2B prospection | **PARTIEL (CNIL full-text; EUR-Lex metadata-only)** | compliance checklist built; confirm article wording vs EUR-Lex/Légifrance |
| FR fiscal/admin (micro/SASU/TVA/facture) | **PARTIEL** | invoice mentions full-text; thresholds unverified → confirm impots.gouv.fr/URSSAF |
| "CU" référentiel | **BLOQUÉ (ambigu)** | CTO must confirm meaning (CC/CSPN? Conditions d'Utilisation? EUCC?) |

## D. Prospects (Track B)
| Domain | Status | Closure |
|---|---|---|
| Real sourced SME/ETI candidates | **VÉRIFIÉ (10 réels, REPÉRÉ/QUALIFIÉ)** | `FIELD_CANDIDATES_REAL_V2`; not re-verified 2nd pass |
| Purchase intent | **NON — jamais présumé** | observable need ≠ intent; needs contact (human-gated) |
| Letters/scripts/objections | **VÉRIFIÉ (brouillons, non envoyés)** | `PROSPECTION_LETTERS_DRAFT_V1` + CNIL/GDPR checklist; `[LEGAL REVIEW REQUIRED]` |
| Vivier expansion | **PARTIEL** | method documented (job posts, Pappers/Handelsregister, federations) — run on GO |

## E. Operational / technical (Track E) — no new primitive, no new orchestrator
| Domain | Status | Closure |
|---|---|---|
| Identity / access / authZ | **VÉRIFIÉ** | `agent-identity`, `agent-governance-harness`, `third-party-agent-gate` (gated) |
| State / contract / policy / resolver / executor | **VÉRIFIÉ** | 9 primitives gated |
| Evidence / audit / recovery | **VÉRIFIÉ** | `audit-log` hash-chain, `evidence-provenance`, `checkpoint-engine`, `build-recovery-engine` |
| Tests / regressions / reproducibility | **VÉRIFIÉ** | gate 80/80; tsc 0; dist closure 103 |
| Backups (off-host) | **EXTERNE** | local proven; off-host encrypted backup + restore drill need infra/decision |
| Prod monitoring / alerting / on-call | **EXTERNE** | read-only state views exist; prod observability needs infra/decision |
| KMS / secret custody | **EXTERNE** | test-only keys hermetic; KMS/HSM is a prod/decision/spend item |
| Prod multi-tenant isolation | **EXTERNE** | logical isolation proven hermetically; prod datastore/compute isolation external |
| Deployment / environments | **PARTIEL** | VPS deploy + reboot drill validated (loopback); public exposure NOT authorised |
| Billing / invoicing mechanics | **PARTIEL** | `quote`/`invoicing` modules + mandatory-mentions documented; real fiscal setup = human/admin |
| User/operator docs | **PARTIEL** | operational docs exist; client-facing kit assembled (offer/checklist/letters) |

## F. Closure criteria (mandate §10) — status
1. proposal→pipeline→dashboard verified — **OUI** (suite 13/13).
2. offers scoped/deliverable/honest — **OUI**.
3. applicable requirements researched + verification level explicit — **OUI** (register, honest ACCESS).
4. tech/org gaps closed or logged as real external deps — **OUI** (this matrix).
5. prospects real/sourced/classified/qualified — **OUI** (V2; intent never assumed).
6. letters/scripts/proposals/follow-up prepared + legally reviewed to the extent evidence allows — **PARTIEL** (drafts + CNIL checklist; `[LEGAL REVIEW REQUIRED]`, some sources metadata-only).
7. signature→delivery→invoice→cash→follow-up documented — **OUI**.
8. tests/security/gates pass — **OUI** (80/80, tsc 0, build 0).
9. compass + learning chain updated — **OUI** (this lot).
10. no avoidable blocker left without a closure action — **OUI** (every row has one).

## G. Genuinely external / human decisions (grouped — the only remaining frontiers)
1. **Authorise first outreach** to real sourced prospects (V2) + **legal review** of letters/pricing/contract.
2. Confirm **"CU"** meaning.
3. **ISO clause-level text** access (free route eligibility or purchase authorisation).
4. **Primary-source confirmation** of GDPR article wording + FR tax thresholds (free, can be auto-run on GO).
5. **Production deps** (off-host backup, prod monitoring, KMS, prod multi-tenant, public exposure) — infra + spend + decision.
6. **Legal/fiscal setup** of the selling entity (micro/SASU, immatriculation, RC Pro).
7. Any **spend**; any **external contact / signature / production activation**.
