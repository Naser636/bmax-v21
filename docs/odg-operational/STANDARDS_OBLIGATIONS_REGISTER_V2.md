# ODG — Standards & obligations register V2 (2026-10-27)

Supersedes V1. **Primary-source verification pass.** ACCESS levels: `full-text` / `official-summary` / `public-extract`
/ `metadata-only` / `not-consulted`. No standard purchased; no clause-by-clause claim.

## EU AI Act — base + amendment VERIFIED
- **Base:** Regulation (EU) **2024/1689** — CELEX `32024R1689`, ELI `data.europa.eu/eli/reg/2024/1689/oj`, OJ 2024-07-12,
  in force 2024-08-01. ACCESS: metadata-only (EUR-Lex listing) + official-summary (EC). Full text not fetched.
- **Amendment CONFIRMED:** Regulation (EU) **2026/1744** = **"Digital Omnibus on AI"**, in force **2026-07-27**
  (EUR-Lex consolidated `02024R1689-20260727`; EC portal states in force 2026-07-27). Amends 2024/1689 + 2018/1139 +
  2023/1230. ACCESS: metadata-only (EUR-Lex ELI `eli/reg/2026/1744/oj`) + official-summary (EC). **Article-level
  mechanics NOT read in full text — treat non-date detail as official-summary.**

### Deadline comparison (original → amended)
| Obligation | Original (2024/1689) | Status / amended | ACCESS |
|---|---|---|---|
| AI literacy (Art 4) | 2025-02-02 | date unchanged; **content revised** by omnibus | official-summary |
| Prohibited practices (Art 5) | 2025-02-02 | date unchanged; **new bans (CSAM/NCII)** apply **2026-12-02** | official-summary |
| GPAI (Ch V) | 2025-08-02 | unchanged | official-summary |
| Governance/penalties | 2025-08-02 | unchanged; AI-Office powers strengthened; SME relief | official-summary |
| General application | 2026-08-02 | unchanged | official-summary |
| Art 50 transparency | 2026-08-02 | unchanged | official-summary |
| **Art 50(2) synthetic-content marking** | 2026-08-02 | **grace → 2026-12-02** (systems on market pre-2026-08-02) | official-summary (transitional clause full-text-unverified) |
| **High-risk Annex III** | 2026-08-02 | **amended → 2027-12-02** | official-summary (EC) |
| **High-risk Annex I (products)** | 2027-08-02 | **amended → 2028-08-02** | official-summary (EC) |
> The 2027-12-02 / 2028-08-02 figures used in earlier ODG docs are the **amended** omnibus dates (now corroborated),
> not the base-text originals. Re-check Art 50(2) transitional + new-prohibition dates against full text before any
> compliance certification.

### Role criteria (for self-classification — see `ai-act-role-classifier.ts`)
- **PROVIDER** (Art 3(3)): develops/commissions an AI system or GPAI model AND places it on market / into service under
  own name/trademark. Art 25 re-labelling: a deployer/distributor can *become* provider (own branding, substantial
  modification, or change of intended purpose to high-risk).
- **DEPLOYER** (Art 3(4)): uses an AI system under own authority in a professional activity.
- **GPAI-model PROVIDER** (Art 3(63)/(66)): provider of a general-purpose model; systemic-risk tier adds duties
  (reported ≥10^25 FLOP and/or Commission designation).
- **Determination is per-activity, from real activities — never asserted from a label.** (Classifier is deny-by-default.)

## ISO/IEC 27001:2022 (+Amd 1:2024) · ISO/IEC 42001:2023
Principle-level only; clause text paywalled (free-access routes in the ISO register section once the ISO agent confirms).
27001 Amd 1:2024 = climate (Clause 4.1/4.2); 42001 = AIMS, certifiable, complementary-not-equivalent to the AI Act
(no OJ-harmonised presumption of conformity). ACCESS: official-summary / public-extract.

## GDPR / prospection (CNIL full-text; EUR-Lex metadata-only)
B2B basis = legitimate interest Art 6(1)(f) (subject must relate to recipient's profession); Art 13/14 info incl. **data
source disclosure** (Art 14(2)(f)); Art 21(2) **absolute** right to object for direct marketing; retention ~3 yrs
(CNIL); Art 5(1)(c) minimisation; Art 30 records; Art 32 security. Per-channel detail → `PROSPECTION_COMPLIANCE_CHECKLIST_V1.md`.

## France — fiscal/structure (service-public full-text; URSSAF rate primary-unverified)
Micro-BNC ceiling **83 600 €** (2026, F32353). TVA franchise services/BNC **37 500 € / 41 250 €** (F21746) — single
25 000 € threshold **ABANDONED** (loi 2025-1044). Micro-social libéral BNC régime général **25,6 %** (+0,2 % CFP, décret
2025-943) — *confirm on urssaf.fr*. CFE: exonération année de création, CA ≤5 000 € exonéré. Invoice mentions (L441-9,
F23208) incl. **"EI"** (loi 2022-172), **"TVA non applicable, art. 293 B CGI"** under franchise, B2B penalties + 40 €.
Full decision dossier → `FR_BUSINESS_STRUCTURE_DECISION_V1.md`.

## "CU" — still AMBIGUOUS (CTO confirmation required)
No meaning invented. Plausible: Common Criteria (usually CC; FR national = CSPN/ANSSI) · Conditions d'Utilisation · EUCC
· SecNumCloud/HDS · CSA STAR · "Cas d'Usage". **Do not treat "CU" as an identified référentiel until confirmed.**

## ACCESS SUMMARY
full-text: CNIL (email/phone/postal), service-public fiscal (F32353/F21746/F23208/F31144/F23547). official-summary: EU
AI Act 2024/1689 + 2026/1744 dates (EC portal), ISO scope. metadata-only: EUR-Lex AI Act & GDPR full texts, EUR-Lex
2026/1744 full text. primary-unverified: URSSAF micro-social rate. not-consulted/ambiguous: ISO clause text, "CU".
