# ODG — Regulatory closure V3 (2026-10-27)

Records the primary-source verification attempts of this lot. **Honest in-session access results** (what I could and
could NOT read). Nothing purchased; no normative text reproduced.

## EU AI Act — Article 113 corroborated (stronger source)
- `artificialintelligenceact.eu/article/113` returned the **actual consolidated Article 113 text** (authoritative
  mirror). Confirms the AMENDED application schedule:
  - General application **2 Aug 2026**; Chapters I–II from 2 Feb 2025 **except new Art 5(1)(ba)/(bb) + 5(1a)/(1b)
    from 2 Dec 2026** (the new prohibitions); Chapter V/VII/XII + Art 78 from 2 Aug 2025.
  - High-risk **Annex III (Art 6(2)) from 2 Dec 2027**; **Annex I (Art 6(1)) from 2 Aug 2028**.
  - Articles 102–110 from **27 Jul 2026**. Editorial "amended"/"new" markers present (the Reg (EU) 2026/1744 omnibus).
  - ACCESS: **full-text of Article 113 via authoritative mirror** (artificialintelligenceact.eu) — stronger than V2's
    official-summary. **EUR-Lex direct full text (CELEX 32026R1744 / consolidated 02024R1689-20260727) returned empty
    dynamic shells in-session → NOT read directly.**
- **Art 50(2) synthetic-content grace to 2 Dec 2026:** NOT shown in Art 113 itself (Art 50 falls under general
  application 2 Aug 2026); the pre-existing-systems grace is a transitional detail — remains **official-summary**, not
  confirmed in the Art 113 text. Flagged, not upgraded.
- **Code impact:** `ai-act-role-classifier` hardcodes NO dates (defers to this register) ⇒ **no code change required**;
  design validated. Register V2 dates stand, now Article-113-corroborated.

## ISO/IEC 27001 — access attempt + structure-level matrix built
- AFNOR "Consultation libre" portal: the listing + a **"Consulter" button for NF EN ISO/IEC 27001 (juillet 2023)**
  are present, but the fetched page is a shell — **whether Consulter grants free full normative text, and what is
  readable, could NOT be confirmed in-session** (interactive/JS portal). So: free route **PLAUSIBLE but full-text
  access UNVERIFIED by ODG this session**.
- Therefore the new `ISO_27001_CLAUSE_MATRIX_V1.md` is **structure-level** (public clause 4–10 + Annex A theme numbering;
  **no normative text reproduced**), built by `runtime/core/iso-27001-clause-matrix.ts` (suite 13), verified vs REAL
  gated suites, with the mandate's honesty rule enforced in code:
  - **MECHANISM_PRESENT ≠ SATISFIED** — a passing software test proves a code mechanism, not an operated ISMS control;
    SATISFIED requires an explicit operational-evidence assertion (records/policy). Result: **0 SATISFIED / 12
    MECHANISM_PRESENT / 7 EXTERNAL / 0 GAP of 19** — honest: nothing is claimed satisfied.
- **Real remaining ISO gap:** operational evidence (applied policies, records over time) + the actual clause-text
  consultation. Next free lot: perform the AFNOR consultation interactively (human/authorised session) to upgrade
  structure-level → clause-text-referenced.

## Fiscal / RGPD — remaining primary confirmations
- **URSSAF** micro-social rate page: **socket hang up / unreachable in-session** → micro-BNC libéral **25,6 %**
  (+0,2 % CFP, décret 2025-943) stays **primary-unverified** (named decree only). Confirm on urssaf.fr.
- **EUR-Lex GDPR** article wording: direct full-text not fetchable in-session (dynamic) → Art 6/13/14/21 remain
  CNIL-full-text + consolidated-mirror corroborated (per `PROSPECTION_COMPLIANCE_CHECKLIST_V1`), EUR-Lex direct = metadata.
- Service-public fiscal full-text figures (ceiling 83 600 €, TVA 37 500/41 250 €, 25k abandoned) stand (prior lot).

## Net closure this lot
Verified/strengthened: AI-Act Art 113 (authoritative mirror full-text); ISO 27001 structure-level matrix with
mechanism≠satisfied discipline (code-enforced). Still external/unverified: ISO clause TEXT (AFNOR interactive), ISO
operational evidence, URSSAF rate, EUR-Lex direct full text, 42001 text (purchase), **"CU" (ambiguous — CTO)**.
