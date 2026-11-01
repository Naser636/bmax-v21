# ODG Eleven-to-Ten Crosswalk + Preservation Inventory (V1)

**CTO Master Campaign V2, Phase 0 + Phase 1.** Date **2026-11-01**. Consolidates the eleven historical domains (D01–D11) into **ten permanent engineering centers of excellence (P1–P10)** WITHOUT deleting or downgrading any historical artifact. **Additive, preservation-first, no-fabrication.** Verified against live repo: main @ `130ff62` = origin/main, clean, 5 stashes + 6 foreign untracked preserved, register 176 [160 ACC/9 BL/3 IP/4 DEF] 0-stale — **live state == reported Wave-7 state; nothing changed, nothing lost.**

## 1. Preservation inventory (FACT — all located, read-only verified)
| Artifact class | Count | Location | Status | Reusable? |
|---|---|---|---|---|
| Market dossiers D01–D11 | 11/11 | `docs/odg-operational/MARKET_DOSSIER_D0x_V1.md` | merged | yes (refresh private-sector + segment-score for Phase 2) |
| Expert syntheses D01–D11 | 11/11 | `docs/odg-operational/EXPERT_SYNTHESIS_D0x_V1.md` | merged | yes (contain the 99 profiles + 11 synthesis models) |
| Client-readiness dossiers D01–D11 | 11/11 | `docs/odg-operational/CLIENT_READINESS_D0x_V1.md` | merged | yes (A–S, honest R0–R3) |
| Capability builds G-01…G-08 | 8/8 | `runtime/core/{characterization-baseline,charter-record,executable-spec-intake,dataset-quality-assertions,golden-path-evidence-bundle,dora-metrics,misleading-case-corpus,evidence-pack-export}.ts` (+tests) | merged, independently validated | yes (reuse in P1–P10 demonstrators) |
| Gate-D / private-sector opportunities | O1–O10 | `ODG_PRIVATE_SECTOR_OPPORTUNITIES.md`, `ODG_CAPABILITY_ENGINEERING_AND_OPPORTUNITY_GATE.md`, `ODG_POC_O2_O3_O8.md` | preserved | yes |
| C-capability catalog + domain completion | — | `ELEVEN_DOMAIN_COMPLETION_MATRIX.md` | preserved | yes |
| Canonical records | — | `ODG_MASTER_UNIFIED_REGISTER_V1.md`, `docs/odg/closure-register.json`, `ODG_PROJECT_STATE.md`, `CAPABILITY_GAP_REGISTER_V1.md`, `WAVE6_INDEPENDENT_EVALUATION_V1.md` | current, 0-stale | updated additively |
| 99 expert profiles | 99 | embedded in the 11 `EXPERT_SYNTHESIS_D0x_V1.md` | preserved | yes (re-map to 10 panels in Phase 3) |
| 11 synthesis models | 11 | §4 of each `EXPERT_SYNTHESIS_D0x_V1.md` | preserved | yes (re-map to 10 models in Phase 4) |
| 5 stashes + 6 foreign untracked | 5 + 6 | git | **PRESERVED, untouched** | n/a |

**Conservation verification:** every historical artifact is accounted for above; none deleted, none silently lost, none falsely upgraded; 9 primitives unchanged; no unrelated file/stash modified. Live HEAD == reported `130ff62` (0 commits ahead) — no backward roll.

## 2. Eleven → Ten consolidation map (D01–D11 → P1–P10)
The reduction 11→10 comes from **D08 + D09 consolidating into P10**. Every historical domain is preserved and remains individually recoverable; "primary" = the domain that anchors the profession, "contrib" = cross-cutting contribution.

| Profession | Title | Primary | Contrib | Historical evidence (reuse) |
|---|---|---|---|---|
| **P1** | Software & Full-Stack Engineering | D01 | D11, D07 | MARKET/EXPERT/CLIENT D01; G-01 characterization-baseline |
| **P2** | AI, ML & Agentic Engineering | D02 | D08 (technical) | D02 dossiers; third-party-agent-gate, G-02 charter-record |
| **P3** | Cybersecurity & Secure Software Engineering | D03 | — | D03 dossiers; sbom-audit-service, license-policy, G-05, G-08 |
| **P4** | Data Engineering & Database Systems | D04 | — | D04 dossiers; dataset-quality-service, G-04 |
| **P5** | Cloud, DevOps & Platform Engineering (IDP) | D06 | D07 | D06 dossiers; G-05 golden-path-evidence-bundle. **R1 — ODG has NO complete IDP (O8=SPEC-ONLY)** |
| **P6** | Quality Engineering & Software Testing | D05 | — | D05 dossiers; reality-gate, mechanical-acceptance, k-eval, G-01/G-03/G-07 |
| **P7** | SRE, Distributed Systems & Performance | D07 | D01, D04 | D07 dossiers; slo-targets/collector/response, G-06 dora-metrics |
| **P8** | API, Integration & Business Software | D11 | — | D11 dossiers; einvoice-*, commercial-pipeline |
| **P9** | FinOps & AI/Cloud Cost Engineering | D10 | — | D10 dossiers; unit-economics, economic-extractor, ALLOCATOR |
| **P10** | European Regulatory, AI Assurance & Compliance | D08 + D09 | — | D08+D09 dossiers; ai-act-role-classifier, regulatory-assurance, compliance-evidence-pack, G-08. **NOT a certifier** |

Boundary rules (per mandate §4): programming languages = technologies within P1, not professions; D07 is both P7-primary and a P1/P5 contributor; D08 splits (technical/agentic → P2, assurance/governance → P10); the original D08 and D09 documents remain individually recoverable. **No historical domain is deleted.**

## 3. Expert → profession mapping (99 historical → 10 panels of 9 = 90 target)
The 99 historical profiles (in the 11 `EXPERT_SYNTHESIS` docs) are the Phase-3 candidate pool. Default panel assignment (to be VERIFIED + re-scored in Phase 3; weak candidates replaced with recorded justification):
- **P1** ← D01 panel (Fowler, Beck, Martin, Feathers, Farley, Humble, Kim, Forsgren, Poppendieck).
- **P2** ← D02 panel (Ng, Karpathy, Li, Liang, Yao, Finn, Levine, Stone, Wooldridge) + candidate technical picks from D08 (e.g. Doshi-Velez interpretability/eval, Narayanan model-limits) where agentic-engineering-relevant.
- **P3** ← D03 panel (Anderson[HISTORICAL], Schneier, Moussouris, Lorenc, Fox, Springett, Cappos, Janca, Zalewski).
- **P4** ← D04 panel (Kleppmann, McKinney, Zaharia, Beauchemin, Moses, Reis, Stonebraker, Handy, Das).
- **P5** ← D06 panel (Hightower, Hashimoto, Burns, Hykes, Skelton, Pais, Rice, Cockcroft, Beda).
- **P6** ← D05 panel (Bach, Kaner, Bolton, Crispin, Gregory, Jones, Hendrickson, Adzic, Stewart).
- **P7** ← D07 panel (Beyer, Murphy, Rensin, Allspaw, Majors, Fong-Jones, Gregg, Sridharan, Parker).
- **P8** ← D11 panel (Hohpe, Woolf, Newman, Richardson, van der Aalst, Ruecker, Vernon, Bogard, Erl).
- **P9** ← D10 panel (Storment, Fuller, Quinn, Peterson[replaced Bryant in V1], + verify Crowley/Lambert/Cross/Bormann/Advey = practitioner-tier, replace weak with recorded justification).
- **P10** ← D08 governance (Gebru, Buolamwini, Raji, Mitchell, Chowdhury) + D09 (Wachter, Edwards, Hildebrandt, Kuner, Nemitz, Lynskey, Renda, Brown, Veale) → **down-select to 9 with ADDED engineering-side regulatory-evidence experts** (V1 flagged D09 over-weights law vs controls-as-code; Phase 3 adds OSCAL/policy-as-code engineers e.g. NIST OSCAL/Iorga, recorded PROVISIONAL pending primary evidence).
P10 must pick 9 from the D08+D09 combined pool (18 historical) + engineering additions ⇒ the other D08/D09 experts remain recoverable but not all in the primary-9. **Target 90 distinct primaries; cross-profession reuse (e.g. Forsgren D01↔D07, a D08 eval expert D02↔P10) requires a documented distinct-contribution reason and must not drop any panel below 9.**

## 4. Capability → profession mapping (G-01…G-08 + existing modules)
| Capability | Primary profession(s) | Role |
|---|---|---|
| G-01 characterization-baseline | P1 (+P6) | legacy-modernization behavioral safety net |
| G-02 charter-record | P2, P6, P10 | verdict provenance (subject/method/ground-truth) |
| G-03 executable-spec-intake | P6 (+P1) | Gherkin → deny-by-default acceptance criteria |
| G-04 dataset-quality-assertions | P4 | dbt-style taxonomy + SARIF |
| G-05 golden-path-evidence-bundle | P5, P3, P10 | sealed SBOM+confinement+health bundle |
| G-06 dora-metrics | P7 | denominator-explicit Forsgren four-key read-model |
| G-07 misleading-case-corpus | P6, P2 | false-success-resistance corpus + scorer |
| G-08 evidence-pack-export | P10, P3 | OSCAL-interop evidence export |
| sbom-audit-service, license-policy, supply-chain-attest | P3 | SBOM + license fail-closed |
| third-party-agent-gate, agent-governance-harness | P2 | OWASP Agentic governance |
| dataset-quality-service, independent-label-policy, fairness-eval | P4, P6, P10 | data-quality + eval-integrity |
| reality-gate, mechanical-acceptance, k-eval, broad-it-eval | P6 | evaluation-integrity |
| slo-targets/collector/response, incident-recurrence, checkpoint-engine, odg-health | P7 | reliability-evidence/SLO governance |
| unit-economics, economic-extractor, economic-unit, resource-allocation-engine (ALLOCATOR) | P9 | observed-usage cost integrity |
| einvoice-*, commercial-pipeline, proposal-pipeline, mission-*/campaign-controller | P8 | e-invoice conformance + governed workflow |
| compliance-evidence-pack, regulatory-assurance, iso-*, ai-act-role-classifier, excellence-policy | P10 | cross-regime evidence, source-cite-or-refuse |
| audit-log, evidence-provenance, truth-lock | cross-cutting (all) | tamper-evidence (EVIDENCE primitive) |

## 5. Opportunity → profession mapping (Gate-D O1–O10, preserved)
O1 Agentic AI Runtime Governance → **P2** (+P10). O2 CRA/SBOM/SLSA → **P3** (+P10). O3 AI-Act/ISO-42001 readiness → **P10**. O4 Legacy Modernization → **P1**. O5 Cloud/AI FinOps → **P9**. O6 Continuous QA → **P6**. O7 Observability/AIOps → **P7**. O8 IDP/Backstage → **P5** (R1, spec-only — advisory/evidence). O9 B2B Workflow Automation → **P8**. O10 Securing-AI Posture → **P3** (+P2). (Previous Gate-D estimates are NOT signed contracts/revenue; PoC + named-buyer qualification remain separate gates.)

## 6. Cross-cutting dependency graph (shared governed foundation — NOT ten disconnected businesses)
All ten professions share the 9 permanent primitives (IDENTITY, STATE, CONTRACT, POLICY, RESOLVER, EXECUTOR, EVIDENCE, RECOVERY, ALLOCATOR) and the cross-cutting EVIDENCE tooling (audit-log, evidence-provenance, truth-lock, charter-record). Key edges: P6 (quality/eval-integrity) validates every other profession's deliverables; P10 (regulatory evidence) consumes P3 (SBOM), P2 (agent governance), P4 (data governance); P7 (SRE) reuses P1 (engineering) + P4 (data) signals; P5 (platform) emits P3 (supply-chain) evidence via G-05; P9 (FinOps) meters all professions' compute. No profession is standalone — they compose ODG's governed engineering foundation.

## 7. Orphan / unmapped report
- **No orphaned historical artifact** — every D01–D11 dossier, all 99 experts, all 11 syntheses, all G-01…G-08, O1–O10, and the C-catalog map onto P1–P10 above.
- **Items intentionally NOT in a primary-9 panel** (recoverable, not orphaned): the surplus D08/D09 experts beyond P10's 9 (P10 draws 9 from an 18+ pool); documented as recoverable in the historical EXPERT_SYNTHESIS docs.
- **Known carried blockers (not orphans):** OWNER_GATED OG-01…OG-08 (`CAPABILITY_GAP_REGISTER_V1.md §B`); `eleven-profession-program-definition` remains BLOCKED (not flipped). D06 remains R1 (no IDP).

## 8. Acceptance (Phase 0 + Phase 1)
No historical artifact silently lost ✓ · no unrelated file modified ✓ · no stash changed/deleted ✓ · no historical result falsely upgraded ✓ · all 9 primitives unchanged ✓ · live repository state recorded accurately (main @ 130ff62) ✓ · complete 11→10 mapping ✓ · historical-to-new index (§1) ✓ · expert-to-profession (§3) ✓ · capability-to-profession (§4) ✓ · opportunity-to-profession (§5) ✓ · cross-cutting dependency graph (§6) ✓ · unmapped-item report (§7) ✓ · conservation verification (§1 footer) ✓.

## 9. Next (V2 campaign, dependency-ready)
Phase 2 — ten **private-sector-only** market studies (France/EU/international; segment-scored micro→large; 100-pt rubric; 2025–2026 sources) — largely a private-sector re-frame + refresh of the 11 V1 market dossiers into 10. Phase 3 — verify + re-map the 99 experts into 10 panels of 9 (replace weak, record justification). Phase 4 — 10 excellence models (re-map the 11 V1 syntheses). Phase 5 — P1–P10 demonstrators (reuse G-01…G-08; honest readiness). Phases 6–12 per the mandate. **No restart of Waves 0–7 / G-01…G-08 / the 11 historical dossiers; reuse verified results; rerun only tests required by changed code.**
