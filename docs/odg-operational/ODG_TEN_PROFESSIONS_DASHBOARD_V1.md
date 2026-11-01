# ODG Ten Professions — Canonical Progress Dashboard (V1)

**CTO Master Campaign V3.** Living per-métier dashboard. Baseline = V2 @ `687fe5b`. Updated each wave. **Maturity ladder (V3 §8):** R0 not-demonstrated · R1 foundations present · R2 functional components + reproducible tests · R3 integrated demonstrator verified on controlled test data · R4 broadened independent validation + reproducible benchmarks + representative-condition use · R5 externally-credible excellence + operational reliability + serious competitive comparison. **No automatic level-up; no self-certification; no Top-1 claim without credible independent comparison. R4/R5 are owner-gated (need authorized external inputs). Current honest autonomous ceiling = solid R3.**

## Departure snapshot (audit 2026-11-01, verified)
main @ `687fe5b` == origin/main (0 ahead/behind); 0 open PRs; working tree clean; register **178 [162 ACC/9 BL/3 IP/4 DEF] 0 stale**; 5 stashes + 6 foreign untracked preserved; 9 primitives frozen. OG-01..OG-08 re-confirmed still-blocked by real external dependencies (none self-clearable).

## Per-métier board
Legend: **Start→Current→Target**. Target is the autonomous ceiling (solid R3); R4/R5 noted as owner-gated.
| M | Profession | Start | Current | Target (auton.) | Integrated demonstrator | Key blockers (R4+) | Next action |
|---|---|---|---|---|---|---|---|
| P1 | Software/Full-Stack | R3 | R3 | R3 solid | modernization-safety-net (G-01+provenance+patch-executor) | external legacy case (OG) | harden demonstrator + adversarial/perf tests |
| P2 | AI/ML/Agentic | R3 | R3 | R3 solid | governed-agent-action (agent-gate+G-02+G-07) | live agent + labelled adversarial set (OG-03) | integrated demonstrator + adversarial tests |
| P3 | Cybersecurity/CRA | R3 | R3 | R3 solid | **cra-evidence (sbom+license+attest+G-05+G-08)** ← building | external vendor SBOM case (OG) | **WAVE-1 lot (in progress)** |
| P4 | Data Engineering | R2–R3 | R2–R3 | R3 solid | dataset-quality-gate (G-04+service) | independent labelled dataset (OG-03) | integrated demonstrator + SARIF fwd |
| P5 | Cloud/Platform (IDP) | R1 | R1 | R2 evidence-slice | golden-path evidence-emitter (G-05 slice) | **IDP product scope (OG-08)** — no IDP | evidence-emitter slice only; honest R1 |
| P6 | Quality/Testing | R3 | R3 | R3 solid | evidence-gated-acceptance (G-03+reality-gate+MA+k-eval+G-07) | external test corpus (OG) | integrated demonstrator + adversarial |
| P7 | SRE/Performance | R2–R3 | R2–R3 | R3 solid | reliability+DORA (slo-*+G-06+incident-recurrence) | provenanced telemetry baseline (OG-02) | integrated demonstrator (synthetic runs) |
| P8 | API/e-invoice | R2–R3 | R2–R3 | R3 solid | einvoice-conformance+governed-workflow | live PDP connector (OG-05) | **WAVE-1 lot** |
| P9 | FinOps | R2–R3 | R2–R3 | R3 solid | prove-the-number (economic-*+ALLOCATOR) | cloud billing data (OG-06) | integrated demonstrator (synthetic usage) |
| P10 | EU Regulatory/Assurance | R2–R3 | R2–R3 | R3 solid | regulatory-evidence-pack (role-classifier+iso-*+G-08) | external audit engagement (OG-07) | integrated demonstrator (NOT_CERTIFIED) |

## V3 work doctrine (per métier: A–K, §6)
Each métier runs the same loop: establish real level + evidence (A) → gaps technical/arch (B) → gaps security/reliability (C) → compare to best references (D) → define improvements (E) → build missing components (F) → build/improve demonstrator (G) → test perf/errors/limits/adversarial (H) → independent verification (I) → evidence + docs (J) → external-validation/commercial-qualification prep where possible (K). **No métier idle; interdependent work respects technical order; never ten incompatible concurrent implementations.**

## Wave log
- **Wave 0:** departure audit + dashboard + ten work-queues established. Baseline regression **253/253 PASS @687fe5b** (confirmed).
- **Wave 1 (in progress):** P3 CRA/SBOM integrated demonstrator (`runtime/core/cra-evidence-demonstrator.ts` + .test, 31 focused checks) — composes sbom-audit-service + compliance-evidence-pack + golden-path-evidence-bundle + evidence-pack-export into ONE honest verdict (ciGate + policyClean/needsReview + bundleAttested + OSCAL-interop export; fail-closed; never CONFORMANT/CERT). tsc both = 0, build:runtime OK, full regression **254/254 PASS**. Independent adversarial validation in progress. Next: P8 e-invoice demonstrator, then P2/P6/P1/P10, then P4/P7/P9 + P5 slice.

## Acceptance (dashboard)
Per-métier start/current/target/demonstrator/blockers/next captured ✓ · maturity ladder + no-auto-levelup + R4/R5-owner-gated stated ✓ · departure snapshot verified against live git/register ✓ · work doctrine A–K recorded ✓ · updated each wave ✓. Closure requires maturity criteria met + sufficient evidence + honest remaining-blocker declaration — NOT merely "ten demonstrators exist".
