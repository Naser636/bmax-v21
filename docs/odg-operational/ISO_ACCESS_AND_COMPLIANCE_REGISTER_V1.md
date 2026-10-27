# ODG — ISO legal-access & compliance register (V1, 2026-10-27)

Free-access routes to ISO/IEC 27001:2022 and 42001:2023 text, verified read-only, **nothing purchased**. Distinguishes
preview / free read-only / paid.

## Access routes
| Route | 27001:2022 | 42001:2023 | ACCESS |
|---|---|---|---|
| ISO OBP (iso.org/obp) | free preview: Foreword/Scope/Terms only; normative body PAID | same | read-only partial (free) |
| **AFNOR "Consultation libre" (ANS-sponsored, FR)** | **NF EN ISO/IEC 27001 (2023) + A1 (2024) FREE read-only full consultation** (ANS partial-free-access portal) | **none found** (only a public enquiry PR NF EN ISO/IEC 42001 closing 2026-01-14, comment-only) | **27001 = FREE read-only; 42001 = not available free** |
| Buy (iso.org) | CHF **155** | CHF **225** (bundle 27001+42001 ~CHF 340-380) | PAID, price public |

**Bottom line:** full normative clause text is paywalled **except** ISO/IEC **27001:2022 is readable free (read-only)**
via AFNOR's ANS-sponsored Consultation libre (France). **42001:2023 has no confirmed free full-text route** → either
await, or a CHF 225 purchase (CTO authorisation required — not purchased).

## What this unblocks
- **27001 clause-level mapping** can now be done at **€0** (read-only) → upgrade `iso-readiness` from principle-level to
  clause-referenced on a future lot (read-only consultation; no redistribution of the text).
- **42001 clause-level** remains EXTERNAL (purchase decision) — `iso-42001-readiness` stays principle-level, honestly.

## Compliance register scaffold (fill during a clause-level pass)
| Clause/control area | Requirement (principle-level now) | ODG evidence | Status | Gap → closure |
|---|---|---|---|---|
| ISMS context/leadership/risk | risk-driven ISMS + improvement | excellence-coverage/policy, regulatory-assurance | PARTIAL | clause-ref via free 27001 route |
| Access control / identity | authenticated least-privilege | agent-identity, governance-harness, third-party-agent-gate | SATISFIED(principle) | clause-ref |
| Logging / monitoring | tamper-evident logs | audit-log, mission-scheduler | SATISFIED(principle) | prod monitoring EXTERNAL |
| Change / secure dev | governed change, no false success | governance-kernel, mechanical-acceptance | SATISFIED(principle) | clause-ref |
| Incident / resilience | recover w/o data loss | checkpoint-engine, build-recovery-engine | SATISFIED(principle) | clause-ref |
| Crypto / key mgmt | key custody/rotation | — | EXTERNAL | KMS (prod/spend) |
| Backup | critical-store backup | client-store-backup (local) | PARTIAL_EXTERNAL | off-host (prod) |
| 42001 AIMS clauses | AI policy/risk/impact/lifecycle | iso-42001-readiness (principle) | PARTIAL | 42001 text (purchase) |

> **NOT_CERTIFIED.** ODG prepares; an accredited body certifies. No clause-by-clause verification claimed until the
> free 27001 read-only consultation is actually performed on a dedicated lot.

## Sources
iso.org/obp, iso.org/standard/27001 & /42001 (CHF prices, listing), boutique.afnor.org MSConsultation (ANS free
27001), norminfo.afnor.org (42001 enquiry). Accessed 2026-10-27; iso.org product pages 403 on direct fetch (prices from
store listing).
