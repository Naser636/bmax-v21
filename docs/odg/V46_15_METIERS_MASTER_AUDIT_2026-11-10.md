# V46 — 15-métiers master audit: capability, market, org & profitability — 2026-11-10

> CTO V46. Honest, evidence-grounded. Maturity ladder: **L0** absent · **L1** prototype · **L2** demonstrated locally · **L3** reproducible/validated · **L4** client-deliverable (packaged) · **L5** proven in client operation. **No level above the evidence.** All 15 métiers are kept. Module counts are **real** (grep of `runtime/core`). ODG = 463 core modules, 534 tests, 424 gate suites; self-assessment (`capability-map.ts`): register-ACCEPTED+evidence ⇒ L2, VALIDATED ⇒ L3. **0 paying clients ⇒ no métier is L5.**

## §3 — Capability matrix (15 métiers, honest L-levels)
| # | Métier | Real modules (count, examples) | Demonstrator | **L** | Gap to L4 | Mission to reach L4 |
|---|---|---|---|---|---|---|
| P1 | SW product / full-stack | 6 (native-project-builder, decomposition-planner, patch-executor, code-health) | native build (local models, V38-42) | **L2** | no client-facing deliverable | package a "code-health/repair audit" report |
| P2 | AI/ML/agentic | 25 (agent-factory, agent-governance-harness, third-party-agent-gate, intelligence-loop) | agent-gov gates | **L2** | crowded market, no demo artifact | package an "agent governance / eval" report |
| **P3** | Security / DevSecOps | 5 (sbom-audit-service, supply-chain-attest, license-policy, secret-rotation) | **CRA-SBOM demo (485 comp, PME report)** | **L3** | client-validated packaging | pilot on a named public repo + offer sheet |
| P4 | Data / DB | 10 (dataset-quality-*, drift, benchmark-contamination, dataset-pii) | dataset-quality-gate demo | **L2** | reproducible client report | package a "data-quality/PII readiness" report |
| P5 | Cloud / DevOps / platform | 7 (canary-decision-pack, deployment-readiness, developer-platform) | canary candidate | **L2** | no deploy-facing demo | package a "release/canary safety" check |
| P6 | Quality / test / eval | 9 (eval-metrics, targeted-verify, validation-engine, dataset-quality) | eval-metrics | **L2** | client report | package an "AI eval / test-coverage" report |
| P7 | SRE / perf | 8 (slo, latency-measure, incident-recurrence, circuit-breaker) | SLO guard | **L2** | client report | package an "SLO/latency readiness" report |
| P8 | API / integration | 18 (api-contract, einvoice-export/parser, integration-*) | e-invoice (shared w/ P11) | **L2** | demo artifact | package an "API-contract conformance" check |
| P9 | FinOps | 11 (cost-engine, cost-accounting, economic-*, unit-economics) | cost guard | **L2** | client report | package a "cloud-cost/unit-economics audit" |
| **P10** | AI-gov / regulatory | 25 (ai-assurance-*, iso-*, regulatory, compliance-evidence-pack, excellence-policy) | assurance/ISO matrices | **L2→L3** | packaged readiness pack | package an "AI-Act/ISO-42001 readiness" report |
| **P11** | IDP / knowledge | 9 (einvoice-validator/parser/export, document-pipeline, workflow-demonstrator) | **e-invoice demo (3 cases, PME report)** | **L3** | client-validated packaging | pilot on public Factur-X set + offer sheet |
| P12 | Streaming / event | 11 (event-stream-engine, integration-stream-reliability, saga) | stream reliability | **L2** | demo artifact | package a "streaming reliability" check |
| P13 | AI-infra / GPU / inference | 7 (inference-engine, local-model-generator/manager, integration-inference-cost) | **live local-model builds (V39-42)** | **L2→L3** | GPU/infra not owned | package a "local-inference cost/readiness" study |
| P14 | IDP / devex | 5 (developer-platform, golden-path-evidence, capability-map, scaffold) | golden-path evidence demo | **L2** | client report | package a "golden-path/DevEx audit" |
| P15 | Enterprise automation / agentic | 10 (campaign-controller, metier-coordinator, cognitive-workflow, saga) | metier-coordination | **L2** | client-facing workflow demo | package an "agentic workflow automation" pilot |

**Reading:** ODG has **real L2 capability across all 15 métiers** (not just P3/P11). **P3 and P11 are L3** (reproducible demonstrators + PME reports) and closest to L4 (need a client-validated pilot). P10 and P13 are L2-trending-L3. **None is L4+ until a packaged deliverable is validated with a buyer; none L5 (0 clients).** The fastest L2→L4 path is "wrap an existing demonstrated capability in a reproducible PME report + offer sheet" — ODG already did this for P3/P11.

## §7/§10 — Organization comparison (the €500k-net / <€1M-rev question)
Reproducible: `runtime/bin/odg-org-model.ts` → `docs/odg/V46_ORG_MODEL_OUTPUT.json` (sha256 `5e161f7c20371816`). **SALES throughput is the binding constraint** (ODG automates delivery ⇒ ~0.5 human-day/deal). All sales rates **SIMULATED (observed = 0)**.
| Org | New clients | Revenue | Opex | **NET** | net≥500k | rev<1M | **BOTH** |
|---|---|---|---|---|---|---|---|
| A owner+ODG only | 36 | €336k | €136k | €154k | ✗ | ✓ | ✗ |
| B +part-time MA senior | 54 | €504k | €170k | €255k | ✗ | ✓ | ✗ |
| **C +commercial** | **102** | **€948k** | €283k | **€503k** | **✓** | **✓** | **✓ (only org)** |
| D +commercial +specialists | 120 | €1.12M | €344k | €583k | ✓ | ✗ (>€1M) | ✗ |
| E scale | 168 | €1.56M | €451k | €835k | ✓ | ✗ | ✗ |

**Minimum viable org = Scenario C: owner + 1 part-time MA senior + 1 commercial** — the only one hitting both constraints (€948k revenue, €503k net, delivery feasible). A/B can't reach €500k net; D/E over-shoot €1M revenue. **The commercial is the pivotal role** (sales capacity, not delivery, is the cap). **Do NOT start with 3–10 salaried staff** (directive): C is 1 part-time + 1 commercial on top of owner+ODG.

## §8 — Automation dividend (why a 3-person org can deliver ~102 deals)
With ODG automating SBOM/validation/report generation, human time/deal drops from **~4 days (manual) to ~0.5 day** (review + client comms) — an **~8× delivery-capacity multiplier**. This is the reason delivery is never the constraint in Scenarios A–E; **sales is**. (Per-journey automation must still be verified end-to-end before claimed on a new métier.)

## §15 — Audit conclusions (honest)
1. **All 15 métiers are real L2**; P3/P11 are L3; none L4+/L5 (0 clients).
2. **€500k-net with <€1M-revenue IS achievable year-1 — only in Scenario C** (owner + part-time senior + 1 commercial, ~102 deals, €948k rev), thanks to the ODG automation dividend + ~35% recurring.
3. **The binding unknown is SALES conversion** (simulated; observed = 0). The commercial's real throughput and the funnel rates are **unproven**.
4. **Missing conditions (unchanged):** ≥1 reference client, an authorized acquisition channel + spend, validated prices (3 quotes), a BFR cash buffer (~€30–80k), permission to prospect, and the commercial hire (only when justified).
5. **Priority missions (L2→L4):** package reproducible PME reports + offer sheets for the next 3–4 métiers beyond P3/P11 (P10 AI-Act/ISO readiness, P9 cloud-cost audit, P6 AI-eval, P4 data-quality/PII) — each reuses existing modules (no 15 separate systems).
6. **Next concrete, authorized step:** obtain the first **conversion evidence** (a reference pilot on a named public repo) — not more modeling; everything financial now hinges on real demand proof.
