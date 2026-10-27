# ODG — ISO 27001 certification application dossier (V1, 2026-10-27)

What is **ready** vs **missing** for a certification application, mapped to `certification-readiness.ts`
(`MANDATORY_DOSSIER`). **Nothing fabricated** — missing items are marked MISSING, never invented. Current machine
verdict: **NOT_READY** (0/12 non-external controls SATISFIED; 0/10 dossier items present). An accredited audit is still
required; this is preparation, not certification.

## Dossier status
| Item | Status | Source / what's needed |
|---|---|---|
| ISMS scope statement | **MISSING** | CTO defines boundaries/sites/activities (template: ISMS policy) |
| Information-security policy (approved) | **DRAFT, NOT approved** | `ISO_27001_POLICY_TEMPLATES_V1` §1 → CTO approval |
| Risk assessment | **MISSING** | fill risk register with real risks (template §7) |
| Risk treatment plan | **MISSING** | after risk assessment |
| Statement of Applicability (SoA) | **SCAFFOLD only** | needs licensed/consulted 27001 text for completeness (AFNOR interactive) |
| Internal audit performed | **MISSING (EXECUTION)** | must be executed with records — not fabricated |
| Management review performed | **MISSING (EXECUTION)** | must be executed with records |
| Incident-response procedure | **DRAFT** | template §6 → approve + operate; incident register not fabricated |
| Backup + continuity | **PARTIAL** | local backup proven (`client-store-backup`); off-host = EXTERNAL (spec in `PRODUCTION_DEPENDENCIES_SPEC_V1`) |
| Corrective-action records | **MISSING (EXECUTION)** | arise from real incidents/audits |

## Code-evidenced mechanisms available to cite (not sufficient alone)
Identity/access (`agent-identity`, `agent-governance-harness`, `third-party-agent-gate`), tamper-evident logging
(`audit-log`), governed change (`governance-kernel`, `mechanical-acceptance`, `patch-executor-governance-guard`),
recovery (`build-recovery-engine`), evidence provenance (`evidence-provenance`). These are **MECHANISM_PRESENT**;
they become SATISFYING evidence only with approved policy + (for execution-type controls) operated records.

## Draft application message (BROUILLON — NON ENVOYÉ, no body contacted)
> Objet : Demande de devis — certification ISO/IEC 27001:2022
> Bonjour, [ENTITÉ `[À COMPLÉTER]`, SIREN `[À COMPLÉTER]`] souhaite un devis pour une certification ISO/IEC 27001:2022.
> Périmètre (ISMS) : `[À COMPLÉTER]`. Effectif : `[À COMPLÉTER]`. Sites : `[À COMPLÉTER]`. Nous préparons notre SMSI et
> souhaitons connaître votre accréditation COFRAC (portée 27001), le déroulé Stage 1/Stage 2, les délais et le coût
> (audit initial + surveillance). — `[NOM, COORDONNÉES]`
> **[LEGAL/CTO REVIEW REQUIRED before any send. Verify the CB's COFRAC 27001 scope first.]**

## Missing pieces = human/CTO acts (not autonomously closable)
Approve policies; define ISMS scope + risk appetite; **execute** internal audit + management review + any incident
handling (with records); complete the SoA (needs standard text); resolve EXTERNAL production controls for the real scope;
choose + scope-verify a CB. See `CTO_DECISION_PACK_V1.md`.
