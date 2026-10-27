# ODG — Certification pathway & costs (V1, 2026-10-27)

Read-only research, €0, **no body contacted**. **No CB is asserted accredited for a standard without the scope being
verified** — unconfirmed scopes are marked "scope to verify on COFRAC". Prices are "devis required" unless a figure is
publicly sourced (then labelled secondary/estimate). Nothing purchased.

## 1. Accreditation model (France)
- Sole FR accreditation body: **COFRAC** (cofrac.fr), under EU Reg (EC) 765/2008. CBs are accredited to **ISO/IEC
  17021-1** (+ **27006-1** for 27001; **42006** governs CB accreditation for 42001).
- **Verify a CB's SCOPE** on COFRAC "Annuaire des organismes accrédités" / easysearch (tools.cofrac.fr/fr/easysearch):
  search by name / accreditation n° (4-xxxx) / SIREN → open the **scope annex** to confirm the exact standard. "Accredited"
  in general ≠ accredited for 27001 or 42001.
- International registers: **EA** (european-accreditation.org) NAB directory + scopes. **IAF CertSearch**
  (iafcertsearch.org) — **CAVEAT: IAF non-operational since 2026-01-01, merged into Global Accreditation Cooperation;
  archival only.** Foreign NABs: UKAS (UK), ANAB (US), RvA (NL).

## 2. Certification bodies (verify scope before relying)
| CB | Site | Standard | Accreditation verifiable? | Price |
|---|---|---|---|---|
| AFNOR Certification | certification.afnor.org | 27001; 42001 offered | 27001 COFRAC n°4‑0001; **42001 scope: verify COFRAC** | devis |
| Bureau Veritas | bureauveritas.fr | 27001; 42001 | COFRAC CB — **scope to verify** | devis |
| DNV | dnv.fr | 27001; 42001 | **scope to verify (COFRAC/NAB)** | devis |
| SOCOTEC Certification | socotec.fr | 27001; 42001 | **scope to verify** | devis |
| **BSI** | bsigroup.com | 27001; **42001** | 27001 UKAS; **42001 UKAS-accredited (first, 2026-01) + ANAB (2026-03) — verify** | devis |
| **LRQA** | lrqa.com | 27001; **42001** | 42001 **UKAS-accredited (2026-02) — verify** | devis |
| TÜV NORD / Rheinland | tuv-nord.com | 27001; 42001 | 42001 **UKAS+RvA (2026-02) — verify** | devis |
| Certi-Trust | certi-trust.com | 27001 | COFRAC claimed — **verify** | devis |
(Also named, verify first: APAVE, SGS, LNE, NQA, Schellman, ControlCase.)

## 3. ISO 42001 availability — HONEST status
Accredited 42001 certification is **nascent** (2024–2026), governed by the new ISO/IEC **42006**. Confirmed accredited
routes are via **UKAS/ANAB/RvA** (BSI, LRQA, TÜV NORD, ControlCase…). **Broadly-available, COFRAC-accredited 42001 in
France was NOT yet mature in 2026** — many FR CBs "offer" 42001 but whether it is *accredited* (and by whom) must be
verified per CB. Do not treat 42001 certification as routinely available in France yet.

## 4. Costs & timeline (indicative — secondary, not CB quotes)
- Audit = **Stage 1** (doc/readiness ~20–30%) → remediation → **Stage 2** (implementation, decision ~70–80%) →
  certificate (3-yr) → **annual surveillance** (Y2/Y3) → **recertification** (Y3/4).
- FR auditor day-rate ~**€1,200–1,700/day** (2026, secondary). Total 27001 commonly **€10k–50k** by scope/headcount;
  micro 1–10 staff ~**€6k–12k** audit fees (secondary estimates — NOT quotes). 42001 pricing less standardised.
- **CBs do not publish fixed prices → devis required.** No quote obtained (no contact made).

## 5. Scenarios (full cost + realistic delay, not just entry price)
| Scenario | Path | Cost (indicative) | Delay | Notes |
|---|---|---|---|---|
| **A — internal prep (€0) → external cert** | self-prepare ISMS using free guides (NIST/CNIL/ANSSI/ISO OBP preview) + ODG engine, then CB audit | prep €0; audit ~€6–12k (micro) + surveillance | prep weeks–months (depends on operating the ISMS + internal audit) then 2–4 months to certificate | **ODG recommendation.** Lowest cash; readiness is the real gate (needs operated controls + records). |
| **B — public aid → external cert** | a cyber diagnostic (Bpifrance Diag €4,400 net / Cyber PME) feeds readiness, then CB audit | diag €0–4,400; audit as A | + diagnostic lead time | **Caveat: a brand-new solo entity likely does NOT qualify** (see §6). |
| **C — minimal private support → external cert** | light consultant for SoA/internal audit + CB audit | consultant €k’s + audit as A | fastest to readiness | Only if A's internal effort is a bottleneck; no purchase authorised. |

## 6. Public aids (and solo-entity eligibility reality)
| Scheme | Body | Funds | Amount | Eligibility | Relevance |
|---|---|---|---|---|---|
| Diag Cybersécurité | Bpifrance | 8-day expert diagnostic + action plan | €8,800 HT, **50% → €4,400 net** | independent PME; "≥10 salariés" vs "no min" **conflict — verify** | ISO 27001 readiness input; not certification |
| Cyber PME (France 2030) | DGE/Bpifrance/ANSSI | Phase B implementation | €30k–80k, up to **70%** | PME/ETI, calls for projects | hardening toward ISMS |
| **MonAideCyber** | ANSSI | free ~1h30 diagnostic + 6 measures | **free** | **≥2 employees** | first-level hygiene |
| France Num self-diag / Cyberdépart | État | free self-diagnostic + guides | **free** | TPE/PME, **no size floor** | awareness/diagnostic |
| CYBIAH / EDIH | EU + région | cyber maturity, consulting | publicly funded | **10–250 employees**, IDF | cyber maturity |
| **AI Act / ISO 42001 aid** | — | — | **NONE FOUND** | — | no dedicated public subsidy identified 2026-10-27 |

**Eligibility reality (critical):** a brand-new **solo (0-employee)** micro/SASU likely **fails** MonAideCyber (≥2 emp),
CYBIAH/EDIH (10–250 emp), and practically Diag/Cyber PME (PME vetting, activity history, an existing IS to assess).
**What a new solo entity CAN use free regardless of size:** France Num self-diagnostic + Cyberdépart, ANSSI guides. ⇒
Scenario **A (internal prep, €0)** is the realistic default until the entity has employees/history.

## 7. Recommended path (lowest cost + fastest realistic)
**Scenario A.** Prepare the ISMS internally at €0 (free guides + ODG's governance engine + the operational-evidence
discipline), reach `READY_FOR_STAGE1` (all non-external controls SATISFIED with **operated** evidence + complete dossier),
then request quotes from 2–3 **COFRAC-scope-verified** 27001 CBs. Defer ISO 42001 certification until a client requires
it (accredited 42001 is immature + no free FR route). **No purchase/contact without CTO authorisation.**

## Sources
cofrac.fr, tools.cofrac.fr/fr/easysearch, european-accreditation.org, iafcertsearch.org (archival), certification.afnor.org,
bsigroup.com, lrqa.com, tuv-nord.com; bpifrance/les-aides.fr, francenum.gouv.fr, monaidecyber.ssi.gouv.fr, cybiah.eu.
All accessed 2026-10-27. CB accreditation scopes + all prices = **to confirm on COFRAC / via devis**.
