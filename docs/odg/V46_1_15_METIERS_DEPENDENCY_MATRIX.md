# V46.1 — 15-métiers dependency matrix (proven from code)

> Read-only audit. **R**=REQUIRED (direct `require` import) · **U**=USED (transitive closure) · **·**=NOT_APPLICABLE (no demonstrated dependency) · **M**=MISSING. Every R is self-verified (coherence pass). Scope = representative entry-point module(s) per métier.

## Matrix (métier × active shared component)
| Métier | excellence-policy | evidence-provenance | audit-log | repair-workflow | code-execution | regulatory-assurance | economic-unit | einvoice-parser |
|---|---|---|---|---|---|---|---|---|
| P1 | · | · | · | R | R | · | · | · |
| P2 | · | · | · | · | · | · | · | · |
| P3 | · | · | · | · | · | · | · | · |
| P4 | · | · | · | · | · | · | · | · |
| P5 | · | · | · | · | · | · | · | · |
| P6 | · | · | · | · | · | · | · | · |
| P7 | · | · | · | · | · | · | · | · |
| P8 | · | · | · | · | · | · | U | R |
| P9 | · | · | · | · | · | · | · | · |
| P10 | R | R | · | · | · | U | · | · |
| P11 | · | · | U | · | · | · | R | R |
| P12 | · | · | · | · | · | · | · | · |
| P13 | · | · | · | · | · | · | · | · |
| P14 | · | R | · | · | · | · | · | · |
| P15 | · | · | · | · | · | · | · | · |

**Coherence:** 8 REQUIRED relations checked, 0 failures ⇒ pass=True.

## Proven cross-métier reuses (edges)
- P1 --REQUIRES--> repair-workflow
- P1 --REQUIRES--> code-execution
- P8 --COMPOSES_WITH--> economic-unit
- P8 --REQUIRES--> einvoice-parser
- P10 --REQUIRES--> excellence-policy
- P10 --REQUIRES--> evidence-provenance
- P10 --COMPOSES_WITH--> regulatory-assurance
- P11 --COMPOSES_WITH--> audit-log
- P11 --REQUIRES--> economic-unit
- P11 --REQUIRES--> einvoice-parser
- P14 --REQUIRES--> evidence-provenance

## Primitives audit
- ALLOCATOR: **MISSING** — no single canonical allocator module found in runtime/core; allocation logic is dispersed (e.g. economic/budget) — flagged as a primitive gap, not fabricated.
- Other primitives map to representative modules (IDENTITY=agent-identity, STATE=state-transition, CONTRACT=api-contract, POLICY=excellence-policy, RESOLVER=coding-mission-resolver, EXECUTOR=capability-executors, EVIDENCE=evidence-provenance, RECOVERY=build-recovery-engine).

## Honest finding
- ODG's métier **leaf** modules are **highly self-contained** (many import 0 internal modules: eval-metrics, license-policy, cost-engine, latency-measure, metier-coordinator). Component-level cross-métier reuse at the leaf is **LOW** — the common base is **conventions/patterns** (PURE, fail-closed, dual-export, shared test harness), NOT shared component imports.
- Genuine proven reuses exist and are few: **P10→P3** (ai-assurance-assessment imports sbom-audit-service), shared **economic-unit** (money), intra-P3 (sbom→supply-chain-attest+license-policy).
- **Do NOT conclude the architecture is component-mutualized from shared primitives alone** — at the component level it is largely decoupled (good for isolation, an opportunity for a shared report/evidence layer).
