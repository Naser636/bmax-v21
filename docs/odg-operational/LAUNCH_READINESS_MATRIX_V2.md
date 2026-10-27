# ODG/BMAX — Launch readiness matrix V2 (2026-10-27)

Supersedes V1 after the primary-source verification pass. Status: **VÉRIFIÉ** / **PARTIEL** / **NON-VÉRIFIÉ** /
**BLOQUÉ** / **EXTERNE**. Perfection NOT claimed. Changes vs V1 marked **[Δ]**.

## A. Commercial chain
| Domain | Status | Note |
|---|---|---|
| proposal → pipeline → dashboard | **VÉRIFIÉ** | `proposal-pipeline` suite 13; chain audit-chained, no fake signature, no double-count |
| proposed/signed/invoiced/cashed | **VÉRIFIÉ** | ledger fail-closed; cashed-only-is-revenue |
| €500k target | **NON-VALIDÉ** | dashboard NO_DATA ⇒ gap = full €500k; 0 signed/cashed |
| AI-Act role classification | **VÉRIFIÉ [Δ]** | `ai-act-role-classifier` suite 11 — deny-by-default, dates deferred to register |
| Prospection compliance | **VÉRIFIÉ [Δ]** | `prospection-compliance` suite 12 — per-channel CNIL/GDPR fail-closed validator |

## B. Standards & obligations (Track B/D) [Δ primary-source pass]
| Domain | Status | Note |
|---|---|---|
| EU AI Act base 2024/1689 | **VÉRIFIÉ — dates only, official-summary (full text unread)** | CELEX 32024R1689 confirmed; EUR-Lex full text metadata-only |
| **Reg (EU) 2026/1744 (Digital Omnibus)** | **VÉRIFIÉ [Δ] — dates only, official-summary + Art.113 authoritative mirror (full clause text unread)** | EXISTS, in force 2026-07-27; high-risk Annex III→2027-12-02, Annex I→2028-08-02, Art.50(2) grace→2026-12-02, new CSAM/NCII bans; EUR-Lex direct = empty shell |
| GDPR per-channel prospection | **VÉRIFIÉ [Δ] (CNIL full-text)** | email/phone/postal/linkedin checklist + validator |
| FR fiscal/structure 2026 | **VÉRIFIÉ [Δ] (service-public full-text)** | micro-BNC 83 600 €; TVA 37 500/41 250 €; 25k abandoned; URSSAF rate primary-unverified |
| ISO 27001 clause text | **PARTIEL→closable €0 [Δ]** | AFNOR "Consultation libre" (ANS) = FREE read-only full text; enables clause-level 27001 lot |
| ISO 42001 clause text | **EXTERNE (CHF 225)** | no free full-text route; purchase decision (CTO) |
| "CU" référentiel | **BLOQUÉ** | ambiguous; CTO must confirm meaning |

## C. Prospects (Track D) [Δ]
| Domain | Status | Note |
|---|---|---|
| Real sourced candidates | **VÉRIFIÉ (23 real) [Δ]** | `FIELD_CANDIDATES_REAL_V3` (18 QUALIFIÉ + 5 REPÉRÉ), multi-country |
| Purchase intent | **NON — jamais présumé** | needs contact (human-gated) |
| Letters/scripts + legal checklist | **VÉRIFIÉ (drafts, UNSENT)** | `PROSPECTION_LETTERS_DRAFT_V1` + `PROSPECTION_COMPLIANCE_CHECKLIST_V1`; `[LEGAL REVIEW]` |

## D. Operational / technical (Track E) — no new primitive/orchestrator
| Domain | Status | Closure |
|---|---|---|
| 9 primitives (identity…allocator) | **VÉRIFIÉ** | gated |
| Evidence / audit / recovery | **VÉRIFIÉ** | audit-log, provenance, checkpoint, build-recovery |
| Tests / regressions | **VÉRIFIÉ** | gate 82/82; tsc 0; dist closure 103 |
| Backups off-host | **EXTERNE** | local proven; off-host needs infra/decision — procedure doc TODO |
| Prod monitoring/alerting | **EXTERNE** | prod observability needs infra/decision |
| KMS / secret custody | **EXTERNE** | prod/spend |
| Prod multi-tenant isolation | **EXTERNE** | hermetic proven; prod external |
| Deployment / public exposure | **PARTIEL** | VPS deploy+reboot validated loopback; public exposure NOT authorised |
| Billing mechanics | **PARTIEL→VÉRIFIÉ (règles) [Δ]** | mandatory mentions verified full-text; real fiscal setup = human |

## E. Closure criteria (mandate §10) — status
1 chain verified — **OUI**. 2 offers scoped/honest — **OUI**. 3 requirements researched + ACCESS explicit — **OUI [Δ,
primary pass]**. 4 gaps closed or logged external — **OUI**. 5 prospects real/classified — **OUI (23) [Δ]**. 6 letters +
legal review to extent evidence allows — **OUI→renforcé [Δ]** (per-channel validator + CNIL full-text; residual
`[LEGAL REVIEW]` for contract/EUR-Lex wording). 7 signature→cash documented — **OUI**. 8 gates pass — **OUI (82/82)**.
9 compass + learning updated — **OUI**. 10 no avoidable blocker without closure action — **OUI**.

## F. Remaining frontiers (grouped — genuinely external/human)
1. **Authorise first outreach** to real sourced prospects (V3) + legal review of letters/pricing/contract.
2. **Confirm "CU"** meaning.
3. **ISO 42001 text** purchase decision (CHF 225) — 27001 now free (read-only) ⇒ schedule a clause-level 27001 lot (€0).
4. **Choose selling structure** (micro/EI/SASU — dossier ready) + RC Pro.
5. **Production deps** (off-host backup, monitoring, KMS, prod multi-tenant, public exposure) — infra + spend + decision.
6. Confirm URSSAF micro-social rate + EUR-Lex GDPR article wording (free, auto-runnable on GO).
7. Any **spend / external contact / signature / production activation**.
