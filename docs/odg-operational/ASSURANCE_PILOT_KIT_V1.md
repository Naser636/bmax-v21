# ODG — Reproducible pilot kit for offers A & C (V1, 2026-10-27)

A reproducible internal pilot runbook using **synthetic or already-authorised data only**. **No client, no client result,
no real engagement is invented; 0 client engagements delivered.** No execution on any external system, no client-data
collection, no deployment. Complements `ASSURANCE_PILOT_SCOPE_V1` (scope) with a concrete run recipe + sample report +
acceptance checklist.

## Capability path (what actually runs — all gated, local, synthetic input)
| step | mechanism (gated) | executable now? | human step |
|---|---|---|---|
| Inventory dependencies + SBOM (8 ecosystems) | `multi-ecosystem SBOM` (supply-chain-attest) | YES on a supplied/synthetic repo | scope the repo |
| License/SPDX classification (fail-closed) | `license-policy` | YES | review flags |
| Evidence provenance (sha256 seal) | `evidence-provenance` | YES | — |
| Tamper-evident log of the run | `audit-log` hash-chain | YES | — |
| Test / build / recovery assurance | gated suites, `build-recovery-engine` | YES on supplied code | interpret |
| AI-Act role + Art.50 mapping (principle) | `ai-act-role-classifier`, `regulatory-assurance` | YES (readiness) | confirm client activities |
| Agent-security review (OWASP ASI) | `third-party-agent-gate` (principle) | partial | manual review |
| Compile dossier + readout | (assembly) | assisted | writeup + call |

## Pilot runbook (synthetic data)
1. **Input prerequisites:** a repo/manifest set (synthetic fixture or client-supplied + authorised); declared AI
   activities (for role mapping). 2. **Run** SBOM → license → provenance-seal → test/build assurance → AI-Act mapping,
   logging each step to an audit chain. 3. **Assemble** the dossier (findings + evidence pointers + gap classification
   SATISFIED/PARTIAL/EXTERNAL/NOT-VERIFIED). 4. **Readout** (human) + deliver. 5. **Acceptance** per the checklist.
   6. **Pipeline:** record as PROPOSAL→…→DELIVERY_ACCEPTED via `commercial-pipeline` only on real evidence (nothing auto).

## Sample report skeleton (what the client receives)
- Scope + exclusions (no certification, no guarantee, no absolute security).
- SBOM (top-level dependencies, CRA-aligned) + license-conflict list.
- Dependency/supply-chain findings, severity + remediation + evidence ref.
- Test/build/reliability findings (Offer A) / assurance evidence pack (Offer C).
- AI-Act role + Art.50 readiness (principle-level; declared-not-verified where client-supplied).
- Gap register with status + owner + closure criterion. Provenance seal + audit-chain id.

## Acceptance checklist (testable)
- [ ] SBOM produced for every detected ecosystem. [ ] Every finding has severity + remediation + evidence pointer.
- [ ] Gaps classified (no false SATISFIED). [ ] Provenance seal verifies; audit chain verifies.
- [ ] Deliverable matches the agreed scope; exclusions stated. [ ] No certification/guarantee/absolute-security claim.

## Timing / effort / cost (observed, synthetic runs)
Tooling cost ~€0 (OSS/own). The automatable steps (SBOM/license/provenance/test/log) run in minutes on a fixture;
human effort concentrates in scoping, interpretation, and the readout. **Direct cost ~€0; main cost = human time.**

## Honesty
A green test suite ≠ a delivered client engagement. This kit proves ODG can **run the machinery on synthetic input and
produce the dossier shape**; it does NOT claim a performed client audit or a client outcome. Running on real client data
or systems requires their authorisation (out of scope here).
