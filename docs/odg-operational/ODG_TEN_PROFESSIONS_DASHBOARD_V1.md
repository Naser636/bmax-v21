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
- **Wave 1 (merged):** **P3** CRA/SBOM demonstrator (`cra-evidence-demonstrator.ts`, 31 checks, PR#362) + **license-policy copyleft fix** (bare/deprecated SPDX under-classification, PR#363) + **P8** e-invoice conformance+governed-workflow demonstrator (`einvoice-workflow-demonstrator.ts`, 20 checks, PR#364). Each: full governed lot, independent adversarial validation ACCEPT (3/3 mutations), regression green (254→255).
- **Wave 2 (landing):** four demonstrators composing merged modules into one honest verdict each — **P1** modernization-safety-net (`modernization-safety-net-demonstrator.ts`, 16 checks; captureBaseline+compareToBaseline+charter), **P6** acceptance-evidence (`acceptance-evidence-demonstrator.ts`, 15; intake+evaluateCriteria+reality-gate+charter), **P2** governed-agent-action (`governed-agent-action-demonstrator.ts`, 21; agent-gate+charter+resistance), **P10** regulatory-evidence (`regulatory-evidence-demonstrator.ts`, 15; classifyRole+anti-overclaim+assertNotCertified+seal). tsc both=0, build OK, full regression **259/259 PASS**. Four independent validators: P1+P6 ACCEPT, P2+P10 ACCEPT-WITH-CONCERNS — all concerns reconciled (P2 test now pins the sealed charter label; P1 "tamper" case honestly relabelled; the imprecise "PURE" docstrings corrected to disclose the git-HEAD provenance read unless a revision is injected). **Follow-up lots recorded:** harden `regulatory-assurance.assertNotCertified` (narrow regex misses "achieved certification"/"compliant"/"conforms") and `characterization-baseline.canon` (circular-ref RangeError) — both inherited from merged primitives, demonstrators delegate faithfully. **Métier levels now:** P1/P2/P3/P6 solid R3 (integrated demonstrator + independent validation); P8/P10 R3 on the demonstrated slice; P4/P7/P9 + P5-slice remain for Wave 3.
- **Note (honesty):** any demonstrator that seals via charter-record/evidence-provenance (P1,P3,P6,P2,P10) is pure compute except the seal, which reads git HEAD for provenance unless a `revision` is injected (fail-closed, cached, never network). Documented, not hidden.

## Acceptance (dashboard)
Per-métier start/current/target/demonstrator/blockers/next captured ✓ · maturity ladder + no-auto-levelup + R4/R5-owner-gated stated ✓ · departure snapshot verified against live git/register ✓ · work doctrine A–K recorded ✓ · updated each wave ✓. Closure requires maturity criteria met + sufficient evidence + honest remaining-blocker declaration — NOT merely "ten demonstrators exist".
