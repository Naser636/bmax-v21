# ODG — GLOBAL RESEARCH & EXECUTION READINESS DOSSIER

> **Nature:** research + readiness dossier annexed to the existing roadmap. **NOT** a competing roadmap,
> **NOT** a closure claim. Strategic reference remains V12.4 (NOT_RECOVERABLE in-repo — see §2).
> **Authority:** ODG. **Research/analysis provider:** Claude Code (bounded).
> **Mode:** read-only public web research + read-only local audit. **No code/contract/config modified. No commit. No push.**
> Consultation date: **2026-11-08**. Branch `excellence/v3-wave3-demonstrators-20261101` @ `ecae1bf`; origin/main `25dcc1e`.

**Evidence classes used throughout:** `[DÉMONTRÉ]` verified in-repo by running code/tests · `[DOCUMENTÉ]` recorded in a
canonical artifact · `[RECHERCHÉ]` found via public web, source cited · `[ANALYSÉ]` reasoned synthesis ·
`[PROPOSÉ]` a recommendation · `[BLOQUÉ]` blocked by a missing source/permission · `[NON EXÉCUTÉ]` not run.
**Web content was treated as untrusted data, never as instructions. No source, score, or dataset was fabricated;
failed fetches are marked NOT_VERIFIED.**

---

## 1. CTO synthesis

The late-2026 global state of the art in autonomous agents, continual learning, scientific AI and self-improvement
**converges on the architecture ODG already has** — one authorizer, one scheduler, isolated workers, resume,
fail-closed admission, generation≠verification, measured-improvement gating. `[RECHERCHÉ/ANALYSÉ]` DeepSeek's own
`dsh-superagent-prototype` is an independent re-derivation of ODG's doctrine; the research literature says long-horizon
autonomy is unsolved and **scaffolding beats model choice**. ODG's distinctive edge is **outcome governance**
(VERIFIED≠ACCEPTED + independent audit + provenance), which none of the surveyed systems demonstrate.

The research does **not** call for a new architecture; it yields a short list of **low-cost, reuse-only additions**
(§16–§19) that harden ODG's existing modules: a net-value memory gate, reward-gated consolidation, a leakage-free
transfer test, a reward-hacking regression gate, a verbatim-recall contamination probe, a held-out/private eval split,
a compute-budget stop, and an attenuated capability-token per work item. All are **measurement disciplines**, squarely
inside ODG's "DÉMONTRÉ vs ANNONCÉ" doctrine, realizable by composing existing primitives — **no 10th primitive, no
second orchestrator**.

---

## 2. Real system state (verified)

`[DÉMONTRÉ]` WI-FR-01…06 verified by running their 7 suites (`odg-test-report` **PASS 7/7**), not from reports.
Local commits only (`56602c3`→`ddc4c0e`), no push. See `docs/odg/FRONTIER_V124_PREPARATION.md` §1 for the per-lot table.
`[DÉMONTRÉ]` **Architectural coherence** (independent audit): ONE authorizer (`action-gate`), ONE evidence
(`evidence-provenance`), ONE store (`autonomy-store`), ONE mission scheduler (`campaign-controller`/`mission-scheduler`;
`writeset-scheduler` orthogonal), **exactly 9 primitives** (`primitive-validation`, no 10th), frontier layer = pure
orchestration, **no architectural duplication**. `[DÉMONTRÉ]` Preservation: 0 tracked-modified, 404 untracked, 5 stashes
— untouched. `[BLOQUÉ]` **V12.4 original text NOT_RECOVERABLE in-repo** (exhaustive sweep: tracked+untracked, 24 archives,
git `--all`+`-S`, 5 stashes, dangling); the §1–§122 matrix cannot be built without the owner supplying the text — no
section invented. Historical invariants preserved: 9 primitives (IDENTITY/STATE/CONTRACT/POLICY/RESOLVER/EXECUTOR/
EVIDENCE/RECOVERY/ALLOCATOR); 50K Semantic Universe = semantic breadth (not 50 000 agents); 166 retired (`DEC-V60-166-
RETIREMENT`), not recreated; A02–A53 NOT_RECOVERED.

---

## 3. Global research — sources & method

Four parallel read-only research streams (autonomous agents · continual learning/memory · scientific AI/self-improvement
· benchmarks/datasets). ~40+ sources consulted; each classified PRIMARY / SECONDARY / ANNOUNCEMENT / NOT_VERIFIED.
Method: prefer original papers/repos/official docs; record exact URL + date + reliability; separate DEMONSTRATED numbers
from ANNOUNCED claims; flag fetch failures. Full source tables are in §5–§11 and §22.

---

## 4. Autonomous world Radar (WI-FR-07 preparation)

`[DOCUMENTÉ]` (from the FR-07 reuse audit): WI-FR-07 is a **WIRING + small EXTENSION**, not a build. REUSE AS-IS:
`bounded-http-client` (3-host allowlist boamp/ted/data.economie, SSRF guard, 8s/2MB caps, injectable `httpImpl`),
`ted-connector`/`tender-feed-connector` (injected fetcher, 5-state fail-closed, AUTH_REQUIRED w/o client),
`frontier-radar.collect`/`runRadar`, `frontier-radar-store` (persistence + DEFERRED-lot integration),
`evidence-provenance.stampProvenance`, `research-ranking.rank` (provenance_ref required), the canonical systemd timer
`deploy/odg-mission-runner.timer`. `[PROPOSÉ]` GAPS: invoke `collect()` live with `bounded-http-client.get`; persist
**cross-run seen-fingerprints** + **per-source health/cursor** (TED `iterationNextToken`, BOAMP date-window) via new
`autonomy-store` keys; multi-source **cross-check**; **weekly cadence** off the systemd timer.
`[NON EXÉCUTÉ / BLOQUÉ-owner]` real network egress: the live unit sets `IPAddressDeny=any`, so live Radar collection
needs a **dedicated network-permitted systemd unit under explicit CTO authorization** — out of scope for a research
campaign. The chain `DISCOVER→COLLECT→DEDUP→QUALIFY→EVIDENCE→RANK→MISSION_CANDIDATE` is present in code except the live
collection + cadence drive. **The Radar must never modify POLICY or self-authorize** (enforced: proposals are PROPOSED,
admission requires action-gate ALLOW + external authorization).

---

## 5. DeepSeek Super Agent & comparable architectures `[RECHERCHÉ]`

`dsh-superagent-prototype` (github.com/deepseek-ai/dsh-superagent-prototype, ~2026-10-31, PRIMARY): a proactive
single-repo coding agent — Engine (one DB transaction/command), Router Main-Session (admission) + Executor Workers
(one ticket each, isolated dir, bounded tools), SQLite store + retrying effect queue, **resume with recovery notes**,
fail-closed admission, "would-have-accepted but not accepted" audited no-op; "**not production-ready**, **no benchmarks**"
(README + helpnetsecurity.com 2026-11-02, SECONDARY). ⚠️ A search-summary "12.4 min median" figure is **contradicted by
primary sources — treat as FABRICATED, do not cite**. The WeChat article (mp.weixin.qq.com/s/zoS7GlReWPhfCjENGxXCdg)
is behind a captcha → **NOT_VERIFIED**.
**Mapping to ODG (no duplication):** Router/admission ↔ `action-gate`+`campaign-controller`; Worker sessions ↔
`reference-agents`/`agent-factory` + per-work-item write-sets; SQLite store+resume ↔ closure-register + checkpoint-engine;
"record-but-don't-act" ↔ PROPOSED≠AUTHORIZED. **ODG already surpasses it on evidence-gated acceptance + independent audit.**
Comparables: **AgencyBench** (alphaxiv 2601.11044, PRIMARY): scaffold beats model (Opus 50.8%→71.3% with Agent-SDK).
**UltraHorizon / LH-Terminal-Bench** (2026, SECONDARY): SOTA agents **underperform humans** on long-horizon tasks.
**Governed multi-agent:** SARC (arXiv 2605.07728, conceptual), OIDC-A / capability-token chains (arXiv 2605.05440) —
the one genuinely additive idea: an **attenuated append-only capability-token per work item** in `action-gate` (§16).

---

## 6. Google SLEEP & continual learning `[RECHERCHÉ]`

"Language Models Need Sleep" (research.google blog 2026-10-27 + arXiv 2606.03979, PRIMARY): wake/sleep lifecycle —
*knowledge seeding* (upward distillation into long-term params via MoE+LoRA) + *dreaming* (self-generated synthetic data,
reward=1 if downstream improves). DEMONSTRATED: factual retention 48.9% vs SEAL 46.7%; few-shot 80% vs 72.5%; AIME-24 79.2.
"Near-perfect 10M-token" scaling is figure-level/ANNOUNCED. OpenReview `iiZy6xyVVE` = **NOT_VERIFIED** (Cloudflare).
**ODG adaptation (pattern, not weight-training):** reward-gated consolidation — `learning-loop` triggers consolidation,
`memory-taxonomy` promotes short→long-term, `improvement-baseline` gates "dream" acceptance on a measured delta>0 (§17).

---

## 7. Memory & Memory Tax `[RECHERCHÉ]`

**Memory Tax** (arXiv 2610.34073, 2026-10-25, PRIMARY — ID resolved/verified): net value = benefit − tax vs naive RAG.
DEMONSTRATED: across 13 memory systems × 3 backbones, **naive RAG often wins** (LongMemEval-s RAG 81.4% vs OpenViking
58.8%, −22.6pp); many systems have **negative net value**. **CURATOR** (arXiv 2606.25115, PRIMARY): net-value-per-byte
ρ = [value − λ·harm]/bytes governs KEEP/SHARE/TRUST; injection success **0.75→0.00**, memory 2.7× smaller. **CMI**
(arXiv 2608.07622, PRIMARY): conflict-aware consolidation (same-slot overwrite detection). **ODG adaptation:** a
**"memory-tax gate"** in `reuse-ledger` — consolidate/protect a memory only if it beats a raw-retrieval baseline (net
value ≥ 0); conflict-aware promotion in `memory-taxonomy` (§17). Highest-leverage, lowest-cost adoption; pure measurement.

---

## 8. Compounding & meta-improvement `[RECHERCHÉ]`

**OpenAI scientific collaborator** (openai.com/index/building-scientific-understanding…, Oct 2026; 403 on direct fetch,
via mirrors/X — ANNOUNCEMENT): results are "raw research data"; human "shepherds" verify; nothing independently confirmed.
↔ ODG producer≠verifier (`frontier-lab`). **Self-improvement SoTA:** Gödel machine (proof-governed); **Darwin Gödel
Machine** (sakana.ai/dgm + arXiv 2505.22954, PRIMARY): archive of self-rewriting agents, SWE-bench Verified **20→50%**,
**~$22k/~2wk per run**; **AIDE²/Meta RSI** (arXiv 2609.26457, PRIMARY): grade 0.703→0.778 > human 0.749, **7 self-versions
in 8 days**, **reward-hacking 55%→32%**, gains must **transfer to held-out**. **ODG adaptation:** `evolution-loop` is the
RSI loop; add **archive-of-variants** (reuse-ledger), **held-out-transfer gate** (learning-reuse-proof), **reward-hacking
regression gate** (meta-intelligence), **compute-budget stop** (§18). Caveat: DGM's 50% is on contaminated Verified.

---

## 9. Fifteen professions — coverage (E0–E4 target; E5 NOT_RUN) `[DOCUMENTÉ]`

Every P1–P15 already has core modules (reuse, don't rebuild). Full table in `docs/odg/FRONTIER_V124_PREPARATION.md` §7.
Gaps are mostly **E5 real-world** (real connectors/datasets/GPU/clients = owner-gated/resources). Two concrete **local**
coherence-gap lots: **P5 `deployment-readiness.ts`** (today test-only) and **P8 standalone API-contract module** (today
embedded in `parcours-secure-api-governance.ts`). Per-profession benchmark + dataset mapping in §10–§11.

---

## 10. Datasets identified (NOT downloaded) `[RECHERCHÉ]`

| Dataset (source) | P# | License | Contamination | Synthetic alternative |
|---|---|---|---|---|
| SWE-bench / Verified (swebench.com; HF princeton-nlp/SWE-bench) | P1,P6 | MIT | **HIGH** (in pretraining) | scripted repo-mutation tasks |
| **SWE-bench Pro** (Scale AI, arXiv 2509.16941) | P1,P6 | public copyleft / held-out gated | **LOW** (held-out by design) | — (the low-contamination option) |
| Defects4J v2.0 (github.com/rjust/defects4j) | P1,P6 | Apache-2.0 | MEDIUM | mutation testing (PIT) |
| NVD / MITRE CVE + CWE (nvd.nist.gov, cve.mitre.org) | P3 | royalty-free / public domain | HIGH | time-split by publish date |
| FUNSD / RVL-CDIP / PubLayNet / DocVQA | P11 | research-use / CDLA | MEDIUM (+**PII risk** in scanned forms) | **synthetic forms (Faker+layout)** |
| Alibaba clusterdata / Google Borg (CC-BY) / DeathStarBench (CC0) | P7,P12,P13 | research / CC-BY / CC0 | LOW | run DeathStarBench locally |
| GAIA (gated) / WebArena (Apache-2.0) / AgentBench / tau-bench | P2,P15 | mixed open | LOW–MED | self-host envs, private tasks |
| NAB (numenta/NAB) | P12,P7,P4 | **license ambiguity (AGPL vs MIT)** — verify | MEDIUM | synthetic time-series + injected anomalies |
| FOCUS spec (focus.finops.org) — **schema, not data** | P9 | open | N/A | **synthetic FOCUS-conformant billing** |

`[PROPOSÉ]` **No adequate public real dataset** for P9 FinOps (real billing is private/tenant-identifying), P13
GPU-inference traces, P14 dev-platforms, P15 enterprise-process → **synthetic, clearly-labelled** datasets with
train/validation/final-test separation. **Do not download any dataset without a dedicated mandate.**

---

## 11. Benchmarks & tests `[RECHERCHÉ]`

| Standard (URL) | P# | Measures | Threshold policy |
|---|---|---|---|
| MLPerf (mlcommons.org/benchmarks) | P2,P7,P13,P5 | training time-to-quality; inference throughput/latency (LoadGen); Closed/Open divisions | hit reference target; valid only per round |
| NIST AI RMF (nist.gov) | P10,P2,P6,P3 | Govern/Map/Measure/Manage; 7 trustworthiness traits | qualitative, voluntary (no score) |
| OWASP LLM Top-10 (genai.owasp.org/llm-top-10) | P2,P3,P10,P6 | LLM01 injection … LLM10 unbounded consumption | coverage checklist |
| OWASP Agentic (genai.owasp.org) | P2,P3,P15 | agentic threats/mitigations | checklist (**T-taxonomy NOT_VERIFIED — fetch PDF before citing**) |
| DORA (dora.dev) | P5,P7,P1,P14 | deploy freq, lead time, CFR, recovery time | 2024 Elite bands: lead <1d, CFR 0–5%, recovery <1h (MEDIUM — bands from 2024 report) |
| SLSA v1.2 (slsa.dev) | P1,P3,P5,P14 | build provenance L0–L3 | target level by risk |
| OpenTelemetry (opentelemetry.io) | P7,P8,P12,P5 | traces/metrics/logs/baggage | data standard, not a score |
| SWE-bench Pro (arXiv 2509.16941) | P1,P2,P6 | % resolved on held-out real issues | best models **~23% Pass@1** vs 80–95% on (contaminated) Verified |

**Contamination discipline (P1/P2/P6):** prefer time-split / held-out / freshly-synthesized tasks; public-leaderboard
scores are **upper bounds, not proof**. Matrix per profession: `CAPACITÉ→BENCHMARK→DATASET→EXPÉRIENCE→MÉTRIQUE→SEUIL→PREUVE`
(E0 structural · E1 behavioral · E2 reference-project · E3 adversarial · E4 independent/holdout · **E5 external reality
NOT_RUN**). Never invent a score or a "world #1" claim without a valid independent comparison.

---

## 12. Four campaigns (C1–C4) — closure conditions `[DOCUMENTÉ/PROPOSÉ]`

A campaign is **not** closed because its sub-lots are ACCEPTED; it must demonstrate its objective.
- **C1 Truth/Preservation/World-Model:** Truth Lock + inventory + 9 primitives + baselines + §1–§122 matrix. Blocker:
  V12.4 text (`[BLOQUÉ]`).
- **C2 Cognitive Intelligence/Discovery/Learning:** real Radar collection + provenance + learning/consolidation + transfer
  without leakage. Needs FR-07(live, owner-gated) + FR-08.
- **C3 Autonomous Engineering/Verified Evolution:** canonical mission chain (DEMONSTRATED via FR-06) + Lab + Evolution +
  real sandbox (DEMONSTRATED) + rollback. Mostly built; closure needs live wiring + measured runs.
- **C4 Fifteen Professions/Excellence:** 15 reference projects + reproducible benchmarks + cross-métier tests + measured
  compounding. Needs profession E2–E4 hardening + FR-08.
Each campaign's closure = a demonstrated objective with independent verification, not a count.

---

## 13. Transversal capabilities & autonomy `[DÉMONTRÉ]`

All 19 transversal modules present (world-model, discovery-engine, cognitive-loop/decision, meta-intelligence,
campaign-loop/controller, mission-scheduler, autonomy-store, idempotency-guard, improvement-baseline, bounded-http-client,
evidence-provenance, mission-evidence, checkpoint-engine, action-gate, capability-router, patch-executor, agent-identity).
ODG can already: select next work, produce a contract-compliant mission, check deps, verify authorization, execute in the
**real sandbox**, collect evidence, verify independently, detect regressions, resume, update the compass. **Autonomy ≠
unlimited authority:** every unattended run must carry explicit duration/resource/cost/scope limits and stay fail-closed;
live network/VPS remain owner-gated. **No second scheduler/queue/orchestrator/store/memory/sandbox/authorizer is needed.**

---

## 14. Dependencies & critical path `[DOCUMENTÉ]`

Critical path (local, non-blocked): FR-06 → FR-07(local wiring) → FR-08 → P5/P8 coherence gaps → 15-profession E2–E4
hardening → C1–C4 closure → VPS preprod (owner). Parallelizable without file/authority conflict: FR-08 ∥ FR-07(local) ∥
per-profession lots (distinct files). Serialized behind owner gates: FR-07 live network unit, VPS preprod, E5 benchmarks,
V12.4 §1–§122 matrix. (Diagram in `docs/odg/FRONTIER_V124_PREPARATION.md` §3.)

---

## 15. Technical gaps & risks `[ANALYSÉ]`

- **Contamination of self-measured benchmarks** → a rising score with rising verbatim-recall is a FAIL, not progress.
- **Memory net-value** → many memory designs reduce accuracy; gate on net value vs raw retrieval.
- **Reward-hacking in self-improvement** → never zero; must be a regression gate, not an afterthought.
- **Long-horizon autonomy unsolved** → keep checkpointed, evidence-gated, human/independent promotion.
- **Obsolescence risk** → keep architectural decisions reversible (archive-of-variants, feature-gated adapters).
- **Owner-gated bottlenecks** → live network, VPS, real datasets/GPU/clients, V12.4 text.

---

## 16. Improvement opportunities — governance & agents `[PROPOSÉ]`

**Capability-token hardening** (from OIDC-A/orchestrator-manifest research): turn ODG's write-set/authorized-symbols into
an **attenuated, append-only capability token per work item** in `action-gate` (the single authorizer) — provenance-bound,
scope-escalation fail-closed, survives resume. Test: token-chain rejects any scope escalation; provenance preserved across
restart. **No second orchestrator.**

---

## 17. Improvement opportunities — memory & learning `[PROPOSÉ]` (feed WI-FR-08)

1. **Net-value memory gate** (Memory Tax / CURATOR): `reuse-ledger` logs benefit − tax vs a raw-retrieval baseline;
   promote/protect only when net value ≥ 0; evict by net-value-per-byte.
2. **Reward-gated consolidation** (SLEEP): no item enters protected long-term memory without a measured improvement
   delta (`improvement-baseline` + `memory-taxonomy`).
3. **Conflict-aware consolidation** (CMI): detect same-slot overwrite; preserve both with provenance rather than clobber.

---

## 18. Improvement opportunities — self-improvement & compounding `[PROPOSÉ]` (feed WI-FR-08)

1. **Archive-of-variants** (DGM): keep every self-modification variant in `reuse-ledger` for reversibility.
2. **Held-out transfer gate** (AIDE² / cross-domain leakage): a capability "compounds" only if it improves a **target
   domain whose data never entered the source learning/memory** (3-level leakage control in `learning-reuse-proof`);
   report the **generalization gap** (in-domain − held-out) as a first-class metric.
3. **Reward-hacking regression gate** (`meta-intelligence`): a self-modification is ACCEPTED only if reward-hacking did not
   rise; else ROLLED_BACK.
4. **Verbatim-recall contamination probe + private eval split** (SWE-bench Pro): a held-out/private ODG eval split that
   never touches any training/memory artifact; a rising score with rising verbatim recall ⇒ DISCARD.
5. **Compute-budget stop** (DGM ~$22k/run): the self-improvement loop halts fail-closed at a declared budget.
6. **Producer→shepherded-verification→ACCEPTED** (OpenAI): a generated result is DATA until a *separate* module
   reproduces it; machine-checkable artifact required before PROMOTION.

---

## 19. WI-FR-07 & WI-FR-08 execution preparation `[PROPOSÉ]`

**WI-FR-07 (local-first):** invoke `collect()` with an injected fetcher; add durable cross-run seen-fingerprint + per-source
health/cursor partitions (autonomy-store keys); cross-check corroboration; weekly cadence off the systemd timer. Live egress
= separate owner-gated unit. REUSE-only; no new scheduler/store/client. (Register item `wi-fr-07-radar-live-collection`,
DEFERRED.)
**WI-FR-08 (fully local):** compose the upper compounding half — reusable-asset registry with validity domain
(promote `learning-reuse-proof`'s domain concept to production), leakage-free transfer test, VALIDATED_CAPABILITY gate,
cross-mission MEASURED_COMPOUNDING aggregate — plus §17–§18 gates. No new primitive. (Register item `wi-fr-08-compounding-loop`,
DEFERRED.)

---

## 20. Remainder of the Master Roadmap preparation `[DOCUMENTÉ]`

After FR-07/08: P5 `deployment-readiness` + P8 API-contract modules (local coherence gaps); 15-profession E2–E4 hardening
with synthetic datasets; C1–C4 campaign closure (demonstrated objectives); then owner-gated VPS preprod. Benchmark matrix
(§11) and dataset strategy (§10) feed the profession hardening. V12.4 §1–§122 matrix remains `[BLOQUÉ]` on the owner text.

---

## 21. Decisions requiring external authority `[DOCUMENTÉ]`

1. **V12.4 original text** — to build the §1–§122 matrix (NOT_RECOVERABLE in-repo).
2. **WI-FR-07 live network unit** — a network-permitted systemd perimeter (live unit is `IPAddressDeny=any`).
3. **VPS preprod** — sudo/systemd/deploy (owner-gated; none performed).
4. **Paid providers / GPU / real datasets / real clients** (E5).
5. **Canonical mission-queue wiring** for `odg-schedule-tick` (today a synthetic allowlist-derived canary queue).

---

## 22. Bibliography (exact sources, with reliability)

**Autonomous agents:** github.com/deepseek-ai/dsh-superagent-prototype (+ /docs/007-architecture.md) PRIMARY ~2026-10-31;
helpnetsecurity.com/2026/11/02/deepseek-dsh-superagent SECONDARY; mp.weixin.qq.com/s/zoS7GlReWPhfCjENGxXCdg **NOT_VERIFIED**;
alphaxiv.org/abs/2601.11044 (AgencyBench) PRIMARY; icml.cc/virtual/2026/poster/61412 (UltraHorizon) SECONDARY;
arXiv 2607.08964 (LH-Terminal-Bench) SECONDARY; arXiv 2605.07728 (SARC) SECONDARY; arXiv 2605.05440 (authorization/OIDC-A)
SECONDARY. **Continual learning/memory:** research.google/blog/the-sleep-framework… PRIMARY 2026-10-27 + arXiv 2606.03979
PRIMARY; openreview.net/forum?id=iiZy6xyVVE **NOT_VERIFIED**; arXiv 2610.34073 (Memory Tax) PRIMARY 2026-10-25; arXiv
2606.25115 (CURATOR) PRIMARY; arXiv 2608.07622 (CMI) PRIMARY; arXiv 2606.30306 (Always-On Agents survey) SECONDARY.
**Scientific AI / self-improvement:** openai.com/index/building-scientific-understanding-with-academic-communities
ANNOUNCEMENT (403 direct; via mirrors); sakana.ai/dgm + arXiv 2505.22954 (DGM) PRIMARY; arXiv 2609.26457 (AIDE²/Meta RSI)
PRIMARY; arXiv 2509.16941 (SWE-bench Pro) PRIMARY; openai.com/index/why-we-no-longer-evaluate-swe-bench-verified
ANNOUNCEMENT 2026-02-23; arXiv 2508.21354, arXiv 2604.11998 (cross-domain transfer) PRIMARY. **Benchmarks/standards:**
mlcommons.org/benchmarks HIGH; nist.gov/itl/ai-risk-management-framework HIGH; genai.owasp.org/llm-top-10 HIGH;
genai.owasp.org MEDIUM (Agentic T-taxonomy NOT_VERIFIED); dora.dev/guides/dora-metrics HIGH (2024 bands MEDIUM);
slsa.dev HIGH; opentelemetry.io/docs/concepts/signals HIGH; swebench.com MEDIUM. **Datasets:** github.com/rjust/defects4j;
nvd.nist.gov; cve.mitre.org; guillaumejaume.github.io/FUNSD; adamharley.com/rvl-cdip; github.com/ibm-aur-nlp/PubLayNet;
docvqa.org; github.com/alibaba/clusterdata; github.com/google/cluster-data; databank.illinois.edu/datasets/IDB-6738796;
huggingface.co/datasets/gaia-benchmark/GAIA; webarena.dev; github.com/THUDM/AgentBench; github.com/sierra-research/tau-bench;
github.com/numenta/NAB (license ambiguity); focus.finops.org (schema).

**Caveats carried forward:** the DeepSeek "12.4-min" figure is almost certainly a search-summarizer hallucination (do not
cite); OpenReview `iiZy6xyVVE`, the WeChat article, and the OWASP Agentic T-taxonomy were not loadable → NOT_VERIFIED;
DGM's 50% is on contaminated SWE-bench Verified; vendor SWE-bench-Pro leaderboard aggregates (51–62%) remain ANNOUNCED.
No score, dataset, or source in this dossier was fabricated.
