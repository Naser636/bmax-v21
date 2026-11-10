# V49 — Global excellence benchmark (world-class methods → ODG)

> CTO V49. Research/documentation only. **FACT** = publicly-documented framework (canonical source named); **INTERP** = CTO interpretation/recommendation. Not a presentation of companies — the *mechanisms* and their ODG mapping. Full data: `V49_GLOBAL_ORGANIZATIONS_METHODS.json`.

## Methods studied (mechanism → ODG mapping → status)
| Org | Method (FACT: source) | ODG mapping | Reuse status |
|---|---|---|---|
| NASA | IV&V + Systems Eng Handbook SP-2016-6105 + phase-gate reviews | evaluator-independence + gates-ledger + mission-contract | EXISTS_PARTIAL |
| NASA/DoD | Technology Readiness Levels (TRL 1-9) | E0-E5 / L0-L5 maturity ladder (capability-map) | EXISTS_VERIFIED (analog) |
| SpaceX | rapid iterate / test-to-failure / adversarial | adversarial verify + loop-until-dry + fail-closed | EXISTS_PARTIAL |
| Airbus/Boeing | config mgmt, traceability, safety cases (DO-178C/ARP4754) | evidence-provenance + closure-register + traceability-matrix | EXISTS_PARTIAL |
| Toyota | Lean/TPS: andon, jidoka, kaizen, 5-whys, poka-yoke | emergency-stop + rce-root-cause + fail-closed + self-improvement | EXISTS_PARTIAL (strong) |
| DeepMind | rigorous eval, held-out, ablations, reproducibility | eval-metrics + k-eval + benchmark-factory + eval-significance | EXISTS_PARTIAL |
| Microsoft | Security Development Lifecycle, threat modeling | bash-governor + third-party-agent-gate + lethal-trifecta | EXISTS_PARTIAL |
| Amazon | Well-Architected op-excellence, blameless COE, DORA | dora-metrics + incident-recurrence + pipeline-forecast | EXISTS_PARTIAL |
| NVIDIA | AI infra / GPU / inference optimization | local-model-generator (CPU only) | **MISSING_CONFIRMED (not ODG play)** |
| Tesla | HW-SW integration, data flywheel, OTA | learning-loop (flywheel analog); HW n/a | EXISTS_PARTIAL / NOT_APPLICABLE |
| NIST | RMF SP 800-37, CSF, SSDF SP 800-218 | regulatory-assurance + supply-chain-attest + sbom | EXISTS_PARTIAL |
| ENISA/ISO | ISO 9001/27001/42001, CRA | regulatory-assurance + iso-clause-matrix + license-policy | EXISTS_PARTIAL — NOT_CERTIFIED |
| NATO/Defense | interoperability, C2, lessons-learned, capability mgmt | capability-map + failures-register + orchestration | EXISTS_PARTIAL |
| Siemens | industrial automation, digital twin | world-model + campaign-controller | EXISTS_PARTIAL |
| Maersk/Leclerc | supply-chain visibility, logistics/flow | supply-chain-attest/SBOM (software); physical n/a | EXISTS_PARTIAL / NOT_APPLICABLE |
| Scientific orgs | reproducibility, independent validation, pre-registration | frontier-lab + evaluator-independence + memory-taxonomy | EXISTS_PARTIAL (strong) |

## Headline (FACT + INTERP)
- **ODG already embodies the PRINCIPLES of the world-class methods at L2-L3** — independent V&V (NASA), stop-the-line (Toyota andon), root-cause (5-whys), provenance/safety-cases (Airbus/SLSA), eval rigor (DeepMind), RMF/SSDF (NIST), TRL maturity. This is a genuine strength, verifiable in code.
- **Only ONE method is MISSING_CONFIRMED: NVIDIA GPU-infra** — and it is *not an ODG play* (no GPUs; P13 ranked last in V47.1). Physical HW/logistics (Tesla HW, Maersk/Leclerc physical) are NOT_APPLICABLE.
- **No world method justifies a NEW primitive or a parallel architecture.** The value is in HARDENING existing components, not accumulating company-inspired modules.
