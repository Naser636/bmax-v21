# ODG — FRONTIER / V12.4 EXECUTION PREPARATION

> **Status:** PREPARATION artifact (not a strategy roadmap, not a closure claim).
> **Authority:** ODG. **Provider:** Claude Code (bounded). **Strategic reference:** V12.4 (unique).
> **Canonical place:** `docs/odg/` (alongside `closure-register.json`). **Operational use:** the single
> reference ODG consults to sequence the next Frontier/V12.4 missions. It does NOT replace
> `ODG_PROJECT_STATE.md` (compass), `runtime/governance/ROADMAP.json` (machine manifest), or the
> closure-register (status). Nothing here is fabricated; every claim is classified
> DEMONSTRATED / DOCUMENTED / PREPARED / PROPOSED / BLOCKED / NOT_RUN.
>
> **V12.4 §1–§122 matrix:** BLOCKED — the original V12.4 text is NOT_RECOVERABLE in-repo (exhaustive
> sweep: tracked+untracked, 24 archives, git `--all`+`-S`, 5 stashes, dangling objects). It cannot be
> reconstructed from this repository; it requires the owner to supply the original document. No section
> content is invented here.

Prepared 2026-11-08, after WI-FR-06. Local branch `excellence/v3-wave3-demonstrators-20261101`
@ `ddc4c0e` (6 Frontier lots committed locally, not pushed). origin/main = `25dcc1e`.

---

## 1. Verified state of WI-FR-01 … WI-FR-06 — DEMONSTRATED

All six lots verified by running their real test suites (odg-test-report **TOTAL 7 · PASS 7**), not by
re-reading prior reports. Local commits, no push.

| Lot | Commit | Module(s) | What it provides | Status |
|---|---|---|---|---|
| WI-FR-01 | `56602c3` | `frontier-radar.ts` | Radar foundation: registerSource (url via bounded-http-client allowlist) → normalize→sanitize(injection⇒QUARANTINE)→dedup→qualify→decide→candidate→gap→PROPOSED proposal. SIGNAL≠FACT. | DEMONSTRATED |
| WI-FR-02 | `9d3827d` | `frontier-radar-store.ts` | Durable persistence (autonomy-store keys) + idempotency-guard dedup + canonical integration: proposal⇒DEFERRED campaign-controller lot (only external advance→READY admits it). | DEMONSTRATED |
| WI-FR-03 | `f55ba6b` | `frontier-lab.ts` | Isolated experimentation: hypothesis/baseline/isolated-executor/measure/**independent verify**/evidence/decision. executor≠verifier; no self-promotion. | DEMONSTRATED |
| WI-FR-04 | `74fc4c9` | `evolution-loop.ts` | OBSERVE…PROMOTION_REVIEW…MEASURED + failure path STOP→ROLLBACK→REVALIDATE. Builder≠Tester≠Verifier≠Challenger≠ODG. MEASURED only via external authorized promotion. | DEMONSTRATED |
| WI-FR-05 | `46c9f27` | `frontier-sandbox.ts` | **REAL OS isolation** (bubblewrap via bash-command-governor + prlimit; `--info-fd` launch proof). Adversarial: host secret unreadable, no FS escape. Fail-closed; INJECTED never OS-proven. | DEMONSTRATED |
| WI-FR-06 | `ddc4c0e` | `frontier-pipeline.ts` + `runtime/bin/odg-frontier.ts` | Canonical chain RADAR→ODG→POLICY(action-gate)+external-authz→campaign-controller selection→LAB+EVOLUTION(real sandbox)→EVIDENCE(mission-evidence+provenance)→DECISION. Tested by **spawning the real binary**. | DEMONSTRATED |

**Preservation (re-verified):** 0 tracked-modified, 404 untracked, 5 stashes — untouched.

---

## 2. Architectural coherence — DEMONSTRATED (no duplication, 9 primitives)

Independent audit confirms the invariants hold:
- **One authorizer:** `action-gate.ts` (STATE→CONTRACT→POLICY→AUTHORITY, fail-closed). Other `*-gate.ts`
  are domain checks, not competing admission gates.
- **One evidence mechanism:** `evidence-provenance.ts` (`stampProvenance`/`verifyProvenance`); `mission-evidence`,
  `evidence-pack-export` are consumers.
- **One store pattern:** `autonomy-store.ts` (crash-atomic JSON KV); `frontier-radar-store` persists THROUGH it.
- **One mission scheduler:** `campaign-controller`/`mission-scheduler` (`campaign-loop` = continuity driver;
  `writeset-scheduler` = orthogonal write-safety layering, not a mission queue).
- **Exactly 9 primitives, no 10th:** `primitive-validation.ts` freezes IDENTITY/STATE/CONTRACT/POLICY/
  RESOLVER/EXECUTOR/EVIDENCE/RECOVERY/ALLOCATOR (ALLOCATOR additive vnext/Seam B). G0 = governance, not a primitive.
- **Frontier layer = pure orchestration:** every frontier-* header asserts "NO new sandbox/store/queue/scheduler/
  authorizer"; verified by composition. **No architectural duplication flagged.**

---

## 3. Dependency map + critical path

```
[DEMONSTRATED]  FR-01 ─ FR-02 ─ FR-03 ─ FR-04 ─ FR-05 ─ FR-06  (canonical chain, local commits)
                                                         │
                 ┌───────────────────────────────────────┼───────────────────────────────┐
                 ▼                                         ▼                               ▼
          FR-07 (Radar live)                        FR-08 (Compounding)            15-profession hardening
          wiring+extension                          compose upper-half             (per-profession, parallel)
                 │                                         │                               │
                 │ LOCAL part: buildable now               │ LOCAL: buildable now          │ LOCAL: buildable now
                 │ (invoke collect w/ injected fetcher,    │ (asset registry + transfer    │ (P5 deployment-readiness
                 │  cross-run dedup, source health)        │  test + validated-capability  │  module, P8 api-contract
                 │                                         │  + measured-compounding)      │  module; synthetic datasets)
                 │ OWNER-GATED part: real network unit     │                               │ OWNER-GATED: E5 (real
                 │ (systemd IPAddressDeny=any ⇒ dedicated  │                               │  clients/datasets/GPU)
                 │  perimeter under CTO auth)              │                               │
                 └─────────────────────┬───────────────────┴───────────────────────────────┘
                                       ▼
                             C1–C4 campaign closure (needs FR-07/08 + profession proofs)
                                       ▼
                             VPS preprod (OWNER-GATED: sudo/systemd/deploy)
```

**Critical path (local, non-blocked):** FR-06 → FR-07(wiring) → FR-08 → 15-profession hardening → C4 closure.
**Parallelizable without file/authority conflict:** FR-08 (compounding) ∥ FR-07(local wiring) ∥ per-profession
reference-project lots (distinct files). FR-07 live-network and VPS preprod are **serialized behind owner gates.**

---

## 4. Mission readiness classification

**A. Immediately executable (local, no prereq, no owner gate):**
- **FR-07(local)** — invoke `frontier-radar.collect()` with an injected fetcher, persist cross-run
  seen-fingerprints + per-source health/cursor via `autonomy-store`/`idempotency-guard`, write `lastCollected`/
  `errors`. Provable with fixtures (NOT live network). No new store/scheduler.
- **FR-08** — compose the compounding upper-half (see §6).
- **P5 coherence gap** — a real `deployment-readiness.ts` module (today test-only).
- **P8 coherence gap** — a standalone API-contract/OpenAPI module (today embedded in the parcours).

**B. Awaiting a prerequisite:** C1–C4 closure (needs FR-07/08 + profession proofs); 15-profession E4
hardening (needs the reference projects + synthetic datasets built).

**C. Needs an external/owner decision:** real network collection unit (systemd perimeter; live unit is
`IPAddressDeny=any`); VPS preprod (sudo/systemd/deploy); real datasets / GPU / paid providers / real clients (E5).

**D. Blocked by a missing source:** V12.4 §1–§122 matrix (owner must supply the original V12.4 text).

---

## 5. WI-FR-07 preparation — autonomous world Radar (WIRING + small EXTENSION, not a build)

**REUSE AS-IS:** `bounded-http-client` (3-host ALLOWLIST boamp/ted/data.economie, SSRF guard, 8s/2MB caps,
injectable `httpImpl`); `ted-connector.fetchTed` + `tender-feed-connector.fetchFeed` (injected fetcher,
5-state fail-closed, AUTH_REQUIRED when no client); `frontier-radar` (registerSource/collect/runRadar);
`frontier-radar-store` (persistence + DEFERRED-lot integration); `evidence-provenance.stampProvenance`;
`research-ranking.rank` (provenance_ref required, fail-closed); `source-registry` (value model — source-priority
metadata only, NOT the collection registry). **Scheduling:** the canonical systemd timer
`deploy/odg-mission-runner.timer` → `odg-schedule-tick` (NO new in-process scheduler).

**GAPS to add (local, reuse-only):**
1. Invoke `collect()` with `bounded-http-client.get` on a real run (fixtures prove processing; live network is
   owner-gated — see below).
2. Durable **cross-run seen-fingerprint** partition + **per-source health/cursor** (TED `iterationNextToken`,
   BOAMP date-window) — new `autonomy-store` keys, no new store.
3. Multi-source **cross-check / corroboration** producing `baseline.crossChecked`.
4. **Weekly deep-research cadence** driven off the systemd timer (or a sibling `OnCalendar=weekly` unit).

**Discovery families to cover (strategy, §3 of mandate):** AI models/agents; multi-agent/autonomous systems;
continual learning/consolidation; scientific publications; patents; dev/eng tools; cybersecurity/CVEs; databases/
infra/distributed systems; benchmarks/eval methods; cost/performance; regulation/governance; emerging tech. Sources:
primary (papers/repos/releases/official docs/security advisories/standards/public pricing) — no scraping/credential
harvesting/paid API without authorization.

**OWNER-GATED (not this campaign):** a **network-permitted systemd unit perimeter** — the live
`odg-mission-runner.service` sets `IPAddressDeny=any`, so real Radar egress needs a dedicated unit under explicit
CTO authorization with its own allowlist/limits. Until then the live-collection part stays **PREPARED, NOT_RUN**;
the local wiring/dedup/health part is immediately executable with an injected fetcher.

Classification: **PREPARED** (local wiring executable; live egress owner-gated).

---

## 6. WI-FR-08 preparation — Compounding Loop / global learning (COMPOSE upper-half)

**Lower half EXISTS (reuse directly):** `mission-evidence.buildEvidenceRecord`/`assertAcceptable` +
`evidence-provenance` (VERIFIED_RESULT gate, false-success-proof); `memory-taxonomy` (classify/index/retrieve,
14 families, consolidation/protection); `learning-loop.learn` (measured delta, regressions, reusable lessons);
`reuse-ledger` (classify/record outcome, suppressedSignatures, de-selection — consumed by `capability-router`);
`mission-reuse-recorder` + `capability-learning` + `post-release-learning` (producers); `improvement-baseline`
(delta); `idempotency-guard`/`autonomy-store`/`checkpoint-engine` (dedupe/persist/resume); `learning-reuse-proof`
(domain-scoped goal/domain match + out-of-domain/stale/tampered controls — in proof only); `excellence-gate.
gateLearningReuse`; `learning-chain` (CAPTURED→…→EFFECTIVE grader).

**GAPS to add (compose, no new primitive):**
1. **Reusable-asset registry with explicit validity domain** (signature + goal/domain/scope), persisted in
   `autonomy-store`, consulted at selection time (promote `learning-reuse-proof`'s domain concept from proof to
   production).
2. **Positive, leakage-free TRANSFER_TEST** — apply a validated asset to a NEW domain/mission with hold-out
   separation (no leakage of the capturing mission's data), measured via `improvement-baseline.measureDelta`.
3. **VALIDATED_CAPABILITY promotion gate** — promote only after a passing transfer test (not one in-domain
   EFFECTIVE), gated by `excellence-gate`.
4. **Cross-mission MEASURED_COMPOUNDING aggregate** — portfolio-level cumulative net measured benefit (compounding
   curve), beyond per-asset counters.

Chain target: `OBSERVE→DIAGNOSE→HYPOTHESIS→BUILD→SANDBOX→REPLAY→ADVERSARIAL→INDEPENDENT_EVAL→SHADOW→CANARY→
GOVERNED_PROMOTION→MEASURE→CONSOLIDATE` — the FR-03/04/05 half is built; FR-08 adds CONSOLIDATE + the reuse/transfer/
compounding tail. **Global learning ≠ global raw-data access** (minimization, compartmentalization, permissions).

**Research tracks to EVALUATE (not integrate blindly, no claim without proof):** DeepSeek Super Agent (autonomy/
delegation/background work); Google SLEEP (knowledge consolidation); memory retention/retrieval/context-cost;
specialized-agent cooperation + role separation + independent verification; scientific discovery/experimentation;
meta-improvement (improving the mechanisms that improve ODG). Prepare comparative evaluation + possible adaptation.

Classification: **PREPARED** (fully local-buildable; compose existing modules).

---

## 7. Fifteen-profession coverage — EXISTING modules + gaps (E0–E4 target; E5 NOT_RUN)

Every profession already has core modules (reuse, do not rebuild). Gaps are mostly E5 real-world connectors/
datasets/benchmarks (owner-gated/resources), to be approached with clearly-labelled synthetic data where real
resources are absent — never presenting a simulation as real.

| P# | Existing (reuse) | Gap (reference project / benchmark) |
|---|---|---|
| P1 Software/Full-Stack | build-pipeline, code-health/review-service, coding/engineering/patch-executor, ts-project-check | multi-language reference repo E2E (TS-centric today) |
| P2 AI/ML/Agentic | reference-agents, agent-factory/identity/governance, cognitive-loop/decision, capability-router/learning | live-model benchmark / real eval dataset (provider SIMULATED) |
| P3 Cyber/DevSecOps | sbom-audit, supply-chain-attest, sarif, license-policy, bash-command-governor, truth-lock, parcours-secure-api | real SAST/DAST + CVE feed (none today) + vulnerable reference project |
| P4 Data Eng | dataset-quality(-service/assertions/gate), pipeline-builder, finance-data-connector | real warehouse/ETL + lineage over a real dataset |
| P5 Cloud/DevOps | build-pipeline, developer-platform, canary-decision-pack, launch-readiness, dora-metrics | **`deployment-readiness.ts` module (test-only today)** + real deploy target |
| P6 Quality/Eval | quality-harness, eval-metrics, k-eval, broad-it-eval, fairness/repair-eval, characterization-baseline | broader external eval corpus |
| P7 SRE/Perf | slo-collector/targets/response, dora-metrics, incident-recurrence, latency-measure, engine-benchmark | real tracing + load/chaos benchmark harness |
| P8 API/Integration | parcours-secure-api-governance (contract logic here), bounded-http-client, connectors | **standalone API-contract/OpenAPI module** + contract-test suite |
| P9 FinOps | cost-engine/accounting, budget-ledger/contract, unit-economics, live-cost-metering, net-cash-model | real cloud-billing connector |
| P10 AI Gov/EU-Reg | ai-act-role-classifier, iso-42001/27001, iso-dossier, regulatory-assurance/dossier, ai-assurance, certification-readiness | accredited-auditor validation of a real dossier |
| P11 IDP | document-pipeline, pdf-extract, factur-x/einvoice-parser/validator/export | real OCR + scanned-doc dataset |
| P12 Streaming | event-stream-engine, integration-stream-reliability | real Kafka/Pulsar adapter + throughput benchmark |
| P13 AI Infra/GPU | inference-engine (CPU OPERATIONAL, GPU SIMULATED), local-model-manager, ollama-provider/control-plane | real GPU serving adapter + hardware benchmark |
| P14 IDP/DevEx | developer-platform, parcours-build-platform-product, golden-path-evidence | real scaffolded project graduating to CI |
| P15 Automation/Workflow | workflow-engine, reference-agents, parcours-platform-workflow-agents | real enterprise process + live execution |

**Two concrete LOCAL coherence-gap lots (immediately executable):** P5 `deployment-readiness.ts`, P8 standalone
API-contract module.

---

## 8. Benchmark / world-class evidence matrix (define experiments, not just names)

Levels: **E0** structural · **E1** behavioral · **E2** reference-project · **E3** adversarial · **E4** independent/
holdout · **E5** external reality (**NOT_RUN** without real clients — never simulated). Target E0–E4 now.

| Reference | Professions | Experiment / metric / threshold |
|---|---|---|
| SWE-bench **Pro** (+ internal held-out, NOT Verified-only — contamination risk flagged 2026) | P1, P6 | % resolved on fresh held-out tasks; threshold set AFTER baseline + valid comparison (never invented) |
| MLCommons / MLPerf (if workload matches) | P2, P13, P6 | inference throughput / latency p50/p95/p99, reproducibility, transparent cost |
| NIST AI RMF / GenAI Profile | P10, P2 | Govern/Map/Measure/Manage coverage over a real dossier |
| OWASP LLM Top-10 / Agentic | P3, P2, P15 | prompt-injection (direct/indirect), excessive agency, supply-chain, output-validation, unbounded-consumption tests |
| DORA (5 metrics) | P5, P7 | change lead time, deploy frequency, change failure rate, failed-deploy recovery time, rework rate |
| SLSA | P3, P5 | provenance level source→build→artifact (reuse evidence-provenance + supply-chain-attest) |
| OpenTelemetry | P7 | traces/metrics/logs coverage, correlated, no secrets |
| ISO 42001 / 27001 | P10 | clause mechanism-present vs satisfied (mechanism ≠ satisfied; no cert claim without accredited audit) |

Anti-contamination: private holdouts, fresh tasks, rotating sets; dev/validation/final separation; pinned model/
tool/prompt/dataset/code/evaluator versions; repetitions + uncertainty; negative results kept. **No "world #1" claim
without a valid independent comparison.**

---

## 9. Autonomous execution preparation (reuse canonical mechanisms only)

ODG can already: pick next work (`campaign-controller.selectNextLot`), produce a contract-compliant mission
(mission-contract-factory), check deps (dep-planner/campaign-controller), verify authorization (action-gate +
objective-authorization + external), execute in the **real sandbox** (frontier-sandbox), collect evidence
(mission-evidence + provenance), verify independently (frontier-lab), detect regressions (improvement-baseline +
reuse-ledger), resume after interruption (checkpoint-engine + idempotency-guard), update the compass, prepare the
next mission. **No second scheduler/queue/orchestrator/store/memory/sandbox/authorizer needed** — all present.
Autonomy ≠ unlimited authority: every unattended run must carry explicit duration/resource/cost/scope limits and
remain fail-closed (consequential/human-gated actions ⇒ ESCALATE). Live unattended network/VPS remain owner-gated.

---

## 10. Decisions requiring external authority

1. **Real network collection unit** for WI-FR-07 (systemd perimeter; live unit is `IPAddressDeny=any`).
2. **VPS preprod** deployment (sudo/systemd/deploy — owner-gated; no SSH/sudo this session).
3. **Paid providers / GPU / real datasets / real clients** (E5) for profession hardening.
4. **V12.4 original text** — required to build the §1–§122 matrix (NOT_RECOVERABLE in-repo).
5. **Canonical mission queue wiring** for `odg-schedule-tick` (today a synthetic allowlist-derived canary queue).

---

## 11. Recommended next execution sequence (ODG picks per authorizations)

1. **WI-FR-07 (local wiring)** — collect() invocation + cross-run dedup + source health (injected fetcher, fixtures).
2. **WI-FR-08** — compounding upper-half (asset registry + transfer test + validated-capability + measured compounding).
3. **P5 `deployment-readiness.ts` + P8 API-contract module** (two concrete local coherence gaps; parallel, distinct files).
4. **15-profession E2–E4 hardening** (per profession, synthetic datasets clearly labelled; parallel where files disjoint).
5. **C1–C4 campaign closure** (demonstrate each campaign objective, not just sub-lot ACCEPTED counts).
6. **OWNER-GATED, when authorized:** WI-FR-07 live network unit; VPS preprod; E5 real-world benchmarks; V12.4 §1–§122 matrix.

Each future lot: audit-before-build, exact 5–7 file write-set, local-only, no push/VPS/sudo/secret, reuse-only,
tests + strict tsc + CI gate + evidence, compass update, stop for CTO review. No lot auto-starts the next.
