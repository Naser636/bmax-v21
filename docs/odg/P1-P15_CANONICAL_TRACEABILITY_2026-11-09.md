# V12.4 — P1–P15 Canonical Inventory & Traceability Matrix (2026-11-09)

**CTO Continuation Master Program §1.** Canonical names are taken from the in-repo profession modules + V12.4 §43 —
**not invented.** Each row maps a métier to its real module(s), test, register evidence, and honest maturity. Nothing
here is declared commercially operational (that requires a verified demonstration — §4/§12).

## Canonical roster (names are authoritative, from `runtime/core/profession-p*-reference.ts` + V12.4 §43)

| # | Canonical métier | Primary module | Test | Register items | Honest status |
|---|---|---|---|---|---|
| **P1** | Software / Full-Stack | `profession-p1-fullstack-reference` | ✓ | 3 | E2/E3 proven (reference + adversarial) |
| **P2** | AI / ML / Agentic | `profession-p2-ai-reference` | ✓ | 5 | E2/E3 proven |
| **P3** | Security | `profession-p3-security-reference` | ✓ | 2 | E2/E3 proven; + security-control-plane |
| **P4** | Data (Engineering/Analytics) | `profession-p4-data-reference` | ✓ | 2 | E2/E3 proven |
| **P5** | Cloud / Platform / DevOps (IDP) | *(no reference module)* — `deployment-readiness`, `canary-decision-pack`, `deploy/` | via those | 1 | ALIGNED on the evidence/progressive-delivery slice; IDP product owner-gated |
| **P6** | Quality / AI-Evaluation | `profession-p6-eval-reference` | ✓ | 3 | E2/E3 proven; + eval-significance, benchmark-contamination |
| **P7** | SRE / Distributed / Performance | `profession-p7-sre-reference` | ✓ | 2 | E2/E3 proven (chaos/recovery) |
| **P8** | API, Integration & Business Software (incl. FR e-invoicing) | *(no reference module)* — `api-contract`, `einvoice*`, `commercial-*` | via those | 3 | API-contract + e-invoice covered; business-software product owner-gated |
| **P9** | FinOps (unit economics) | `profession-p9-finops-reference` | ✓ | 4 | built; OBSERVED/ESTIMATED/SIMULATED separation |
| **P10** | EU Regulatory / AI Assurance & Compliance | `profession-p10-regulatory-reference` | ✓ | 3 | E2/E3 proven; + regulatory-assurance, ai-act-in-force |
| **P11** | Document Processing / IDP | `profession-p11-document-reference` | ✓ | 3 | E2/E3 proven; + p11-document-routing |
| **P12** | Real-Time Streaming / Event-Driven | `profession-p12-streaming-reference` | ✓ | 8 | E2/E3 proven; + circuit-breaker, dead-letter, idempotency |
| **P13** | AI Infra / GPU | `profession-p13-aiinfra-reference` | ✓ | 3 | E2/E3 proven; + quantization-honesty, carbon-intensity |
| **P14** | DevEx golden-path | `profession-p14-devex-reference` | ✓ | 2 | E2/E3 proven |
| **P15** | Automation / Workflow | `profession-p15-workflow-reference` | ✓ | 3 | E2/E3 proven |

**Coverage:** 13/15 have a dedicated `profession-reference` module (E2 reference + E3 adversarial, all gate-tested);
**P5 and P8 are covered by capability modules** (deployment/progressive-delivery; API-contract/e-invoice) rather than a
reference module — recorded honestly, not as a gap in capability but as a difference in packaging.

## Honest maturity ceiling (no over-claim)

All 15 métiers are at **E2/E3 (reference + adversarial proof)** or ALIGNED. **None is at E5 (live paying client)** — that
is owner-gated (real client, billing, delivery). Per V12.4 and DEC discipline: a referenced capability is never declared
untested; a demonstrated capability is never declared production-ready; no métier is "commercially operational" without
a verified demonstration (§4/§12). The métier *internal business logic* is EXCLUDED from any rewrite (transversal scope).

## Transversal programs backing the métiers (all VALIDATED this session)

Engineering Intelligence (gate-instrumentation, validation-selector, verified-result-cache, flaky-replay-gate,
engineering-scheduler, targeted-verify, persistent-impact-graph, performance-observability) · Security control plane ·
Benchmark-contamination · Repair autonomy (repair-planner + self-test) · Architecture audit · Memory architecture ·
Capability map · Roadmap consolidation. See `master-technological-superiority-program.json` (28/28 VALIDATED).

## Next (this program, grounded + honest)

Per-métier realization fiches (§4), website audit (§2), opportunity ranking (§6) — all from real capabilities/repo data.
Market study (§5) + financial model (§7) are built as **sourced frameworks with labelled assumptions**: live external
market data is owner-gated (no internet; external research gated) — ODG will **not fabricate** market numbers, competitor
prices, or tender data; those cells stay explicitly "external-research-required" until the owner supplies sources.
