# Controls referential — zero-cost legal sources crosswalk (V1, 2026-10-27)

Requirements → risk → control → evidence crosswalk built **only from sources actually consulted at €0**. Access level
is recorded honestly: **full-text** (read in full), **open-document** (public text), **metadata-only** (catalogue page
only — normative text NOT read), **sponsored-consultation** (a legal free read-only path exists, not yet used),
**not-consulted**. **No ISO clause text was read; no paywall bypassed; nothing reproduced illicitly.** Distinguishes
legal obligation / normative standard / recommendation / practice. Mirrors the `excellence-policy.accessLevel` field.

## Source access register (consulted 2026-10-27, €0)
| id | authority | access level obtained | free full-text? | source URL | what was analysed |
|---|---|---|---|---|---|
| NIST-CSF-2.0 | NIST | **full-text** (free, US-gov public domain) | **yes** | https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf | 6 Functions: Govern, Identify, Protect, Detect, Respond, Recover |
| NIST-AI-RMF-1.0 | NIST | **full-text** (free) | **yes** | https://doi.org/10.6028/NIST.AI.100-1 | Govern/Map/Measure/Manage functions (AI risk) |
| ANSSI-PA-102 | ANSSI | **full-text** (free) | **yes** | https://messervices.cyber.gouv.fr (Recommandations sécurité IA générative, 2024) | themes: risk+governance, data security, model robustness/testing, operational monitoring |
| ANSSI-HYGIENE | ANSSI | **full-text** (free) | **yes** | https://messervices.cyber.gouv.fr/guides/guide-dhygiene-informatique | 42 IT-hygiene measures |
| GDPR-2016-679 | EU | **open-document** (public regulation) | **yes** | https://eur-lex.europa.eu/eli/reg/2016/679/oj | RoPA, lawful basis, DPIA (high-risk), breach notification |
| CNIL guidance | CNIL | **open-document** | **yes** | https://www.cnil.fr/en | official GDPR guidelines + GDPR toolkit (RoPA/DPIA/BCR) |
| DORA-2022-2554 | EU | **open-document** | **yes** | https://eur-lex.europa.eu/eli/reg/2022/2554/oj | ICT risk mgmt, incident reporting, resilience testing, 3rd-party risk (EU financial entities only) |
| OWASP-ASI-2026 | OWASP | **open-document** | **yes** | https://genai.owasp.org/ (Top 10 for Agentic Applications, 2025-12-09) | ASI01–ASI10 |
| ISO27001-2022 | ISO/IEC | **metadata-only** (text paywalled, NOT read) | **no** | https://www.iso.org/standard/27001 | ed.3 2022-10-25 — **clause text NOT consulted** |
| ISO42001-2023 | ISO/IEC | **metadata-only** (text paywalled, NOT read) | **no** | https://www.iso.org/standard/42001 | AIMS, Dec 2023, Annex A 38 controls/9 objectives — **text NOT consulted** |

## Legal FREE access to ISO text (verified routes; none used yet)
- **AFNOR Norm'Info sponsored free consultation** of **NF EN ISO/IEC 27001** — a legal, **read-only** consultation
  **sponsored by ANS (Agence du Numérique en Santé)**: https://norminfo.afnor.org/consultation/nf-en-isoiec-27001/...
  **Eligibility + exact terms must be verified before relying on it**; it is read-only (no reproduction/redistribution).
- University / research / consular (CCI) library access, and on-site consultation, exist in France but
  **require a human account/eligibility** — a prepared request is below. **Not asserted as available until verified.**
- Full ISO text otherwise = **purchase only** (AFNOR boutique). No pirated copy, no paywall bypass.

## Crosswalk (requirement → risk → control → evidence → owner → test → review)
Only rows whose source was consulted carry a concrete clause/principle. ISO rows are **principle-level only** (text not
read) and reference the free-consultation route for later confirmation.

| capability area | obligation/principle (source, access) | risk | ODG control (where proven) | evidence | owner | review |
|---|---|---|---|---|---|---|
| Governance of AI risk | NIST AI RMF Govern/Map/Measure/Manage (full-text) | unmanaged AI risk | third-party-agent-gate OWASP ASI mapping; excellence-policy | gated suites | AI-Lead | 2027-01 |
| AI system mgmt | ISO/IEC 42001 AIMS (**metadata-only — text not read**) | missing AIMS | regulatory-assurance ISO42001 module (principle-level) | dossier findings | AI-Lead | AFNOR consult |
| ISMS | ISO/IEC 27001 risk-based ISMS (**metadata-only — text not read**) | no ISMS | regulatory-assurance ISO27001 module (principle-level) | dossier findings | CISO | AFNOR consult |
| Cyber baseline | ANSSI hygiène 42 measures (full-text) | weak baseline | bash-command-governor, action-gate, scope-observer | gated suites | CISO | 2027-02 |
| GenAI security | ANSSI-PA-102 (full-text) + OWASP ASI (open) | agent misuse/goal-hijack | agent-governance stack (identity→gate→exec→verify) | gated suites 91/… | AI-Lead | 2027-06 |
| Data protection | GDPR RoPA/lawful-basis/DPIA/breach (open) | unlawful processing | regulatory-assurance GDPR module | dossier findings | DPO | 2027-01 |
| Cyber framework | NIST CSF 2.0 Govern/Identify/Protect/Detect/Respond/Recover (full-text) | coverage gaps | mapped to ODG controls above | crosswalk | CISO | 2027-02 |
| Financial ICT resilience | DORA (open) — **EU financial entities only** | ICT disruption | regulatory-assurance DORA module (applicability-gated) | dossier findings | CISO | 2027-01 |

## Not verifiable without the paid/sponsored text (precise need, not assumed)
- **Exact ISO/IEC 27001:2022 Annex A control IDs + wording** and **ISO/IEC 42001:2023 Annex A control text** — needed
  to assert clause-level conformance (vs principle-level). **Decision requiring the full text:** certifying a
  dossier's control-by-control mapping to the *exact* ISO clause numbers. Until then ODG stays principle-level + cites
  the free AFNOR consultation route. **Cost to resolve for free:** AFNOR sponsored consultation (eligibility TBV) →
  else minimal purchase (ISO 27001:2022 ~CHF 124 / NF ~€/page). **Human decision only.**

## Prepared (NOT sent) human request for free ISO consultation
> Objet : accès en consultation (lecture seule) NF EN ISO/IEC 27001:2022 — dispositif de consultation gratuite
> Bonjour, dans le cadre d'une préparation interne à la sécurité de l'information, je souhaite consulter en lecture
> seule la norme **NF EN ISO/IEC 27001:2022** via votre dispositif de consultation gratuite (sponsorisée ANS) /
> consultation sur place. Merci de m'indiquer l'éligibilité et la marche à suivre. Références : NF EN ISO/IEC
> 27001:2022 (et, si disponible, NF ISO/IEC 42001:2023).

Destinataire officiel à confirmer (AFNOR / bibliothèque de recherche / CCI). **ODG n'envoie aucun message externe sans autorisation.**
