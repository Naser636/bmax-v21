# ODG V5 — CLOSEOUT & CERTIFICATION MATRIX

_Governing working reference: "ODG V5 — FINAL CLOSEOUT & CERTIFICATION PROTOCOL" (CTO-authorized autonomous closeout).
Authority order (unchanged): Master (FROZEN) → Runtime Constitution → CTO Directives → ROADMAP.json.
This document is a documentary closeout record. It creates no authority._

- **Generated (UTC):** 2026-10-05T11:52Z
- **HEAD:** `160695bd6c5b44f32626ad1437840a2250a7e16f` · **branch:** `main` · **origin/main:** `160695b` (MATCH)
- **Worktree at measurement:** clean (`odg verify` gitClean=true)

> Honesty rule applied throughout: CODE EXISTING ≠ TESTED ≠ EXECUTED ≠ PROVEN ≠ VERIFIED ≠ CERTIFIED.
> A self-report (e.g. `odg health` 100%) is registry coverage, **not** production proof (Master §174, §237.5, §237.8, Historical Failure 20).

---

## 1. BASELINE GATES (Phase 4)

| Gate | Authority | Action | Expected evidence | Result | Status |
|------|-----------|--------|-------------------|--------|--------|
| HEAD documented | CTO prompt | `git rev-parse HEAD` | = 160695b | 160695b | PROVEN |
| main == origin/main | CTO (push auth.) | push + fetch compare | equal hashes, 0/0 | equal, ahead/behind 0/0 | PROVEN |
| Worktree clean | Protocol | `git status --porcelain` | empty | empty | PROVEN |
| Official build | CTO Target 1 | `npm run build` (next build) | exit 0 | exit 0 | PROVEN |
| TypeScript | CTO Target 1 | `npx tsc --noEmit` | exit 0 | exit 0 | PROVEN |
| Test suite | Protocol | `npm test` (307 files, serial tsx) | all files exit 0 | 307/307, TEST_EXIT=0 | PROVEN |
| Runtime verify | Runtime | `odg verify --report-only` | build/ts/gitClean/docProof true | all true; 80/80 contracts valid | PROVEN |
| Runtime convergence | Runtime | `odg status` / `odg health` | converged, 0 gaps | Converged YES, 0 gaps, queue 0 exec | PROVEN |
| Capability registry | Runtime | `odg health` | caps ready / 0 missing | 151 ready / 0 missing (self-report) | CODE EXISTING (registry) |

**Baseline delta vs historical 307/307:** test-file count is now **307** (old carnet recorded 223; repo grew). 307/307 exit 0 → new baseline **confirmed and proven**, not a regression.

---

## 2. CLOSEOUT LEDGER — OBLIGATION CLASSIFICATION (Phase 2)

| # | Obligation / capability | Evidence | Classification |
|---|--------------------------|----------|----------------|
| 1 | Master restoration §169–174 / §236–237+.1–.8 | 421/421 sections, 0 gaps/dups, commit 160695b pushed | **PROVEN** (released) |
| 2 | Build / tsc / 307 tests / runtime verify | this session, all exit 0 | **PROVEN** |
| 3 | Runtime convergence (queue 0, 0 gaps) | `odg status`/`verify` | **PROVEN** |
| 4 | Claude provider live governed path | historical real runs $0.34 (commits 0edb029, a54b51b, carnet) | **PROVEN LIVE** (prior; not re-run — real spending = STOP) |
| 5 | Ollama SMALL live governed path | this session: qwen2.5:0.5b real response, usage 30+5=35 tok, cost €0 | **PROVEN LIVE** |
| 6 | Economic truth engine (observed usage, UNKNOWN≠0, price-resolution, verifyEconomics, commit-gate, adversarial) | runtime/core/economic-*.js + tests green | **PROVEN** (engine/code+tests) |
| 7 | Objective-proof (ObjectiveSpec, control.required opt-in) | src/runtime/mission-loader.ts; tests green | **PROVEN** (opt-in); universal gate **DEFERRED** |
| 8 | Recovery / idempotence / adversarial paths | economic-enforcement-adversarial, checkpoint-engine, provider negative paths in 307 suite | **PROVEN** (test level) |
| 9 | Executor / control plane (opt-in, deny-by-default, cloud allowlist) | ON_DEMAND_MODEL_ROUTING_V2 opt-in (commits cfeae71/df7aa20/75a1053) + tests | **PROVEN** (code+tests; OFF by default) |
| 10 | Ollama LARGE live chain | no large model installed | **BLOCKED BY RESOURCE** |
| 11 | OpenAI cloud live | OPENAI_API_KEY unset, codex absent | **BLOCKED BY RESOURCE** + **BLOCKED BY POLICY** (no cloud policy) |
| 12 | LM Studio live | host :1234 down | **BLOCKED BY RESOURCE** |
| 13 | Real economic mission / economic CLAIM certification | no price catalog with rate VALUES; no spending authorization | **BLOCKED BY POLICY** |
| 14 | ESM migration of CommonJS runtime | 412 `no-require-imports` (architectural) | **DEFERRED** (CTO architecture decision) |
| 15 | Universal per-objective proof gate consumption | deferred seam (opt-in only today) | **DEFERRED** (CTO frontier decision) |

---

## 3. PROVIDER CAPABILITIES (Phase 8)

| Provider | Resource present | Live result | Status |
|----------|------------------|-------------|--------|
| Claude | bin `/usr/local/bin/claude` + ANTHROPIC_API_KEY SET | prior real runs documented (not re-run) | PROVEN LIVE (historical) |
| Ollama SMALL | ollama UP, qwen2.5:0.5b | real governed inference, cost €0, exit 0 | **PROVEN LIVE (this session)** |
| Ollama LARGE | no large model | — | BLOCKED BY RESOURCE |
| OpenAI cloud | key UNSET | — | BLOCKED BY RESOURCE + POLICY |
| LM Studio | :1234 down | — | BLOCKED BY RESOURCE |

No fake providers, no fabricated credentials, no fabricated success were created.

---

## 4. LINT / DEBT CLASSIFICATION (Phase 5 — classified, NOT eliminated)

- **Total:** 420 errors, 23 warnings. Build/tsc/tests do **not** gate on lint.
- `@typescript-eslint/no-require-imports` × **412** → CommonJS runtime (runtime-core 341, runtime-bin 32). This is the **deferred ESM-migration** architecture decision, not a defect. The live CLI path is intentionally JS.
- `no-unused-vars` × 22, `no-explicit-any` × 8, parser error × 1 → minor, non-load-bearing; left untouched (no artificial green).
- **By area:** runtime-core 341 · other 46 · runtime-bin 32 · tests 13 · src-runtime 6 · scripts 3 · providers 2.

---

## 5. CONTRADICTIONS / RISKS

- **C1 (stale truth-lock):** `ODG_AUTONOMOUS_WORK_PROTOCOL.json` expects HEAD `df344f1` / branch `runtime/mission-context-builder`; reality is `160695b` / `main`. Per CLAUDE.md the JSON is a subordinate execution interface; the CTO in-prompt truth-lock (160695b/main) supersedes it. **Not a hard stop.** Release condition: human re-stamps the protocol truth-lock (protected path — needs approval).
- **C2 (self-report vs proof):** `odg health` reports 100%/SYSTEM_READY. This is registry coverage, not production certification. Recorded as CODE EXISTING, not PROVEN LIVE.
- **R1:** Live provider missions via Claude carry real spending + known provider-hang hazard → excluded from autonomous execution.
- **R2:** 3 incomplete (non-executable, no-contract) queue items exist; not counted as outstanding gaps, do not block convergence → DEFERRED.

---

## 6. CERTIFICATION LEVEL (Phase 12)

- **LEVEL 1 — LOCAL CONVERGED:** ✅ ACHIEVED (build/tsc/307 tests green, gitClean, converged, 0 gaps).
- **LEVEL 2 — RUNTIME PROVEN:** ✅ ACHIEVED (runtime verify green; autonomy e2e proven historically; **one** live governed provider path proven this session — Ollama SMALL, cost €0; Claude live historical).
- **LEVEL 3 — PRODUCTION CERTIFIED:** ❌ NOT ACHIEVED. Blockers: economic CLAIM certification (no authorized rate values / no spending policy), OpenAI + LM Studio + Ollama-LARGE live (resource/policy), universal objective-proof gate (deferred CTO decision).

**HIGHEST DEFENSIBLE CERTIFICATION: LEVEL 2 — RUNTIME PROVEN.**

---

## 7. RELEASE CONDITIONS FOR EACH BLOCKED / DEFERRED ITEM

| Item | Exact release condition (human/CTO decision required) |
|------|--------------------------------------------------------|
| Ollama LARGE | Install an authorized LARGE model + policy to run it |
| OpenAI cloud | Provide authorized OPENAI_API_KEY + explicit cloud-spending policy |
| LM Studio | Start an authorized LM Studio host |
| Economic CLAIM / real economic mission | CTO authorizes rate VALUES source + billed-cost governance + spending |
| ESM migration | CTO authorizes CommonJS→ESM runtime migration campaign |
| Universal objective-proof gate | CTO authorizes opt-in→mandatory per-objective proof consumption |
| Protocol truth-lock re-stamp | Human updates ODG_AUTONOMOUS_WORK_PROTOCOL.json (protected path) |
