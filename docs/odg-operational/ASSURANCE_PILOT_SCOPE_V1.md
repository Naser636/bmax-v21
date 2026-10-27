# ODG — Deliverable pilot scope for offers A & C (V1, 2026-10-27)

Mission-3 capacity assessment: what ODG can **really** deliver for a pilot, grounded in gated evidence vs mechanism-only
vs test-only. **No claim of a performed client audit, a certification, absolute security, or a proven commercial result.**
**0 client engagements delivered to date.** Deliverables are produced from CLIENT-SUPPLIED artifacts; running anything on
a client system needs their access + authorisation (not in this lot).

## Capability reality (honest)
| capability | state | evidence | usable in a pilot? |
|---|---|---|---|
| Multi-ecosystem SBOM (8 ecosystems) | **EXECUTABLE, gated** | `multi-ecosystem SBOM` (supply-chain-attest) | YES on client-supplied repo/manifests |
| Evidence provenance (sha256/sealing) | **EXECUTABLE, gated** | `evidence-provenance` | YES |
| Tamper-evident audit log | **EXECUTABLE, gated** | `audit-log` hash-chain | YES (evidence integrity) |
| Test/build/recovery assurance | **EXECUTABLE, gated** | gated suites, `build-recovery-engine` | YES on client-supplied code |
| License/SPDX classification | **EXECUTABLE, gated** | `license-policy` (fail-closed) | YES |
| AI-Act role + Art.50 mapping | **EXECUTABLE, gated** (principle-level) | `ai-act-role-classifier`, `regulatory-assurance` | YES (readiness, not legal opinion) |
| Agent-security review (OWASP ASI) | **MECHANISM, principle-level** | `third-party-agent-gate` | partial — review, not a pentest |
| Production monitoring / KMS / off-host backup | **EXTERNAL** | — | NO (out of scope) |
| Running tools on a client's live/prod system | **NOT without authorisation** | — | NO this lot |

## Offer A — Technical audit pilot (fixed scope)
- **Deliverable:** audit report on a client-supplied repo — dependency health + SBOM, license conflicts, test-coverage &
  CI/release fragility, prioritised remediation plan with evidence pointers.
- **Acceptance criteria (measurable):** SBOM produced for all detected ecosystems; every finding has a severity + a
  concrete remediation + an evidence reference; plan ranked by risk.
- **Exclusions:** implementing fixes; running on live/prod; legal opinion; pentest of running systems; certification.
- **Direct cost:** ~€0 tooling (OSS/own). **Human effort:** scoping + review + readout (the audit itself is largely
  automatable on supplied artifacts). **Risks:** repo access/authorisation; scope creep; findings reflect supplied code.
- **Price (HYP, market-consistent):** €3–8k (vs verified code-audit €4–12k).

## Offer C — Technical assurance pilot (fixed scope)
- **Deliverable:** assurance/evidence pack — SBOM + provenance-sealed evidence + dependency/supply-chain report +
  test-traceability + an **AI-Act Art.50 / CRA-SBOM readiness** mapping (readiness, not compliance attestation).
- **Acceptance criteria:** provenance-sealed SBOM covering top-level dependencies (CRA-aligned); each assurance claim
  cites a verifiable artifact; gaps classified SATISFIED/PARTIAL/EXTERNAL/NOT-VERIFIED (no false satisfaction).
- **Exclusions:** certification (accredited CB only); guaranteeing audit/questionnaire pass; absolute security; legal
  compliance determination; production controls (EXTERNAL).
- **Direct cost:** ~€0 tooling. **Human effort:** scoping + evidence assembly + readout. **Risks:** client artifacts
  completeness; CRA/AI-Act dates to confirm vs EUR-Lex; buyer may require certification ODG cannot issue.
- **Price (HYP):** €5–15k one-off + €1–2k/mo recurring assurance (market-consistent; EuroAIGuard €490–2,290/mo anchor).

## CRA/SBOM alignment (honest capability→trigger match)
ODG's **proven multi-ecosystem SBOM** directly produces the artifact the EU CRA will require in technical documentation
(top-level dependencies, kept current). **ODG prepares this evidence; CRA compliance remains the client's legal
responsibility** — ODG does not certify or guarantee compliance.

## Human-effort map (reduce where safe)
Automatable now (no contact): research, SBOM/provenance/test runs on supplied artifacts, scoring, proposal generation
(`proposal-generator`), pipeline tracking (`commercial-pipeline`), margin calc (`revenue-scenarios`), reporting.
**Human-required:** scoping call, readout, send/sign (human-gated in code), and any contact — all out of this lot.
