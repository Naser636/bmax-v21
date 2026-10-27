# ODG — Zero-cost standards resource register (V1, 2026-10-27)

Maximise standards/obligations preparation at **€0**, no purchase, no illegal access. **Hard rule: a free guide is
NEVER equated with the official normative standard text.** ISO 27001/42001 normative clauses remain paywalled (OBP
preview = scope/terms only). In-session honesty: only the CNIL guide was actually opened full-text here; other official
URLs were verified to exist but not individually fetched (**flagged**); some licences are unconfirmed (**flagged**).
**Cost engaged: €0.**

## Resource table
| Title | Body | Version/date | URL | ACCESS | Licence | Maps to |
|---|---|---|---|---|---|---|
| Guide de la sécurité des données personnelles | CNIL | 2024 ed. (25 fiches, +IA/cloud/API) | cnil.fr/…/guide-securite-2024 (+PDF) | **full-text (opened)** | unstated (flag) | GDPR Art.32; ISO27001 Annex A |
| Guide d'hygiène informatique (42 mesures) | ANSSI | v2 | cyber.gouv.fr | full-text (not opened, flag) | Etalab/CC? (flag) | ISO27001 Annex A; CSF; GDPR 32 |
| Reco journalisation (ANSSI-PA-012) | ANSSI | 2022-01-28 | cyber.gouv.fr | full-text (flag) | flag | ISO27001 A.8.15–8.16 |
| Reco hébergement cloud SI + SecNumCloud | ANSSI | 2024-08 | cyber.gouv.fr/…/cloud | full-text (flag) | flag | ISO27001/27017; hosting |
| AI Cybersecurity Challenges / FAICP | ENISA | 2020/2023 | enisa.europa.eu | full-text (flag) | ENISA free | ISO42001; AI Act (AI risk) |
| ENISA Threat Landscape 2025 | ENISA | 2025/26 | enisa.europa.eu | full-text (flag) | ENISA free | ISO27001 risk |
| **AI RMF 1.0 (AI 100-1) + Playbook** | NIST | 2023 | nvlpubs.nist.gov; airc.nist.gov | full-text (flag) | **US-gov, freely reusable** | ISO42001 (Govern/Map/Measure/Manage); AI Act |
| **CSF 2.0 (CSWP 29)** | NIST | 2024 | nvlpubs.nist.gov | full-text (flag) | US-gov | ISO27001 ISMS functions |
| **SP 800-53 Rev.5 (+OSCAL)** | NIST | Rev.5 | csrc.nist.gov; github usnistgov/oscal-content | full-text + machine-readable | US-gov | ISO27001 Annex A; GDPR 32 |
| GPAI Code of Practice (+training-data template) | EU Commission / AI Office | 2025-07-10 | digital-strategy.ec.europa.eu | full-text (web) | EU official (voluntary) | AI Act Art.53/55 |
| **AI Act legal text 2024/1689** | EUR-Lex | 2024 | eur-lex.europa.eu | full-text (web) — the binding law, free | EU official | AI Act (normative) |
| ISO OBP 27001/42001 | ISO/IEC | current | iso.org/obp | **preview only** (scope/terms) | ISO © | ISO (scope/terms only) |
| Secure Controls Framework (+200 mapping tabs, OSCAL) | SCF Council | 2025 | securecontrolsframework.com | full catalogue free | **CC BY-ND 4.0** | ISO27001/42001 crosswalk; GDPR; NIST |
| CIS Critical Security Controls v8.1 | CIS | 2024 | cisecurity.org/controls | free (short reg) | **CC BY-NC-ND 4.0** (commercial needs CIS) | ISO27001 Annex A; CSF; 800-53 |

## Correspondence matrix (source → requirement → ODG control → evidence → status → remediation)
Categories: **[OBL]** legal obligation verified · **[NORM]** normative requirement identified · **[REC]** official
recommendation · **[GP]** technical good practice · **[HYP]** hypothesis/interpretation · **[NV]** non-verifiable
without further access.
| Free source | Requirement/recommendation | ODG control | Expected evidence | Available | Status | Remediation |
|---|---|---|---|---|---|---|
| GDPR 2016/679 + CNIL guide | Art.32 security of processing **[OBL]** | audit-log, agent-identity, excellence-policy | approved security policy + records | code mechanisms gated; policy DRAFT | MECHANISM_PRESENT | CTO approves security policy |
| ANSSI PA-012 | logging ≥12 months, architecture **[REC]** | audit-log (A.8.15) | retention config + review records | hash-chain gated; retention undefined | MECHANISM_PRESENT | set retention; execute log review |
| NIST CSF 2.0 | ISMS functions Govern→Recover **[GP]** | governance-kernel, checkpoint/recovery | SoA + process records | code only | MECHANISM_PRESENT | map to 27001 clauses (needs text) |
| NIST 800-53 + SCF | Annex A control depth crosswalk **[GP]** | third-party-agent-gate, patch guard | control mapping + operation | code only | MECHANISM_PRESENT | crosswalk ≠ certified equivalence (gap) |
| NIST AI RMF 1.0 | AIMS Govern/Map/Measure/Manage **[GP]** | regulatory-assurance, excellence-policy | AI risk + impact records | principle-level | PARTIAL | 42001 clause text needed for conformity |
| AI Act 2024/1689 (+2026/1744) | role obligations + Art.50 **[OBL]** | ai-act-role-classifier | role analysis of real activities | classifier (deny-by-default) | VÉRIFIÉ (dates) | confirm ODG role per real activities |
| GPAI Code of Practice | GPAI transparency/copyright **[REC]** | regulatory-assurance | only if GPAI provider | role UNDETERMINED | N/A unless GPAI | classify role first |
| ENISA AI guidance | AI threat/security good practice **[GP]** | third-party-agent-gate (OWASP ASI) | agent-security review records | code gated | MECHANISM_PRESENT | execute a documented review |
| ISO OBP preview | 27001/42001 scope/terms **[NORM-partial]** | iso-readiness / iso-42001-readiness | clause mapping | structure-level only | **[NV]** clauses | AFNOR interactive (27001, free) / buy 42001 |

## What this changes for ODG (free improvements made)
- Confirms **NIST AI RMF / CSF / 800-53 + SCF/CIS** are legitimate **free** scaffolds to *operationalise* ISO intent and
  build policies/registers — used to shape `ISO_27001_POLICY_TEMPLATES_V1` and the operational-evidence approach.
- Confirms **CNIL + ANSSI** guides map to GDPR Art.32 and many Annex A controls (logging retention ≥12 months, cloud,
  access) — concrete measures ODG can adopt and later evidence.
- Confirms the **AI Act text itself is free** (EUR-Lex) — the binding law needs no purchase; only ISO MS standards are paywalled.

## Hard limits (no overclaim)
- **No free guide = the normative ISO standard.** Cross-walks (CSF/800-53/SCF/AI RMF → ISO) are **informative
  approximations, NOT certified equivalence**; the ISMS requirement clauses (27001 §4–10: context, risk-treatment
  process, SoA, internal audit, management review) are normatively defined only in the paywalled text (OBP scope-only).
- Licences: SCF **CC BY-ND 4.0** (no distributing derivatives), CIS **CC BY-NC-ND 4.0** (commercial use needs CIS) —
  usable for internal preparation; **not** for redistributing modified catalogues.
- CNIL/ANSSI licence terms unconfirmed in-session (flag) — confirm before any redistribution.

## Paid resources that may remain indispensable (justification + alternatives; NOT purchased)
- **ISO/IEC 27001:2022 text** — free alternative: **AFNOR "Consultation libre" interactive read-only** (eligibility to
  confirm) ⇒ likely €0; else CHF 155.
- **ISO/IEC 42001:2023 text** — no confirmed free full-text route ⇒ CHF 225 **if** a client requires clause-level 42001;
  otherwise principle-level suffices for readiness. **No purchase without CTO authorisation.**

**Cost engaged by this workstream: €0.**
