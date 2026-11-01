# ODG Capability-Gap Register (Wave 4, CTO Master Unified Mandate) — V1

**Date 2026-11-01.** Consolidates every capability gap surfaced by the 11 Wave-2 market dossiers + 11 Wave-3 expert syntheses into one prioritized register. Each gap is classified by **buildability** and ranked. **Honesty invariants preserved:** no new permanent primitive; no fabrication; mechanism ≠ satisfied ≠ certified; ODG's non-goals (platform/APM/iPaaS/certifier/live-connectors/CVE-scanning) are recorded as deliberate NON_GOALs, not gaps to close.

## Classification key
- **BUILD_NOW** — authorized, locally-verifiable, bounded, maps to existing modules, no owner gate, no new primitive. Eligible for Wave-4 governed implementation.
- **OWNER_GATED** — needs a privileged/external/paid/credential/dataset action only the owner can supply (tracked in `OWNER_GATE_EXECUTION_PLAN.md`).
- **NON_GOAL** — deliberately out of scope (building it would contradict ODG's honest positioning); recorded so no one mistakes it for a gap.

## Priority rubric (BUILD_NOW items)
P = f(customer-problem severity × market-evidence × cross-domain reuse × security/reliability impact) ÷ (implementation risk). Ranked P1 (highest) → P3.

---

## A. BUILD_NOW gaps (authorized, in-scope, locally-verifiable)

| ID | Domain(s) | Gap | Maps to (existing modules) | Reuse | Priority |
|---|---|---|---|---|---|
| G-01 | D01 (+D05) | **Characterization-baseline-before-edit** is a *pattern*, not a first-class step. Capture a behavioral baseline (Feathers) before a legacy edit so refactors are provably behavior-preserving. | `code-execution` + `patch-executor` + `reality-gate` | D05 reality-gate | **P1** — the single highest-value lever for D01's legacy-modernization half; bounded; directly testable |
| G-02 | D05 (+D01,D09) | **Charter-record on every verdict** (Bach SBTM + provenance): attach a machine-readable {what-probed / how / against-which-ground-truth} record to each reality-gate / mechanical-acceptance decision. | `reality-gate` + `mechanical-acceptance` + `evidence-provenance` | composes evidence-provenance | **P2** — raises evidence quality campaign-wide; additive |
| G-03 | D05 | **Executable-spec intake adapter** (Adzic): accept a client's Gherkin/executable acceptance criteria → feed as `acceptanceCriteria[]` facts into mechanical-acceptance. | `mechanical-acceptance` | — | **P2** — monetizes the "evaluation-integrity audit" offer; bounded |
| G-04 | D04 | **Named/enumerable assertion types + SARIF export** for dataset-quality findings (dbt-style taxonomy; Moses dimension vocabulary as schema-declared *optional* extensions marked NOT_YET_IMPLEMENTED). | `dataset-quality-service` | D03 SARIF-emit pattern | **P2** |
| G-05 | D06 (+D03) | **Per-run golden-path evidence bundle** (SBOM + provenance + confinement attestation + odg-health snapshot) as a first-class artifact of a governed build reference. | O2 `sbom-audit-service` + `evidence-provenance` + `odg-health` | O2 | **P2** — cross-domain (D03/D06/D09) |
| G-06 | D07 | **Per-mission DORA four-key read-model** (Forsgren): campaign-controller already has raw signals (attempt-log, latency, recovery) but no denominator-explicit four-key report (honest `null` where unobservable). | `campaign-metrics` + `slo-collector` | — | **P3** — observability polish; survivorship-guarded |
| G-07 | D02/D05 | **Adversarial "misleading-case" corpus expansion** (Hendrickson/Bach): grow the misleading/negative-control ratio in k-eval/broad-it-eval to harden false-success resistance. | `k-eval` + `broad-it-eval` | — | **P3** — strengthens the integrity headline metric |
| G-08 | D09 | **Machine-readable evidence export** (OSCAL-interop *shape*, not OSCAL-native): emit the compliance-evidence-pack in a documented stable schema so an external OSCAL/GRC tool can consume it. | `compliance-evidence-pack` | — | **P3** — interop; honest "not OSCAL-native" caveat |

## B. OWNER_GATED gaps (prepared; exact human action recorded)

| ID | Domain(s) | Gap | Required owner action |
|---|---|---|---|
| OG-01 | D02/D03/D07/D09 (all evidence writers) | **Keyed-HMAC authenticity** for evidence (audit-log/evidence-provenance/mission-ledger are keyless tamper-evident; keyed variant designed, not provisioned). | Provision `ODG_AUDIT_HMAC_KEY` (secret) |
| OG-02 | D03 | **CVE/vulnerability scanning** (NVD/OSV feed) — the core SCA feature ODG declares it does NOT perform. | Decision + paid/managed feed; new engineering scope (owner-authorized) |
| OG-03 | D04/D05 | **Independently-labelled broad-IT eval dataset** (broad-it-eval returns NO_DATA until admitted). | Supply/authorize a third-party-labelled corpus (independent-label-policy admits) |
| OG-04 | D06/D07 | **Private-VPS mutation / durable self-wake** (systemd/sudo/deploy) + production front-door smoke. | Owner VPS privileged action |
| OG-05 | D08/D09 | **Accredited certification pathway** (ISO 27001/42001/CRA) — ODG prepares evidence, is NOT a certifier. | Engage an accredited body (AFNOR/COFRAC n°4-0001 etc.) — external/paid |
| OG-06 | D01 | **`hadolint` toolchain** (new-language-families BLOCKED; honest UNSUPPORTED today). | Install the binary in the build env |
| OG-07 | D09 | **Engineering-side expert additions** (NIST OSCAL/Iorga + policy-as-code leads) to rebalance the D09 roster law↔engineering. | CTO confirm roster expansion + per-person primary evidence |
| OG-08 | D10/D11 | **Real billing provider / certified fiscal transmission (PDP/Peppol)** — ISO 27001 mandatory for Peppol SPs from 2027-07-01. | Owner commercial/legal + paid provider |

## C. NON_GOAL (deliberate; recorded so they are not mistaken for gaps)
- D06: an **IDP product** (portal/catalog/plugin ecosystem, K8s control plane) — O8 is SPEC-ONLY; ODG supplies advisory/spec/evidence only.
- D07: a **production observability/APM** (telemetry ingestion, agents/SDKs, dashboards over customer prod, alerting/on-call/paging).
- D04: an **ETL/pipeline/warehouse/catalog** product; D10: a **FinOps cloud-cost platform** (CUR/FOCUS ingestion, optimizer); D11: a **general iPaaS**.
- D03: **SAST/DAST/fuzzing** offensive tooling; D08/D09: issuing **certificates / accredited assurance opinions**.
- Any **public deployment / external client contact / paid action** this phase.
Rationale: each contradicts ODG's honest market position (complement/evidence/assurance, not platform/certifier). Building them would be the over-claim ODG's whole doctrine refuses.

## D. Wave-4 execution plan (BUILD_NOW only; governed)
Sequence by priority, each as a bounded governed lot (WORK_ITEM_CONTRACT → reproduce → implement in a confined write-set → focused tests + full regression → independent validator (separate context) → PR → CI → merge). **No new primitive; real tests for changed behavior; no owner-gated work.**
1. **G-01 characterization-baseline-before-edit** (P1) — the flagship Wave-4 build.
2. G-02 charter-record, G-03 executable-spec intake, G-04 named-assertions+SARIF, G-05 golden-path evidence bundle (P2).
3. G-06 DORA read-model, G-07 misleading-case expansion, G-08 machine-readable evidence export (P3).
Each domain retains its own acceptance criteria (W5 dossiers will record R0–R3). No domain advances to R4/R5 without the evidence R4/R5 require (owner-gated external validation).

## E. Provenance
Gaps sourced verbatim from the "Capability gaps" sections of: MARKET_DOSSIER_D01..D11_V1.md and EXPERT_SYNTHESIS_D01..D11_V1.md (all merged, main @ 57aa5af). No gap invented; NON_GOALs quoted from each domain's own honest-boundary statement. This register is the Wave-4 input and the Wave-5/6/7 gap-tracking SSOT; owner-gated items cross-reference OWNER_GATE_EXECUTION_PLAN.md.

## F. CTO Master Campaign V2 — owner-gated frontier (2026-11-01, additive; OG-01..OG-08 UNCHANGED)
The eleven→ten consolidation (crosswalk + `ODG_TEN_BENCHMARKS_V1.md`) re-confirms every profession's R4+ raise is owner-gated — none flipped. OG-01 keyed evidence authenticity (`ODG_AUDIT_HMAC_KEY`) · OG-02 provenanced reliability baseline (P7 DORA keys null) · OG-03 independent labelled dataset (P4 fairness / P6 broad-IT NO_DATA) · OG-04 named private buyer / qualification (no autonomous external contact; gates every POC-OWN→QUALIFIED→WON) · OG-05 live PDP/e-invoice connectivity (P8) · OG-06 cloud billing ingestion (P9) · OG-07 external audit/assurance engagement — evidence not certification (P10) · OG-08 IDP product scope (P5 R1→R2+). Recording, not working around. `eleven-profession-program-definition` remains BLOCKED. ODG does not generate credentials or use a certification body's name as endorsement.
