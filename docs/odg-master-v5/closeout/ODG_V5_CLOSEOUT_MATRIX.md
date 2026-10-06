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
| 10a | Ollama LARGE path governance (routing/fail-closed/no-pull/unload) | OCP_V1 real run (A/B/C/D all true) | **PROVEN** |
| 10b | Ollama LARGE real large inference (full lifecycle) | CTO-authorized temp pull qwen2.5:3b: classify=LARGE→route exact→real infer(OK,7226ms,"a + b;")→validate→unload server-confirmed→rm→light state restored; 4 real negative paths pass | **PROVEN LIVE (this session)** |
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
| Ollama LARGE — path governance | ollama UP (22Gi RAM, 184G disk free) | OCP_V1 driven real: LARGE routing, fail-closed REFUSED (no downgrade, 0 calls), no pull/delete, real unload confirmed | **PROVEN (this session)** |
| Ollama LARGE — real large inference | CTO-authorized temp qwen2.5:3b | full lifecycle real: classify→route→infer(OK,7226ms)→validate→unload confirmed→rm→light state; 4 neg paths | **PROVEN LIVE (this session)** |
| OpenAI cloud | key UNSET | — | BLOCKED BY RESOURCE + POLICY |
| LM Studio | :1234 down | — | BLOCKED BY RESOURCE |

No fake providers, no fabricated credentials, no fabricated success were created.

### Ollama LARGE — detailed result (this session)

The previously **authorized** design is `ON_DEMAND_MODEL_ROUTING_V2` / `OCP_V1`
(`runtime/core/ollama-control-plane.js`). Its contract explicitly states the control plane is
**HTTP-only and never pulls/deletes/downloads** a model; the LARGE model id must be pre-provisioned via
config/env; a LARGE decision with **no large model configured ⇒ REFUSED** (fail-closed, no silent downgrade).

Real proof executed this session (drove the real module against the real local Ollama, exit 0):
- **[A]** HIGH-risk/code task ⇒ decision `tier=LARGE` (deterministic, reason+policyVersion).
- **[B]** LARGE task + no large model ⇒ `outcome=REFUSED`, `model=null`, tier stayed LARGE, **no downgrade to SMALL**, `providerCalls=0`.
- **[C]** Real inference + lifecycle against the real resident SMALL model (tier-agnostic mechanism): `OK`, 1 provider call, 2454ms, output validated, **unload requested AND server-confirmed** → `ollama ps` empty.
- **[D]** URLs touched = only `/api/chat` + `/api/generate` → **never** `/api/pull|delete|create|push|copy` (no download/install).
- **VPS light state verified:** before/after `ollama ps` empty, RAM ~21Gi free, disk 9.6G used (unchanged), SMALL model intact, Ollama healthy, repo worktree clean.

**Real large inference — RESOLVED (PROVEN LIVE this session).** Under explicit CTO authorization to determine the
minimal acquisition procedure, a genuine larger-tier model (`qwen2.5:3b`, same family, 6× the resident 0.5b) was
**temporarily** provisioned out-of-band (`ollama pull`, free, 15s), driven through the authorized OCP_V1 control
plane for a real HIGH-risk code task, then **removed** (`ollama rm`). The control plane itself never pulled/deleted
(only `/api/chat` + `/api/generate`). Measured evidence:
- classify ⇒ LARGE · route ⇒ exact `qwen2.5:3b` · real inference OK (1 provider call, 0 external, 7226ms, answer `"a + b;"`) · output validated.
- keep_alive 30s · unload requested AND **server-confirmed** ("server acknowledged unload") · `ollama ps` empty after.
- 4 real negative paths: LARGE-absent⇒REFUSED(0 calls), invalid-model⇒TRANSPORT_ERROR, cancel⇒CANCELLED, bad-output⇒VALIDATION_FAILED. No silent downgrade in any case.
- **VPS light state restored:** before/after disk 9812MB used (net 0), RAM ~21.5GB free, SMALL intact, Ollama healthy, repo clean.

**One documented judgment call:** no LARGE model identity existed in authoritative records; the CTO delegated
"détermine la procédure minimale pour le test", so `qwen2.5:3b` was selected as the minimal credible larger tier.
A permanent/production LARGE model identity remains a CTO choice; the lifecycle mechanism is now proven.

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
| Ollama LARGE (real inference) | RESOLVED — PROVEN LIVE this session via temp qwen2.5:3b (pull→use→rm). Remaining CTO choice: a permanent/production LARGE model identity + whether temp-pull becomes the standing provisioning method. |
| OpenAI cloud | Provide authorized OPENAI_API_KEY + explicit cloud-spending policy |
| LM Studio | Start an authorized LM Studio host |
| Economic CLAIM / real economic mission | CTO authorizes rate VALUES source + billed-cost governance + spending |
| ESM migration | CTO authorizes CommonJS→ESM runtime migration campaign |
| Universal objective-proof gate | CTO authorizes opt-in→mandatory per-objective proof consumption |
| Protocol truth-lock re-stamp | Human updates ODG_AUTONOMOUS_WORK_PROTOCOL.json (protected path) |

---

## 8. CAMPAIGN — MASTER METHOD SEMANTIC INTEGRATION

_CTO-authorized documentary campaign: integrate the ODG FINAL EXECUTION MASTER method into the
canonical six FICHE without duplication, regression, architectural inflation, or economic-number
pollution. Authority order unchanged. This record creates no authority._

### 8.1 Truth Lock (at execution)
- **HEAD:** `0d414fb5eef24beabaa36efcf542ed06508a749e` · **branch:** `main` · **origin/main:** `0d414fb` (MATCH) · **worktree:** clean at start
- **Canonical six FICHE (repository truth):** `docs/odg-master-v5/source/ODG_FINAL_MASTER_V5_FICHE_01..06.md` + FICHE 07 `..._FICHE_07_METHODE_DE_TRAVAIL.md`
- **Ranges verified intact:** 01=0–94 · 02=95–174 · 03=175–237 · 04=238–299 · 05=300–379 · 06=380–420 → **421 sections, contiguous, zero gaps, zero duplicate numbers.**

### 8.2 Source-authority discrepancy (surfaced, not assumed)
The FINAL EXECUTION MASTER exists **only** as two *differing, untracked, `.gitignore`-excluded,
runtime-generated* artifacts under `runtime/generated/` (`master-execution-20260905T001604Z/`
= 1020 lines, authoritative; `odg-final-execution-20260905T000850Z/` = 215-line stub). There is
**no tracked canonical copy.** The 1020-line file self-declares "take the current repository as the
only initial truth" and reproduces the Master's own 9 primitives, A01–A54, 166-reference and SUPREME
RULE verbatim → it is a **downstream projection OF this Master**, not an external upstream method.
This is why the forensic gap map is dominated by EXISTING. The 1020-line file was read in full; the
method was **not** reconstructed from memory.

### 8.3 Semantic gap map (FINAL EXECUTION MASTER concept → canonical owner → class)
| Concept (FEM) | Canonical owner already in Master | Class |
|---|---|---|
| Permanent primitives / no 10th | §230, §345, FICHE_01:1147, FICHE_02:983 | EXISTING |
| Sacred separation | §12, §302, A54 contract | EXISTING |
| Universal runtime / MSE loop | §15, §134, §295 | EXISTING |
| Workgraph (proof-carrying nodes) | **§18** (exact node field list), §411, §17 | EXISTING |
| Reality / possibility boundary (no silent promotion) | §198, §19, FICHE_04:1659, §405; "no silent" FICHE_03/05 ×8 | EXISTING |
| Consequential action transition | §415, §17, §394 | EXISTING |
| **TOCTOU / atomic context / state-version binding** | FICHE_01:1064 ("state versions prevent lost updates") + §394 (re-evaluate on state change) + §415 (actions expire; tool response cannot silently broaden) + §21 | **PARTIAL (mechanism-wording)** |
| **Tool firewall** | §394 EXECUTION ENVELOPE (allowed_tools/data/network/fs/spend/compute/time/risk/authority + "may not become broader by inference"), §415, §395, FICHE_07:80–82 | EXISTING / DUPLICATE-WORDING |
| Memory/model boundary | §22, §398, §128/§305, §260 | EXISTING |
| Evidence / proof / provenance | §19, §20, FICHE_01:1086 (Evidence≠verification) | EXISTING |
| Financial truth (flow≠capture≠rev≠cash≠profit≠capital) | §35, §405 | EXISTING |
| Economic operating method (opportunity→…→settlement) | §404, §405, §406, §409, §410, FICHE_07:118 (BASELINE→…→CONTRACTUAL RIGHT→INVOICE→COLLECTION→SETTLEMENT) | EXISTING |
| Value attribution / counterfactual | §36, §409, FICHE_07:118 | EXISTING |
| Transaction capture / cash needs collection evidence | §44, §405, FICHE_02:686 | EXISTING |
| Economic depth / frontier | §30, §235, §406 (L0–L6), §384 | EXISTING |
| Capability compounding / transfer | §142/§143, §410, §317, §135 | EXISTING |
| Failure / learning / drift | §147, §314, §370, §388, §73–97 | EXISTING |
| Verification factory / champion-challenger / generator≠judge | §19, §309, §311, §372, §373 | EXISTING |
| Reality harness / chaos | §418, §167, §258 | EXISTING |
| Self-building / successor (no self-mod of governance) | §52, §139, §321–328, §633 | EXISTING |
| Distribution | §141 | EXISTING |
| Certification (certified for proven scope) | §40, §310, §343, §19:247 | EXISTING |
| Autonomy ceiling / no self-expanding authority | §14, §416, §281, §345 | EXISTING |
| Governance / Claude cannot modify the rules that judge Claude | §148, §239, §113, §255 | EXISTING |
| Resource intelligence ladder / lightweight brain / SMALL-LARGE | §23, §24, §28, §238, §407 ("**not a rigid global ordering**") | EXISTING / DUPLICATE-WORDING |
| Control tower / metrics | §173/§280, §337, §396 | EXISTING |
| Failure policy (hard vs recoverable) | §132, §395, §417, FICHE_01:1095 | EXISTING |
| Permanent invariants | §148, §155, §144 | EXISTING |
| Execution roadmap / method / coverage / report | §192, §152, §400, 166-ref, §25-style report | EXISTING |
| Proof strength = risk×blast×uncertainty×reversibility | §19:230, §240, §241, FICHE_01:1209, FICHE_04:130 | EXISTING |
| Uncertainty first-class states | §19:231–245, §102, FICHE_01:1101 | EXISTING |
| **€55B / €15B / €40B economic targets** | — | **NOT INTEGRATED BY DESIGN** |

### 8.4 Decision — minimum sufficient integration
- **INTEGRATED (new sections):** NONE. Every FEM concept already has a verified single canonical owner.
- **REUSED:** all concepts above (EXISTING / DUPLICATE-WORDING) — retained, not duplicated.
- **NOT INTEGRATED (deliberate):** (a) €55B/€15B/€40B numeric targets — forbidden by Campaign §4/§20;
  (b) "immutable context hash" optimistic-concurrency *mechanism* — its **semantics** (lost-update
  prevention, re-evaluate-on-change, action-expiry, no-silent-broadening) already exist; per the
  SUPREME RULE ("preserve semantics, compress mechanisms") adding a mechanism name is not required;
  (c) "tool firewall" / resource-ladder-ordering / reality-possibility chains — DUPLICATE-WORDING of
  §394+§415+§395 / §407 / §19+§198+FICHE_07, retained at existing owners.
- **Range-integrity constraint:** a new numbered section is impossible without violating the
  421-section / exact-range / no-renumber invariant (Campaign §18). Confirms zero-mutation outcome.

### 8.5 Validation
- Section continuity 0–420 contiguous; 421 sections; no duplicate canonical numbers — PROVEN (inventory).
- 9 primitives unchanged; "No tenth primitive is permitted" intact (FICHE_01:1147). A01–A54 intact. 166 reference intact (FICHE_02:255 protects it).
- `git diff --name-only` → only this carnet. `git diff --check` → clean. Six FICHE + FICHE 07 byte-identical (zero edits).
- TESTS / build: **N/A — documentary campaign; zero runtime/src/tests changes** (write-set excludes code). Build/test gates do not apply to Master docs.

### 8.6 Status & next action
- **STATUS: PROVEN** — forensic comparison performed; minimum sufficient integration = reuse-only, zero Master mutation; no duplication, no new primitive, no economic-number pollution, ranges intact.
- **NEXT AUTHORIZED ACTION (exactly one, CTO-gated, optional):** If the CTO judges the explicit
  optimistic-concurrency contract (READ VERSION → AUTHORIZE SAME VERSION → EXECUTE ONLY IF UNCHANGED →
  COMMIT NEXT VERSION; else REJECT→RE-EVALUATE; bound as an immutable context hash) to be a *missing
  semantic* rather than a compressed mechanism, authorize a ≤2-line extension of the **body** of §21
  (CANONICAL DOMAIN STATE) or §415 (CANONICAL ACTION REPRESENTATION) — no new section, no renumber,
  no range change. Otherwise: **STOP at campaign gate; no further modification.** Commit/push of this
  carnet awaits explicit human authorization (Campaign §23).

---

## 9. CAMPAIGN — FINAL ECONOMIC OPERATING METHOD INTEGRATION (completeness proof)

_CTO/CDO governed campaign. Deeper, method-completeness test of the economic operating method: not a
keyword check — "can an operator follow the method from opportunity to verified economic settlement?"
Builds on §8. Authority order unchanged. This record creates no authority._

### 9.1 Truth lock (at execution)
- **HEAD:** `0d414fb` · **branch:** `main` · **origin/main:** `0d414fb` (MATCH). Worktree carried the §8 carnet edit only (` M …CLOSEOUT_MATRIX.md`); six FICHE + FICHE 07 byte-identical.
- Current project state preserved: FINAL EXECUTION MASTER supplies METHOD; this carnet/repo supplies CURRENT STATE. No historical "next campaign" claim from the FEM was allowed to regress repo state.
- Authoritative method source: same gitignored generated projection read in full in §8 (`runtime/generated/master-execution-20260905T001604Z/…`). Not reconstructed from memory. (Source-authority caveat per §8.2 stands: method source is a downstream projection OF this Master, which is why the method is already canonically present.)

### 9.2 End-to-end method completeness (FEM §7.1–7.35 → explicit canonical owner → verdict)
| FEM method chain | Explicit canonical owner(s) | Verdict |
|---|---|---|
| 7.1 Economic conversion (opportunity→…→economic right→invoice→cash→settlement) | **§36** (`BASELINE→…→CONTRACTUAL RIGHT→INVOICE→CASH→SETTLEMENT`), §37, §30 (nine layers), §404, C16 (`DEMAND→…→SETTLEMENT→…→REINVESTMENT`); "economic right" §01:72, §03:533 | EXISTING-COMPLETE |
| 7.2 Value/attribution (baseline→…→counterfactual→…→value) | §36, §409, §408 (red team), FICHE_07:118 | EXISTING-COMPLETE |
| 7.3 Financial states + FLOW≠CAPTURE≠REVENUE≠CASH≠PROFIT≠CAPITAL | §35 (definitions), §01:89/485, C16 payment states (`AUTHORIZED≠…≠RECONCILED`, incl. **DUE**) + delivery-acceptance states | EXISTING-COMPLETE (richer than FEM) |
| 7.4 Source→transformation→destination→evidence (provenance) | §20 (evidence chain: provenance/source/version), §40, C17 audit chain | EXISTING (wording variant) |
| 7.5 Mission value ladder (method, no numbers) | §275, §406 (L0–L6), §404; numeric targets excluded by design | EXISTING-COMPLETE |
| 7.6 Economic depth T1–T5 (access→value→flow→control/defensibility→capital→new access) | §30, §142/§143 (compounding + reinvestment), §140 (sovereignty/anti-cloning = defensibility/control), §141 (distribution), §410 (flywheel) | EXISTING-DISTRIBUTED |
| 7.7 Distribution modes | §141 | EXISTING-COMPLETE |
| 7.8 Economic surfaces (one ODG, not separate businesses) | §402 (general internally / value-specific commercially), §31, §403 (domain packs) | EXISTING-COMPLETE |
| 7.9 Day-1 monetization (modes, no numbers/claims) | §31 (revenue modes), §44, §437 (pricing = hypotheses) | EXISTING-COMPLETE |
| 7.10 Direct economic route (partnership not prerequisite) | §404, §141, §140 | EXISTING-COMPLETE |
| 7.11 Control tower (monitor + frontier actions) | monitor: C17 audit chain, §337, §396, §280/§173. Actions: promote/restrict/retire §52/§49, expand/scale/kill §406/§404, pause/hold/wait/do-nothing/abstain §399/§952/§287–293, distribute §141, harvest/retreat §34/§406/§410, exit §49/§140 | EXISTING-DISTRIBUTED |
| 7.12 Dependency intelligence (provider's provider; governed compute) | §397, §180, §27, C14 supply chain | EXISTING-COMPLETE |
| 7.13 Adaptive resource ladder | §407 ("not a rigid global ordering"), §23/§24/§28, §01:330, C14 | EXISTING-COMPLETE |
| 7.14 Proof-carrying workgraph (+ abstain/restrict/simulate/escalate/block) | **§18** (exact node field list), §411, §19 | EXISTING-COMPLETE |
| 7.15 Objective→outcome proof (green build ≠ proof) | §110, §19, §84/§75 (historical failures) | EXISTING-COMPLETE |
| 7.16 Consequential action integrity | §415, §17, §394, §01:1166 | EXISTING-COMPLETE |
| 7.17 TOCTOU / state versioning (read v→authorize v→execute-if-v→commit v+1) | §01:1064 (state versions prevent lost updates), §394 (re-eval on change), §415 (action expiry/no-silent-broaden) | EXISTING-PARTIAL (explicit CAS mechanism = §8.6 deferred action) |
| 7.18 Immutable execution context | §394 ("may not become broader by inference …"), §415 | EXISTING-PARTIAL (hash binding = §8.6 deferred) |
| 7.19 Tool firewall | §394 (envelope), §415, §395, FICHE_07:80–82 | EXISTING |
| 7.20 Evidence→proof→verified state | §19, §20, §40, FICHE_01:1086 | EXISTING-COMPLETE |
| 7.21 Uncertainty model (known/unknown/uncertain/conflicted/stale/unverified) | §19 (states), §102, §01:1101 | EXISTING-COMPLETE |
| 7.22 Hypothesis/forecast (no silent promotion) | §198, FICHE_04:1659 (governance stack), FICHE_07:103 | EXISTING-COMPLETE |
| 7.23 Reality states | §36/C16 chains, §01:132 universal loop | EXISTING-COMPLETE |
| 7.24 Forecasting/optionality + forecast-vs-reality calibration | §41 (signal engine), §211, §39; calibration §396 (known_biases), §408 | EXISTING (calibration distributed) |
| 7.25 Failure/learning (+ attribution classes) | §147, §314, §73–97, §39 | EXISTING-COMPLETE |
| 7.26 Drift (detect→…→restrict/replace/promote) | §370, §228 | EXISTING-COMPLETE |
| 7.27 Memory tiers + world model | §22, §387, §398, §01:1061 (lifecycle) | EXISTING-COMPLETE |
| 7.28 Attention/hot state | §165 (event-driven escalation), §247, §387 | EXISTING |
| 7.29 Living operator loop (no separate physical runtime) | §138, §01:132 (`PERCEIVE→…→COMPOUND`) | EXISTING-COMPLETE |
| 7.30 Autonomy levels + ceiling + abstention | §14, §416, §281, §399, §344 | EXISTING-COMPLETE |
| 7.31 Security (distributed, not 2nd constitution) | §136, §395, FICHE_04:1599, C-security | EXISTING-COMPLETE |
| 7.32 Self-engineering (defect→…→promote; Claude can't modify its judges) | §139, §321–328, FICHE_04:1665, §634-equiv | EXISTING-COMPLETE |
| 7.33 Engineering contract | §112–131, §158–166, FICHE 07, FICHE_04:1665 (Rule Zero) | EXISTING-COMPLETE |
| 7.34 Campaign law (only VERIFIED unlocks next) | §106, §105, §152 | EXISTING-COMPLETE |
| 7.35 Checkpoint contract + ledgers | §124, FICHE 07; no separate tracked ledger files exist → this carnet is the documentary record | EXISTING-COMPLETE |

### 9.3 Completeness verdict (the real test)
**An operator CAN follow the full method end-to-end** — `OPPORTUNITY→ACCESS→AUTHORITY→CONTRACT→EXECUTION→BASELINE→INTERVENTION→OBSERVED CHANGE→COUNTERFACTUAL→MEASUREMENT→ATTRIBUTION→VERIFICATION→VERIFIED VALUE→ECONOMIC RIGHT→INVOICE→CASH→SETTLEMENT` (owners: §30→§13/§404→§17→§404/§405→§36→§36/§409→§37→§36→C16), the compounding/control continuation (§142/§143/§140/§141/§410/C16-REINVESTMENT), forecast→reality→calibration (§41/§211/§396/§408), failure→root-cause→recovery→prevention→regression (§147/§39/§73–97), and campaign→…→gate (§106/§152). No required transition is absent.

### 9.4 Decision
- **INTEGRATED (new content in the six FICHE):** NONE — every method chain already has an explicit canonical owner; the economic method is present and in several places (§35/§36/C16) more complete than the FEM projection.
- **REUSED:** all chains above.
- **DELIBERATELY NOT INTEGRATED:** (a) €55B/€15B/€40B and all FEM numeric targets — forbidden §8; the Master's own pre-existing pricing examples (§31/§437, already qualified as "hypotheses, not forecasts") are left untouched (non-regression — not mine to delete or add to); (b) T4 "control point/defensibility" and the frontier portfolio-verb *menu* as verbatim vocabulary — EXISTING-DISTRIBUTED, adding labels is not adding method (Campaign §10: word-similarity ≠ semantic duplication, and its converse); (c) the explicit TOCTOU compare-and-swap / context-hash *mechanism* — semantics present, mechanism compressed (SUPREME RULE) — carried as the single deferred CTO action from §8.6.
- **No new canonical section was necessary** → no §3/§17 STOP triggered.

### 9.5 Non-regression proof
421 sections, ranges 0–94/95–174/175–237/238–299/300–379/380–420 intact; 9 primitives + "no tenth" intact (§01:1147); 166 reference intact (§02:255); A01–A54 intact (incl. governance stack FICHE_04:1659); no economic numbers added; `git diff --name-only` = this carnet only; six FICHE + FICHE 07 byte-identical; zero runtime/src/tests/providers/package changes; no authority or security boundary touched.

### 9.6 Status & next action
- **STATUS: GREEN** — complete economic operating method verified already canonically represented without regression; integration requirement satisfied by proven reuse; zero FICHE mutation, zero economic numbers, zero architecture impact.
- **NEXT AUTHORIZED ACTION (exactly one, carried from §8.6, CTO-gated, optional):** CTO decides whether the explicit optimistic-concurrency contract (`READ v → AUTHORIZE v → EXECUTE IF STILL v → COMMIT v+1`; else `REJECT→RE-EVALUATE`; immutable context hash) is a *missing semantic* warranting a ≤2-line body extension of §21 or §415 (no new section, no renumber) — or STOP at the gate. Commit/push awaits explicit human authorization (Campaign §16).

---

## 10. CTO FINALIZATION — TOCTOU / STATE-FRESHNESS DETAIL CLOSED

_CTO finalization command: decide whether the canonical Master already expresses the TOCTOU/
state-freshness contract sufficiently for the complete method; if yes, make no Master change._

### 10.1 Direct inspection (exact canonical text, not prior report)
Read verbatim: §21 (CANONICAL DOMAIN STATE, FICHE_01:266–285), §415 (CANONICAL ACTION
REPRESENTATION, FICHE_06:1025–1045), and the state-contract block **C03/C05/C06** (FICHE_01:1063–1086).
The prior "PARTIAL" rested on a missing *mechanism token*; direct inspection located the explicit
optimistic-concurrency contract in **C05** that the earlier audit had not isolated.

### 10.2 Four required meanings → explicit canonical owner
| # | Required meaning | Explicit canonical text | Verdict |
|---|---|---|---|
| 1 | Authorization bound to a known state/version | **C03** `state_transition` *requires* `state_version_before` + `state_version_after` bound to `entity_id`/`action_id`; "State versions prevent lost updates" (FICHE_01:1064–1077); §21 `STATE0→ACTION→STATE1→VERIFY→STATE2` + declared inputs/invariants | EXPLICIT |
| 2 | Valid only if state unchanged since authorization | **C05** "version checks, **compare-and-set/atomic transitions** where required, conflict detection" (FICHE_01:1083); C03 lost-update prevention | EXPLICIT |
| 3 | Stale authorization must not proceed | **C06** freshness `FRESH/STALE/EXPIRED/UNKNOWN` (FICHE_01:1086); **§415** "Actions expire when their authority, scope or temporal assumptions expire; a tool response cannot silently broaden an Action"; **§394** envelope re-evaluated on state change | EXPLICIT |
| 4 | Reject / re-evaluate rather than silently execute against changed state | **C05** "conflict detection … or an explicit conflict owner"; §415/§394 re-evaluation; Master-wide "no silent action/promotion" doctrine (FICHE_03/05 ×8) | EXPLICIT |

### 10.3 Decision
- **TOCTOU DETAIL = ALREADY CANONICALLY COMPLETE.** All four meanings are explicit (C03 + C05 + C06 + §415 + §394). The requirement is METHOD/CONTRACT, which is present; a specific mechanism (immutable hash / mandatory CAS architecture) is deliberately **not** added (CTO §3 forbids implementation-recipe additions; the SUPREME RULE compresses mechanisms).
- **MASTER CHANGED: NO.** Zero FICHE mutation. No new section, no renumber, no new terminology, no new primitive/runtime/authority/governance layer.
- The §8.6/§9.6 carried-forward optional action is hereby **CLOSED as not-required**; no residual next campaign.

### 10.4 Non-regression (re-verified)
421 sections (0–420), ranges intact, no gaps/dups/renumber; 9 primitives + "no tenth" (§01:1147) intact; 166 reference (§02:255) intact; A01–A54 (incl. C01–C08 contract block + governance stack FICHE_04:1659) intact; 35 method chains still owned (§9.2); no economic numbers added; no other FICHE changed; zero runtime/src/tests/providers/package changes; no security/authority boundary changed.

### 10.5 Final verdict
**STATUS: GREEN.** Complete economic operating method verified canonically represented; the sole residual method detail (TOCTOU/state-freshness) is proven already explicit; no Master change required.

**ECONOMIC OPERATING METHOD INTEGRATION: COMPLETE.**

---

## 11. RUNTIME REPAIR LOG — FIX_EVIDENCE_RUN_OWNERSHIP_V1

_Recorded here per CTO option A (the on-main closeout record). `ODG_STABILIZATION_5RC_CLOSURE.md`
is not on `main` (it lives only on the unmerged `stabilization` branch / locked worktree), so this
existing matrix is the authorized home; no new repair-history document was created._

- **Date (UTC):** 2026-10-06
- **Work item:** FIX_EVIDENCE_RUN_OWNERSHIP_V1 (defect repair; discovery-authorized)
- **Defect:** `src/runtime/objective-evidence.ts` evidence predicate `defaultEvidenceExists` counted an
  artifact as present on `fs.statSync(p).size > 0` alone — with (a) no run-ownership/freshness binding and
  (b) no regular-file check (a directory is ~4096 B on Linux ⇒ passed).
- **Reproduction:** `runtime/generated/` is git-ignored and never cleared on the LOCAL route. A stale
  `*.json` left by a prior/unrelated run satisfied an engineering mission's declared `verify[].evidence`
  gate (`objective-evidence.ts:95,100-102`), driving `proof=PASS → report SUCCESS → validated=true →
  mission-ledger proven` with NO capability executed this run. A `verify[].evidence` path resolving to a
  directory likewise passed.
- **Root cause:** evidence existence was conflated with evidence ownership; the predicate asserted only
  size>0 and did not bind the artifact to the current run nor require a regular file.
- **Files touched:** `src/runtime/objective-evidence.ts` (repair), `src/runtime/objective-evidence.ownership.test.ts`
  (new regression), this matrix (record). No other file; no execution wiring; no authority/architecture change.
- **Repair:** replaced `defaultEvidenceExists` with `makeEvidenceExists(runStartedAtMs?)` — rejects
  non-regular files (`!st.isFile()`) and empty files unconditionally, and when the current run's start time
  is supplied via the new optional `ObjectiveEvidenceInput.runStartedAtMs`, requires `st.mtimeMs >=
  runStartedAtMs` (stale artifact ⇒ rejected). Backward-compatible when `runStartedAtMs` is absent
  (regular-file + non-empty only). Freshness enforcement is DORMANT until a future, separately-authorized
  one-line caller change in `runtime-executor.ts` passes the run start (that file is out of this write-set;
  execution wiring deliberately deferred).
- **Tests:** `objective-evidence.ownership.test.ts` — 11/11 (directory fails both modes, empty fails, missing
  fails, legacy valid passes, fresh passes, stale fails; assess() end-to-end STALE⇒FAIL / FRESH⇒PASS /
  DIRECTORY⇒FAIL / read-only-compat⇒PASS). Existing `objective-evidence.test.ts` still green (ROOT CAUSE #1
  gate compat). `npx tsc --noEmit` exit 0. `runtime/core/*.test.js` 60/60.
- **Evidence:** test output + `git status --porcelain` showing exactly the three files below.
- **Before/after:** BEFORE — stale leftover or directory ⇒ evidence counted ⇒ engineering mission PASS by
  construction. AFTER — directory/empty never qualify (active now); with a run start time, only this-run
  artifacts qualify ⇒ stale leftovers can no longer manufacture SUCCESS.
- **Limitations:** freshness is dormant until the caller passes `runStartedAtMs`; the directory/empty
  hardening is active immediately. Known vacuous-coverage / double-recompute / discarded-plan defects remain
  out of scope. Honesty rule applies: this repair is **VERIFIED** (tested green), not CERTIFIED.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 27. RUNTIME REPAIR LOG — FIX_PROVIDER_VALIDATION_PROBE_FRESHNESS_V1 (P0-070)

- **Date (UTC):** 2026-10-06
- **Work item:** P0-070 / FIX_PROVIDER_VALIDATION_PROBE_FRESHNESS_V1 (defect repair; adversarial V11-authorized).
- **Genuine demonstrated false-positive (V11):** on the PROVIDER route a VALID but STALE probe artifact left
  by a prior mission/run made the REAL `validation-engine.js` return `SUCCESS/validated=true` ⇒ PROVEN/ledger
  admission. Root cause: the provider route (`autonomy-runtime-adapter.ts`) never wrote
  `pipeline-checkpoint.json`, so VE derived `runStartedAtMs=undefined` (`validation-engine.js:137-141`) and the
  two freshness-bearing probes (`clean-workspace-scanned`, `external-research-dry-run-planned`) fell back to
  content-only (`capability-probes.js:103,142`). LOCAL/MSE routes already supply the token; the provider route did not.
- **Invariant restored:** a prior-run `clean-workspace-scanned` / `external-research-dry-run-planned` artifact
  (mtime < this run's start) MUST NOT satisfy the current provider validation when freshness is required.
- **Minimal repair (`src/runtime/autonomy-runtime-adapter.ts` only):** reuse the EXISTING per-run token — the
  provider seam now writes the SAME mission-scoped `runtime/generated/pipeline-checkpoint.json`
  `{mission, startedAt}` that `checkpoint-engine.begin` writes on the LOCAL route, captured once at the provider
  run start (`new Date().toISOString()` — NO second timestamp source), right before spawning VE. VE is UNCHANGED
  ⇒ LOCAL/MSE behaviour byte-for-byte identical. Deny-safe pure helper `providerRunStartCheckpoint` returns null
  when the mission identity/run start is absent, so an unknown run writes no checkpoint and VE keeps content-only
  (never a fabricated-fresh run). Mission identity + provider attribution unchanged; no new authority introduced.
- **Causal regression (`src/runtime/provider-probe-freshness.test.ts`, drives the REAL `validation-engine.js`):**
  for BOTH freshness probes — **A** stale prior artifact + current provider run ⇒ **BLOCKED** (was SUCCESS pre-fix);
  **B** artifact absent ⇒ **BLOCKED**; **C** artifact fresh for this run ⇒ **SUCCESS** (all other predicates pass).
  Plus deny-safe unit on the helper (missing mission / missing start ⇒ null) and a mission-identity-binding
  assertion (VE's mission-match guard ignores a foreign-mission checkpoint). Deterministic (artifact mtimes set
  explicitly relative to run start); 14/14 PASS, verified stable across 5 consecutive runs.
- **Full regression:** `npx tsc --noEmit` exit 0; `runtime/core/*.test.js` 61/61; LOCAL/MSE freshness
  (`validation-engine-probe-freshness`), provider (`provider-attribution`, `provider-verify-propagation`),
  `objective-proof-gate`, `validation-engine-recorded-noop`, `mission-ledger-idempotent` all PASS; full `npm test`
  **exit 0** (no `not ok`). Pristine-HEAD `npm test` confirmed green before the repair (no new red introduced).
- **Exact files changed:** `src/runtime/autonomy-runtime-adapter.ts` (seam: constant + exported deny-safe helper +
  mission-scoped checkpoint write before VE), `src/runtime/provider-probe-freshness.test.ts` (new regression),
  this matrix (record). No `validation-engine.js`, `capability-probes.js`, or other runtime/gate/contract change.
- **Final state:** VERIFIED. Closes the V11 provider freshness residual (GENUINE GAP) — the provider route now
  enforces the same run-ownership freshness as LOCAL/MSE; a stale cross-run/cross-mission artifact can no longer
  produce an authoritative SUCCESS/PROVEN on the provider route.

---

## 26. SKILL GRADE DECISION — GOVERNED_TEST_PROOF_ANALYSIS (NO PROMOTION)

- **Date (UTC):** 2026-10-06
- **Decision:** Governed TESTED→CERTIFIED promotion assessment of the Skill `GOVERNED_TEST_PROOF_ANALYSIS`
  (`docs/SKILL_GOVERNED_TEST_PROOF_ANALYSIS_v1.md`). **Outcome: NOT PROMOTED — remains TESTED.**
- **Criteria reviewed (read-only):** Skill doc §7 (lines 93–117) defines ONLY the CANDIDATE→TESTED test
  (already earned) and explicitly defers certification as "a separate lifecycle step requiring broader
  evidence and scope … e.g. sustained use across the roadmap and across modules beyond the LOCAL
  execution/validation surface"; Master `ODG_FINAL_MASTER_V5_FICHE_06.md` lines 465–483 fixes the canonical
  lifecycle `… TESTED → VERIFIED → CERTIFIED FOR SCOPE …` with `TESTED ≠ VERIFIED ≠ CERTIFIED`; this matrix
  §22 line 452–453 records "no existing certification criterion beyond the already-earned TESTED evidence."
- **Criteria UNMET (exactly):** (1) **No documented TESTED→CERTIFIED criterion exists** for this Skill —
  promotion would require inventing a bar (forbidden). (2) **Intervening VERIFIED grade skipped** — the Skill
  is TESTED, never promoted to VERIFIED (per-work-item "VERIFIED" statuses concern the closures, not the
  Skill grade). (3) **The doc's own informal bar is unmet** — all five recorded applications sit on the LOCAL
  execution/validation surface (validation-engine, local-mission-runner, mission-cli, economic-enforcement,
  local-resolver-allocator); no cross-module breadth is recorded. The verified **P0-069** closure is a
  canonical-state/state-transition certification, NOT a recorded GOVERNED_TEST_PROOF_ANALYSIS gap-closure, so
  it does not broaden the surface. (4) Certification is **FOR SCOPE** (Master line 471) — no certified scope
  defined or authorized.
- **No criterion invented or relaxed.** Honesty rule upheld: `TESTED ≠ VERIFIED ≠ CERTIFIED`.
- **Action:** **NO PROMOTION.** Skill document UNCHANGED; no runtime change; no new document; no Skill-doc
  edit. This matrix entry is the sole record of the decision.
- **Files touched:** `docs/odg-master-v5/closeout/ODG_V5_CLOSEOUT_MATRIX.md` (this record only).
- **Status:** Grade decision recorded; Skill lifecycle remains **TESTED** (not CERTIFIED).

---

## 25. RUNTIME REPAIR LOG — FIX_VALIDATION_ENGINE_PROBE_FRESHNESS_V1

- **Date (UTC):** 2026-10-06
- **Genuine demonstrated defect:** `validation-engine.js` evaluated the freshness-bearing capability probes
  (`clean-workspace-scanned`, `external-research-dry-run-planned`) with ctx `{ missionId, verify }` — **no
  `runStartedAtMs`**. The run-ownership branch (`capability-probes.js:101-109,140-148`) only fires when that
  field is a finite number, so on the canonical mse engineering route the freshness protection
  (ADD_PROBE_RUN_OWNERSHIP_V1) was INERT. `runtime/generated/` is never cleared, so a valid prior-run
  artifact persisted and satisfied the proof. Two REAL non-migrated ENGINEERING missions depend on these
  probes (`CLEAN_RUNTIME_WORKSPACE`, `EXTERNAL_RESEARCH_DRYRUN_PROBE`); the LOCAL route already wired
  `runStartedAtMs` (`runtime-executor.ts:96,131`), the mse route did not (asymmetry).
- **Exact causal reproduction (read-only, pre-repair):** drove the real `node runtime/core/validation-engine.js`
  in an isolated temp cwd with a structurally-valid `clean-workspace-scan.json` stamped mtime 1 h in the past
  ⇒ `status=SUCCESS, validated=true, capabilitiesOk=true`, probe falsely reporting "scanned this run".
  Causal isolation on the same artifact: `probes.evaluate` WITHOUT `runStartedAtMs` ⇒ ok=true (accepted);
  WITH `runStartedAtMs=now` ⇒ ok=false "stale … not produced this run". The missing wiring was the sole cause.
- **Minimal repair (`runtime/core/validation-engine.js`):** derive `runStartedAtMs` from the EXISTING
  mission-matched `pipeline-checkpoint.startedAt` (no new timestamp source; same mission-match guard as
  `mission-ledger.js:126-129`) and thread it into both `probes.evaluate(...)` and
  `probes.evaluateObjectiveProofs(...)`. Untrusted/mismatched checkpoint ⇒ `undefined` ⇒ probes keep
  content-only behaviour (backward-compatible). `capability-probes.js` and all other gates UNCHANGED.
- **Real choke-point integration test (`src/runtime/validation-engine-probe-freshness.test.ts`):** drives the
  REAL `validation-engine.js` (not `runProbe`) in a throwaway git repo with every non-probe gate satisfied so
  the probe is the SOLE decider. STALE scan (mtime < checkpoint.startedAt) ⇒ BLOCKED/validated=false/exit 1,
  capabilitiesOk=false; FRESH scan (mtime > startedAt) ⇒ SUCCESS/validated=true/exit 0. 5/5 PASS.
- **Verification evidence:** focused 5/5 PASS; regression green — `capability-probes` 47 assertions,
  `objective-evidence.ownership` 11 assertions, `validation-engine-recorded-noop`, `objective-proof-gate`,
  `provider-verify-propagation`, `mission-ledger-{proven-gate,controlled,economic,idempotent}`,
  `local-mission-runner-ledger` all ALL PASS; full `npm test` **exit 0** (326 files, 53 ALL PASS);
  `npx tsc --noEmit` exit 0.
- **Exact files changed:** `runtime/core/validation-engine.js` (+~11, probe ctx wiring only),
  `src/runtime/validation-engine-probe-freshness.test.ts` (new integration test), this matrix (record).
- **No unrelated changes:** no `capability-probes.js`, no other gate, no contract/vnext/authority/registry
  change; the runtime diff is exactly the two probe-ctx call sites + the checkpoint-derived run start.
- **Status:** VERIFIED. (No Skill promoted.)

---

## 24. TEST-COVERAGE CLOSURE — DISCOVER_LEDGER_REPLAY_IDEMPOTENCE_V1

- **Date (UTC):** 2026-10-06
- **Work item:** DISCOVER_LEDGER_REPLAY_IDEMPOTENCE_V1 (read-only governed discovery of ledger replay,
  duplicate submission, and idempotence integrity on the official LOCAL/admission path that reproduced ONE
  genuine gap and landed a minimal test-only closure). Applied `GOVERNED_TEST_PROOF_ANALYSIS`.
- **Gap reproduced:** the **successful APPEND path** of `recordMission` — a second LEGITIMATE admission of the
  same mission under a DISTINCT run (count 1 → 2) — was asserted **only by ledger count**
  (`mission-ledger-idempotent.test.ts` case 2: `ledgerCount(dir) === 2`), never by **preservation of the
  prior accepted record**. `recordMission` reads the existing entries then pushes
  (`runtime/core/mission-ledger.js:176,190`) and never rewrites a prior one, but no test inspected
  `entries[0]` after the second append. The sibling corrupt/unreadable REFUSE branch was already locked at
  §23 (DISCOVER_LEDGER_IMMUTABILITY_BOUNDARY_V1); the normal APPEND branch was not.
- **Why count-only coverage was insufficient:** a count check inspects a single integer. A regression that
  mutated, relabelled, re-timestamped, re-sorted or in-place-rewrote `entries[0]` while still producing
  count 2 would pass unnoticed. Count-only therefore does NOT prove the direct runtime answers to "can a
  second submission overwrite/mutate the first accepted record?" (NO) or "can replay create two
  contradictory authoritative outcomes?" (NO) — it is vacuous w.r.t. prior-entry integrity.
- **Coverage classification:** same-run dedup (`DUPLICATE_RUN`, count unchanged) = **direct** (idempotent
  case 1; controlled case 9); distinct-run count = **direct-on-count** (case 2); stale/foreign checkpoint ⇒
  append-always = **direct** (case 5); gates-run-before-dedup (no replay bypass) = **direct** (proven-gate /
  controlled / economic / failclosed suites); corrupt-REFUSE immutability = **direct** (case 6); **success-path
  append-only prior-entry preservation = genuinely uncovered** (the reproduced gap). All replay cases drive
  the REAL `recordMission` — the single admission choke point every route (pipeline stage, autonomy archive,
  LOCAL adapter) calls — so the coverage is at the authoritative seam, not a vacuous unit mock.
- **Minimal closure (test-only):** added one case (case 7, 3 assertions) to the EXISTING
  `src/runtime/mission-ledger-idempotent.test.ts`, reusing its `sandbox`/`writeReport`/`writeCheckpoint`/
  `recordIn` harness. It records run 1, snapshots `entries[0]`, records a DISTINCT run 2, then asserts:
  (1) 2 entries (append — the first is not dropped); (2) `entries[0]` is preserved **field-for-field** vs the
  frozen snapshot (append-only, not mutated/relabelled); (3) `entries[1]` is the **new distinct run 2**
  (`runId` = the second token, ≠ `entries[0].runId`) — not a rewrite of the first (no contradictory outcome).
  No runtime/production file changed; no new test file.
- **Tests:** `mission-ledger-idempotent.test.ts` **14/14 PASS** incl. the 3 new assertions; ledger/local-runner
  regression green — `mission-ledger-proven-gate` / `mission-ledger-controlled` / `mission-ledger-economic` /
  `mission-ledger-failclosed` / `mission-ledger-label` / `local-mission-runner-ledger` all ALL PASS; full
  regression `npm test` **exit 0** — **325 test files**, **52 `ALL PASS` banners**, no genuine failures;
  `npx tsc --noEmit` exit 0.
- **Files touched:** `src/runtime/mission-ledger-idempotent.test.ts` (+26, test-only), this matrix (record).
  No runtime, contract, vnext, Resolver/Allocator/authority/Profile/Instance/registry/learning change.
- **Capability development (GOVERNED_TEST_PROOF_ANALYSIS):** another successful genuine-gap + minimal
  test-only closure application. The skill remains **TESTED** (the grade earned at §22); this application does
  **not** promote it to CERTIFIED — no existing certification criterion beyond the already-earned TESTED
  evidence is satisfied by this closure alone.
- **Status:** VERIFIED, not CERTIFIED.
- **Release state:** committed and pushed to `origin/main`; working tree clean (commit SHA recorded with the
  commit below).

---

## 23. TEST-COVERAGE CLOSURE — DISCOVER_LEDGER_IMMUTABILITY_BOUNDARY_V1

- **Date (UTC):** 2026-10-06
- **Work item:** DISCOVER_LEDGER_IMMUTABILITY_BOUNDARY_V1 (read-only governed coverage analysis that
  reproduced ONE genuine gap and landed a minimal test-only closure). Applied `GOVERNED_TEST_PROOF_ANALYSIS`.
- **Gap reproduced:** the mission-ledger append-only **immutability boundary** — an existing but
  corrupt/unreadable `mission-ledger.json` — was **covered by no test**. The runtime behavior at
  `runtime/core/mission-ledger.js:167-177` already correctly refuses to overwrite an unreadable ledger
  (`readJsonSafe` ⇒ `null` ⇒ `console.warn(...)` ⇒ `return { skipped: true, entry }`, BEFORE the write at
  line 190+), preserving past evidence even for an otherwise-proven mission. The invariant was correct but
  **unasserted**; a grep of all `src/runtime/*.test.ts` found no other test exercising this branch.
- **Coverage classification:** the corrupt/unreadable-ledger immutability branch of `recordMission` on the
  live path = **genuinely uncovered** (the reproduced gap). Existing runtime behavior was correct and was
  **not** changed; the audit premise was NOT stale and the fix is test-only.
- **Minimal closure (test-only):** added one case (case 6) to the EXISTING
  `src/runtime/mission-ledger-idempotent.test.ts`. It writes a proven report (passes the proven-only gate),
  writes a corrupt (non-JSON) existing ledger, then records. Asserts: (1) a corrupt existing ledger causes
  `recordMission` to **skip** (`skipped === true`, append refused); (2) the existing ledger remains
  **byte-for-byte unchanged** (past evidence NOT overwritten). No runtime/production file changed; no new
  test file.
- **Tests:** `mission-ledger-idempotent.test.ts` **11/11 PASS** incl. the 2 new assertions; full regression
  `npm test` **exit 0** — **325 test files**, **52 `ALL PASS` banners**, no genuine failures (the `FAIL`/
  `Error:` strings in output are expected fail-closed assertion labels and an intentional quarantine-sandbox
  negative path).
- **Files touched:** `src/runtime/mission-ledger-idempotent.test.ts` (+16, test-only), this matrix (record).
  No runtime, contract, vnext, Resolver/Allocator/authority/Profile/Instance/registry/learning change.
- **Capability development (GOVERNED_TEST_PROOF_ANALYSIS):** another successful genuine-gap + minimal
  test-only closure application. The skill remains **TESTED** (the grade already earned at §22); this
  application does **not** by itself change that grade to CERTIFIED.
- **Status:** VERIFIED, not CERTIFIED.
- **Release state:** commit `176fe0d`, pushed to `origin/main`; working tree clean.

---

## 22. TEST-COVERAGE CLOSURE — DISCOVER_RUNTIME_EXECUTOR_DISPATCH_COVERAGE_V1

- **Date (UTC):** 2026-10-06
- **Work item:** DISCOVER_RUNTIME_EXECUTOR_DISPATCH_COVERAGE_V1 (read-only governed coverage analysis that
  reproduced ONE genuine gap and landed a minimal test-only closure). Applied `GOVERNED_TEST_PROOF_ANALYSIS`.
- **Gap reproduced:** the LOCAL dispatch invariant documented at `src/runtime/runtime-executor.ts:91-92`
  ("a capability that throws propagates and fails the mission closed — LocalMissionRunner records nothing, no
  ledger write") was **asserted by no test on the live path**. Existing coverage proved "no producer"
  (unmatched objective ⇒ no dispatch ⇒ probe-absent FAILED, recorder still called with validated=false:
  clean-workspace/external-research case 2 + ledger case B) and "producer succeeds" (case 1), but **not**
  "producer FAILED (threw)". The executor dispatch (`runtime-executor.ts:108`) has no try/catch, so a producer
  throw propagates out of `kernel.execute`; `LocalMissionRunner.run` catches it and returns `{ok:false,error}`
  BEFORE `recordLedger` is reached — a path with zero existing assertions.
- **Coverage classification:** "no producer" = **end-to-end covered**; "producer succeeds" = **end-to-end
  covered**; unit producer-throw (`capability-executors.test.js:112-119`) = **direct (producer in isolation)**;
  "producer failed ⇒ ok:false ⇒ no ledger write" on the LocalMissionRunner path = **genuinely uncovered**
  (the reproduced gap). The audit premise was NOT stale and the existing coverage was NOT vacuous.
- **Minimal closure (test-only):** added one case (D, 3 assertions) to the EXISTING
  `src/runtime/local-mission-runner-ledger.test.ts`, reusing its injected-kernel + spy-recorder idiom (case B
  injects a kernel that RETURNS FAILED; case D injects one that THROWS). Asserts: throwing execution ⇒
  `ok:false`; the failure message is propagated; the ledger recorder is **NEVER** called (records nothing).
  Layer note: RuntimeExecutor's propagation is structural (no try/catch at the dispatch); this case locks the
  runner's fail-closed + no-ledger-write contract. No runtime/production file changed; no new test file.
- **Tests:** `local-mission-runner-ledger.test.ts` all PASS incl. the 3 new assertions; regression green —
  `local-mission-runner.expert` 6/6, `runtime-executor.clean-workspace` 5/5, `runtime-executor.external-research`
  5/5, `runtime-executor.plan-reuse` 3/3, `mission-cli-local-exit` PASS, `capability-executors.test.js` 31/31;
  `tsc --noEmit` exit 0.
- **Files touched:** `src/runtime/local-mission-runner-ledger.test.ts` (+18, test-only), this matrix (record).
  No runtime, contract, vnext, Resolver/Allocator/authority/Profile/Instance/registry/learning change.
- **Capability development (GOVERNED_TEST_PROOF_ANALYSIS) — PROMOTION EVIDENCE:** this is the **third
  independent application** and the **second** that both (1) reproduced a genuine coverage gap and (2) landed a
  verified minimal test-only closure (the first was FIX_VALIDATION_ENGINE_FAILED_ACTION_TEST_V1; the
  disprove-as-benign branch is separately evidenced by DISCOVER_MISSION_CLI_DISCARDED_PLAN_V1 /
  DISCOVER_ECONOMIC_ENFORCEMENT_RUNTIME_ACTIVATION_V1 / DISCOVER_LOCAL_RESOLVER_ALLOCATOR_ACTIVATION_V1).
  Mirroring the sibling skill's two-independent-instances convention, the **evidence now satisfies
  CANDIDATE → TESTED**. The Skill-document flip to TESTED is a **separate authorized documentation action**
  (not performed here); this entry records that the promotion evidence is earned.
- **Status:** VERIFIED, not CERTIFIED.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 21. DOCUMENTATION CLOSEOUT — DISCOVER_LOCAL_RESOLVER_ALLOCATOR_ACTIVATION_V1 (NO ACTION)

- **Date (UTC):** 2026-10-06
- **Work item:** DISCOVER_LOCAL_RESOLVER_ALLOCATOR_ACTIVATION_V1 (read-only discovery; no-action closeout).
- **Question:** is the Resolver (`capability-router.js`) / Allocator (vnext `resource-allocation-engine.ts`)
  absence from the official LOCAL `src/runtime` execution path a defect, a disconnected capability, or an
  intentional staged/semantic state?
- **Finding — Resolver:** `runtime/core/capability-router.js` is the canonical tier-router
  (Memory → Rules → Local LLM → External AI, last resort). It is **live and tested** — imported by
  `runtime/core/nl-objective-gateway.js` (dry-run NL projection) and `runtime/core/local-autonomy.js`
  (P8 stack), with its own `capability-router.test.js`. It has **zero `src/runtime` importers**, but that
  is **intentional semantic separation, not a defect**: the official LOCAL path answers a different
  question at a different layer.
- **Finding — LOCAL dispatch:** `RuntimeExecutor` (`src/runtime/runtime-executor.ts`) selects a capability
  via `capability-executors.resolve(patch)` — a **deterministic objective → producer dispatch** matching on
  `objectiveId` prefix (`CLEAN_WORKSPACE_`, `EXTERNAL_RESEARCH_`, `GIT_BRANCH_INTEGRATION`, `BASH_COMMAND`,
  …). This is **NOT a Resolver bypass**: it picks the concrete producer an already-named objective requires,
  whereas the tier-Resolver picks a *source/tier* for a fix. The read-only LOCAL route has no fix-routing
  decision to make, so it needs this seam, not the tier-Resolver. The dispatch introduces no authority (each
  producer carries its own governance).
- **Finding — Allocator / vnext:** `src/runtime/vnext/resource-allocation-engine.ts` (and the wider vnext
  Goal/Strategy/Resource/Constitution layer) are **RECOGNIZED_INACTIVE**: `runtime/config/vnext.json` ships
  `enabled:false` with every feature false; `src/runtime/vnext/activation.ts` is default-OFF, master-gated,
  **Kernel-isolated** ("Nothing in the Runtime calls this module today; it is the prepared seam for a FUTURE
  wiring. Present behavior is strictly identical."). There is **no non-test LOCAL caller** of the Allocator,
  and the LOCAL route requires no resource/provider allocation. This is an **intentional staged capability**,
  already documented in `runtime/architecture/VNEXT_ACTIVATION.md` (R1 = wire `withVNext` into a *future
  optional* `odg goal`, never the current `odg`/`odg autonomy` path) and §13's limitation note
  ("Resolver/Allocator still off-path").
- **Classification:** Resolver / LOCAL-dispatch = **E (documentation/semantic mismatch — the audit conflated
  "no `src/` importer" with "disconnected")**; Allocator / vnext = **C (intentional staged capability)**. No
  **A (real defect)**, no **B (test-coverage gap)** (both components are tested), no **D (dead capability)**
  (the Resolver is live elsewhere; the Allocator is a recognized, prepared, inactive seam).
- **No correctness/security/governance defect reproduced.** Activating either would require forbidden new
  work: a Resolver↔executor mapping, or resource/provider candidates + allocation policy (overlapping the
  authority-vocabulary / economic-policy frontiers) — all out of scope for stabilization.
- **Action:** **NO ACTION** — no repair, no test-only closure, no activation, no new architecture, no mission
  contract change. The staged/semantic state is honest and already documented; this entry records that
  conclusion.
- **Files touched:** `docs/odg-master-v5/closeout/ODG_V5_CLOSEOUT_MATRIX.md` (this record only). No runtime,
  test, vnext activation, config, or contract file changed.
- **Capability development (GOVERNED_TEST_PROOF_ANALYSIS):** applied here as an independent read-only analysis
  whose outcome was *disprove/assess-as-intentional*. It produced **no genuine coverage gap + verified minimal
  test-only closure**, so it **does NOT** advance the Skill CANDIDATE → TESTED; the Skill remains **CANDIDATE**.
- **Status:** VERIFIED, not CERTIFIED.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 20. DOCUMENTATION CLOSEOUT — FIX_EXPERT_INSTANCE_DOCUMENT_V1

- **Date (UTC):** 2026-10-06
- **Work item:** FIX_EXPERT_INSTANCE_DOCUMENT_V1 (documentation/semantic closeout; discovery-authorized — see
  DISCOVER_EXPERT_INSTANCE_CONSUME_OR_DOCUMENT_V1). Closes the one-line limitation recorded in §13
  ("Expert Instance still downstream-dead") with an explicit, honest status; adds NO runtime/test/contract change.
- **Subject:** the mission-scoped §303 Expert Instance introduced by the campaign
  `EXPERT_PROFILE_ASSEMBLY_V1` (90795a2) → `WIRE_EXPERT_PROFILE_ASSEMBLER_V1` (fa12c7a) →
  `ATTACH_EXPERT_INSTANCE_TO_MISSION_CONTEXT_V1` (00cc185) → `CONSUME_EXPERT_INSTANCE_ON_EXECUTION_PATH_V1`
  (5f136e1). Canon: `ODG_FINAL_MASTER_V5_FICHE_05` §302/§303/§304/§305/§307/§308.
- **Operational status (as discovered, read-only):**
  - **Created** by `runtime/core/expert-profile-assembler.js:compileInstance` — a pure, read-only §303 data
    record (executes nothing, grants no authority; `authority_scope` is the §307 intersection, never a superset).
  - **Attached** to the official MissionContext at `runtime/core/mission-context-builder.js:148` as
    `context.expertInstance` — a field no component reads (the builder's own comment self-documents it as inert;
    the `MissionContext` type used by `src/core/workflow-*.ts` is a different, unrelated `@/core/mission-context`).
  - **On the LocalMissionRunner path** (`src/runtime/local-mission-runner.ts:74`) it is compiled AFTER the verdict
    and returned on the result; the only runtime reader is a `console.log` surface in `src/runtime/mission-cli.ts:184-189`.
  - The NL-objective gateway (`nl-objective-gateway.js:314`) compiles its own instance onto a DRY_RUN result
    object; it never influences the gateway's status. No reader exists on any execution/verification/ledger path.
- **Finding — intentional read-only status (the explicit statements required by this closeout):**
  - The §303 mission-scoped Expert Instance is **intentionally read-only and OFF the decision path** at the
    current lifecycle stage. It cannot influence execution, resolution, allocation, evidence, verification,
    recovery, reporting, or ledger state.
  - Its current status is **"not yet consumed", NOT "incorrectly disconnected".** No downstream component is
    designed to read it and starved by a wiring defect; all four campaign commits are deliberately labelled
    read-only / inert / dry-run / off-decision-path (the 4th, despite its name, delivered "surface … read-only,
    off decision path").
  - The instance is **correctly produced and correctly bounded** (§303 required fields present; authority is the
    §307 intersection with the mission authority; only certified components are bound).
  - **`authority_scope = []` is intentional** because the mission-authority vocabulary/source is **not currently
    defined** in-repo (every call site passes `mission.authority = []`; there is no authority verb-array to
    intersect). This is the same absent-authority-source condition recorded in §19.
  - Downstream **enforcement/consumption is deliberately deferred** until the separate **authority-vocabulary CTO
    frontier** is resolved (the §308 ACTIVE profile stage). It is not a defect that it is unenforced today.
  - **Connecting it now would require inventing** a mapping between the profile's capability/validator component
    names and the existing execution (objective-id dispatch) / probe (`verify[]`) vocabulary, OR inventing
    authority semantics for a non-empty `authority_scope`. Both are **outside this mission** and would change
    execution/verification behaviour.
- **Decision:** documentation-only closeout (option B of the discovery). No consumption is canonically required at
  the current (CERTIFIED-profile, not-yet-ACTIVE) stage; meaningful consumption is blocked on the authority-vocabulary
  frontier, which this item does not resolve.
- **Files touched:** `docs/odg-master-v5/closeout/ODG_V5_CLOSEOUT_MATRIX.md` (this record only). No runtime file, no
  test, no mission contract, no new document.
- **Architecture integrity:** **no new primitive, runtime, Resolver, Allocator, authority mechanism, or expert
  runtime is introduced.** This is a documentation/semantic closeout only; runtime and execution/verification
  behaviour are **unchanged** (byte-for-byte — no code path altered).
- **Status:** **VERIFIED, not CERTIFIED.**
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 19. TRUTH REPAIR LOG — FIX_GOVERNANCE_AUTHORIZATION_TAUTOLOGY_V1

- **Date (UTC):** 2026-10-06
- **Work item:** FIX_GOVERNANCE_AUTHORIZATION_TAUTOLOGY_V1 (truth/governance repair; discovery-authorized — see
  DISCOVER_GOVERNANCE_AUTHORIZATION_TAUTOLOGY_V1).
- **Defect (from A-to-Z audit / discovery):** `governance-kernel.authorizeMission` computed
  `authorized = (stateMachine.transitions[currentState] || []).length > 0` (`governance-kernel.js:14-15`) and
  returned it as `authorized`. That value is ONLY a lifecycle-state fact — "does `currentState` have an outgoing
  edge in `state-machine.json`?" — and is `true` for every non-terminal state, `false` only for the terminal
  `ARCHIVED`. It never inspects the `mission` argument, its contract authority, policy authorization, or any
  authority source, even though the constitution and policies are loaded (their `.version`/`.strategy` are used
  for display only). Naming a state-graph adjacency `authorized` misrepresented it as an authority decision.
- **Reproduction:** `authorizeMission(m, "CREATED")` returns `authorized: true` for every mission name, including
  `""`, `"../../etc/passwd"`, and nonsense tokens; across all states only `ARCHIVED` yields `false`. The value is
  a property of the state graph, not of the mission.
- **Severity (unchanged by this repair):** truth/governance defect, NOT an execution bypass. On the LOCAL path the
  value is reached only inside the ledger tail (`mission-ledger.js:106/148-150`, where it is recorded into the
  entry, not gated) and `mission-lifecycle.js:188/230` (a gate that, being tautologically true for every forward
  transition, never blocks). The real LOCAL admission controls (RuntimeReporter proof gate + the proven-only
  ledger gate) are independent of it.
- **Repair (minimal truth-preserving separation; NO authority source invented):** surface the honest fact under
  its real name `transitionPossible` (the state-adjacency computation), add an explicit `authorityEnforced: false`
  that DECLARES the absence of any consulted authority source (it invents no allowlist, permission, policy rule,
  or vocabulary), and retain `authorized` as a documented backward-compatibility ALIAS whose VALUE is unchanged
  (`=== transitionPossible`). Because the value of every pre-existing field is byte-identical, no caller's
  behaviour changes. No per-mission authority allowlist; no claim that a real authority decision now exists.
- **Files touched:** `runtime/core/governance-kernel.js` (truth-labeling + `transitionPossible`/`authorityEnforced`),
  `runtime/core/governance-kernel.test.js` (new, the minimal proof), this matrix (record). No caller edited
  (`mission-ledger`/`mission-lifecycle`/`nl-objective-gateway`/`fleet-collector`/`odg-run` all read the preserved
  `authorized` alias unchanged); mission-cli, RuntimeKernel, RuntimeExecutor, Resolver, Allocator,
  Expert/Profile/Instance, registry, learning paths all untouched.
- **Tests:** `governance-kernel.test.js` 12/12 — `transitionPossible` mirrors real adjacency (true non-terminal /
  false terminal), `authorized === transitionPossible` (no verdict change), `authorityEnforced === false`, no
  authority/permission/allowlist field added, and result is IDENTICAL across unrelated mission names (proof no
  authority source exists). Regression: `mission-lifecycle.verify.test.js` 11/11, `nl-objective-gateway.test.js`
  156/0, `mission-ledger-label`/`mission-ledger-idempotent` PASS, LOCAL-path `local-mission-runner.expert` 6/6 +
  `runtime-executor.plan-reuse` 3/3 + `runtime-executor.clean-workspace` 5/5; `tsc --noEmit` exit 0.
- **Before/after:** BEFORE — a state-graph adjacency was presented as `authorized`, implying an authority decision
  that was never made. AFTER — the lifecycle fact is named `transitionPossible`, authority non-enforcement is
  explicit (`authorityEnforced: false`), and `authorized` survives as an honestly-documented compatibility alias.
  No execution verdict or evidence semantics change.
- **Limitations:** this repair makes the kernel HONEST; it does NOT add authority enforcement. A real per-mission
  authority decision (FICHE_01 §13 "no authority → no consequential action") still does not exist and requires an
  authority source that is not present in-repo (§387 World Model / authority-vocabulary) — a standing CTO
  frontier, explicitly OUT of this write-set. Honesty rule: VERIFIED (tested green), not CERTIFIED.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 18. RUNTIME REPAIR LOG — FIX_DOUBLE_RECOMPUTE_V1

- **Date (UTC):** 2026-10-06
- **Work item:** FIX_DOUBLE_RECOMPUTE_V1 (runtime control-flow repair; plan reuse)
- **Defect (from A-to-Z audit):** `LocalMissionRunner.run` built an `ExecutionPlan` (`local-mission-runner.ts:60`) but
  called `kernel.execute(id,name)` with no plan, so `RuntimeExecutor.execute` re-ran `loader.load` +
  `orchestrator.buildPlan` + `ExecutionPlanner.create` (`runtime-executor.ts:~44-48`) — the plan was built twice
  per run; the runner's returned `result.plan` was NOT the executed plan (inefficiency + a TOCTOU risk that the
  returned plan could diverge from the verdict).
- **Repair:** added an OPTIONAL `plan?: ExecutionPlan` parameter to `RuntimeKernel.execute` and
  `RuntimeExecutor.execute`. When supplied, the executor REUSES that exact plan (mission = `plan.mission`,
  intent = `plan.intent ?? createMissionIntent(id)`) and SKIPS the second load + buildPlan + ExecutionPlanner.create;
  the `executionSteps` log count is derived from the reused plan. `LocalMissionRunner` passes its already-built
  plan, so `result.plan` === the executed plan. No plan supplied ⇒ the standalone build path is unchanged
  (backward-compatible). `createTechnicalPlan` and the evidence/verdict pipeline are untouched.
- **Files touched:** `src/runtime/local-mission-runner.ts`, `src/runtime/runtime-kernel.ts`,
  `src/runtime/runtime-executor.ts`, `src/runtime/runtime-executor.plan-reuse.test.ts` (new), this matrix.
  `mission-cli.ts`'s separate third build is **explicitly EXCLUDED** (separable, a different site).
- **Tests:** `runtime-executor.plan-reuse.test.ts` 3/3 — executor reuses a divergent 3-objective supplied plan
  (proves no rebuild); no-plan path still builds a 2-objective mission (backward-compat); counting orchestrator
  proves the runner builds the plan exactly ONCE. e2e verdicts unchanged (CLEAN_WORKSPACE 5/5, External Research
  5/5, objective-evidence ALL PASS, expert/ownership/probe green); `runtime/core/*.test.js` 60/60; `tsc --noEmit` 0.
- **Runtime impact:** eliminates the duplicate load+buildPlan+create on the LOCAL path; verdict/evidence semantics
  unchanged (same deterministic plan). Signatures gain an additive optional param only.
- **Architecture integrity:** no new primitive/runtime/Resolver/Allocator/authority/Profile/Instance/registry/learning;
  no mission contract; mission-cli untouched.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 17. TEST-HONESTY REPAIR LOG — FIX_COVERAGE_TEST_HONESTY_V1

- **Date (UTC):** 2026-10-06
- **Work item:** FIX_COVERAGE_TEST_HONESTY_V1 (test-only honesty repair; zero production-code change)
- **Finding (from ODG_REPOSITORY_A_TO_Z_TRUTH_AUDIT_V1):** `objective-evidence.test.ts` case 8 asserted the
  `objective-coverage-incomplete` branch by INJECTING fewer `planObjectiveSteps` than `objectiveSpecs` — a state
  the real `RuntimeExecutor` cannot produce. The orchestrator builds exactly one `OBJECTIVE_n` step per spec
  (`mission-orchestrator.ts:51`) and the executor filters those same steps (`runtime-executor.ts:117`), so
  end-to-end `objectivesExecuted === objectivesTotal` always; the injected unequal input was impossible-in-prod.
- **Evidence verdict:** the production `coverage-incomplete` branch (`objective-evidence.ts:180` + mirror
  `runtime-reporter.ts:55`) is defensive logic guarding a real invariant — tautological under current
  construction but NOT obsolete. The defect was the dishonest TEST, not the production logic.
- **Repair:** replaced case 8 with an HONEST invariant test driven by the real `LocalMissionRunner` (a
  two-objective mission) asserting `objectivesExecuted === objectivesTotal` from `execution.report.result`.
  The reachable `coverage-absent` negative case (case 7) is preserved. The defensive production branch is
  intentionally RETAINED in both `objective-evidence.ts` and `runtime-reporter.ts` (NOT removed).
- **Files touched:** `src/runtime/objective-evidence.test.ts` (case 8 only), this matrix. No production code,
  no mission contract, no Resolver/Allocator/authority/Profile/Instance/registry/learning change.
- **Tests:** `objective-evidence.test.ts` ALL PASS (incl. the new invariant case); `runtime/core/*.test.js`
  60/60; `tsc --noEmit` exit 0. No environment failure; no product defect.
- **Runtime impact:** NONE (test-only).
- **Related (EXCLUDED):** the double-recompute defect (`runtime-executor.ts:46`) is a separate work item.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 16. TRUTH REPAIR LOG — FIX_ECONOMIC_VERIFICATION_TRUTH_V1

- **Date (UTC):** 2026-10-06
- **Work item:** FIX_ECONOMIC_VERIFICATION_TRUTH_V1 (honesty repair; doc-in-code + test, zero runtime behavior change)
- **Findings (from ODG_REPOSITORY_A_TO_Z_TRUTH_AUDIT_V1):** (1) `economic-verification.js:23-27` header claimed the
  verdict is "EVIDENCE-ONLY … NOT wired into any live GATE" — stale/false: it gates release at
  `mission-ledger.js:101-103` (`NOT_ECONOMICALLY_VERIFIED`) via `acceptance-facts.evaluateMissionEconomics`, and
  commit/push via `mechanical-acceptance.js:327` — both OPT-IN on `control.economic===true`. (2)
  `economic-enforcement-adversarial.test.js:98` assertion `economicEnforced("M") === false || true` is always
  true (proves nothing; wrong cwd); the intent is already proven in-sandbox at the following lines.
- **Repair:** (1) replaced ONLY the header comment to state the verifier is persisted as evidence AND wired into
  live OPT-IN release + commit/push gates that BLOCK a non-VERIFIED economically-enforced mission, with a NO-OP
  for missions that don't declare `control.economic`; it is the VERIFIER, the choke points are the AUTHORITY.
  (2) removed ONLY the vacuous `|| true` assertion; the correct in-sandbox `check(e === false, …)` remains.
- **Files touched:** `runtime/core/economic-verification.js` (comment only), `runtime/core/economic-enforcement-adversarial.test.js`
  (one vacuous line removed), this matrix. No other file; no mission contract; no executable change.
- **Tests:** `economic-enforcement-adversarial.test.js` PASS (intent still asserted, −1 vacuous assertion);
  `runtime/core/*.test.js` 60/60; `tsc --noEmit` exit 0; `economic-verification.js` CLI descriptor unchanged.
- **Runtime impact:** NONE (comment + test only). No verdict/gate/mission-outcome change.
- **Architecture integrity:** no primitive/runtime/Resolver/Allocator/authority/Profile/Instance/registry/learning change.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 15. RUNTIME CHANGE LOG — CONNECT_SECOND_PRODUCER_EXTERNAL_RESEARCH_DRYRUN_V1

- **Date (UTC):** 2026-10-06
- **Work item:** CONNECT_SECOND_PRODUCER_EXTERNAL_RESEARCH_DRYRUN_V1 (second independent producer connection;
  validates the CANDIDATE Skill `GOVERNED_CAPABILITY_CONNECTION`)
- **Purpose:** connect a SECOND, genuinely independent read-only producer — External Research Acquisition in
  its DRY-RUN default — to the LOCAL route, closing producer→evidence→probe→verdict, to exercise the Skill on
  a producer the dispatch was not tailored to.
- **Files touched:** `runtime/core/capability-probes.js` (new probe `external-research-dry-run-planned`),
  `runtime/missions/EXTERNAL_RESEARCH_DRYRUN_PROBE.json` (new minimal contract, objective `EXTERNAL_RESEARCH_1`),
  `runtime/core/capability-probes.test.js` (probe cases), `src/runtime/runtime-executor.external-research.test.ts`
  (new e2e), this matrix. **`runtime-executor.ts` NOT modified** — the generic self-scoping dispatch (130f7f4)
  already resolves `EXTERNAL_RESEARCH_*`. No new primitive/runtime/Resolver/Allocator/authority/Profile/
  Instance/registry/learning mechanism; no producer behavior change.
- **Probe:** `external-research-dry-run-planned` reads `runtime/generated/external-research-acquisition.json`;
  ok iff `mode==="DRY_RUN"`, `acquired===false`, `sources` empty array, `ranked` array, `objective` string; plus
  run-ownership `mtimeMs >= runStartedAtMs` when the stamp is supplied (reused). It proves DRY-RUN PLANNING
  ONLY — **not** actual acquisition. `research-acquired` (LIVE acquisition gate) is unchanged and still FAILS a
  dry-run (test-asserted).
- **Dispatch:** with the minimal patch `{objectiveId,goal}` the producer's hard DRY-RUN default fires (zero
  network, deterministic artifact) before evidence assessment; non-matching objective ⇒ no dispatch.
- **Tests:** new e2e 5/5 (dispatch+artifact, mission SUCCESS, non-match no-dispatch, required-probe-absent FAIL,
  stale ⇒ FAIL); `capability-probes.test.js` 47 (positive/LIVE/acquired/non-empty-sources/malformed/absent/
  fresh/stale + research-acquired unaffected); `objective-evidence`/`.probe`/`.ownership`/`.expert` +
  `runtime-executor.clean-workspace` green; `tsc --noEmit` 0; `runtime/core/*.test.js` 60/60.
- **Before/after:** BEFORE — only CLEAN_WORKSPACE_1 proved the connection pattern. AFTER — a second,
  independent read-only producer is connected end-to-end with enforced run-ownership.
- **Skill promotion:** this satisfies the §7 CANDIDATE→TESTED condition of
  `docs/SKILL_GOVERNED_CAPABILITY_CONNECTION_v1.md` **by evidence**. Updating that doc's lifecycle to TESTED is a
  SEPARATE, human-authorized work item (the Skill file is not in this write-set). Honesty rule: VERIFIED, not CERTIFIED.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 14. RUNTIME REPAIR LOG — ADD_PROBE_RUN_OWNERSHIP_V1

- **Date (UTC):** 2026-10-06
- **Work item:** ADD_PROBE_RUN_OWNERSHIP_V1 (defect repair; discovery-authorized)
- **Defect:** the artifact-backed probe `clean-workspace-scanned` verified evidence *content* only, with no
  binding to the current run. Freshness held solely by the executor's dispatch-before-assess ordering, which
  fires only when an objective id matches the producer's registry prefix.
- **Reproduction (fresh process, real LOCAL route):** a mission declaring `verify:clean-workspace-scanned` on a
  NON-matching objective id (⇒ no dispatch), with a stale-but-valid `runtime/generated/clean-workspace-scan.json`
  present, recorded SUCCESS/validated=true on the stale leftover. (Not reachable via the shipped governed
  contract `CLEAN_RUNTIME_WORKSPACE.json`, whose ids dispatch the producer; reachable by any mis-authored/future
  contract or cross-mission stale artifact.)
- **Root cause:** evidence presence was conflated with evidence run-ownership for an artifact-backed probe.
- **Files touched:** `src/runtime/runtime-executor.ts` (capture run start from the existing
  RuntimeState.startedAt before dispatch; thread it via the existing `probeCtx` as `runStartedAtMs`),
  `runtime/core/capability-probes.js` (`clean-workspace-scanned` adds `mtimeMs >= runStartedAtMs` when the stamp
  is present), `runtime/core/capability-probes.test.js` + `src/runtime/runtime-executor.clean-workspace.test.ts`
  (coverage), this matrix. No producer/Resolver/Allocator/authority/primitive/provider change; no new framework
  or context model; `verify[].evidence` stays a probe name (no path reinterpretation).
- **Repair:** reuse the EXISTING `runStartedAtMs` concept. The executor captures `Date.parse(state.startedAt)`
  (set at init, before any dispatch) and passes it in `probeCtx`; the artifact-backed probe requires the scan
  file `mtimeMs >= runStartedAtMs` (>=, as designed) in addition to its structural checks. When the stamp is
  absent, behaviour is unchanged (content checks only — backward-compatible). Content-derived probes
  (build-green/typescript-green) ignore it entirely.
- **Tests:** `runtime-executor.clean-workspace.test.ts` 5/5 (incl. the reproduced stale case now ⇒ FAILED);
  `capability-probes.test.js` 38 (fresh passes, stale fails, absent fails, no-stamp content-only, build/ts
  unaffected); `objective-evidence`/`.probe`/`.ownership`/`local-mission-runner.expert` green; `tsc --noEmit`
  exit 0; `runtime/core/*.test.js` 60/60.
- **Before/after:** BEFORE — a stale scan from a prior run could satisfy the probe when no dispatch occurred.
  AFTER — an artifact older than the run start is rejected; only evidence produced this run counts.
- **Limitations:** run-ownership covers the artifact-backed `clean-workspace-scanned` probe; content-derived
  probes need no stamp. Coarse-FS mtime granularity could in principle false-stale a same-instant write — `>=`
  and capturing `startedAt` before dispatch avoid it in practice. VERIFIED, not CERTIFIED.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 13. RUNTIME CHANGE LOG — CONNECT_FIRST_PRODUCER_CLEAN_WORKSPACE_V1

- **Date (UTC):** 2026-10-06
- **Work item:** CONNECT_FIRST_PRODUCER_CLEAN_WORKSPACE_V1 (first real capability execution on the TS LOCAL route)
- **Frontier closed:** the LOCAL route (`RuntimeExecutor.execute`) planned + reported but ran NO capability —
  `capability-executors.js` had zero `src/` importers, so the producer→evidence→probe→verdict loop never
  closed on this path. This connects the smallest safe producer (read-only `CLEAN_WORKSPACE_1`).
- **Root cause:** no dispatch seam between a mission objective and the existing capability registry on the TS
  path (only the JS Path-B `patch-executor.js:529` dispatched).
- **Files touched:** `src/runtime/runtime-executor.ts` (self-scoping dispatch), `runtime/core/capability-probes.js`
  (new `clean-workspace-scanned` probe), `runtime/missions/CLEAN_RUNTIME_WORKSPACE.json` (canonical
  `verify[].evidence` probe binding), `src/runtime/runtime-executor.clean-workspace.test.ts` (new),
  `runtime/core/capability-probes.test.js` (probe cases), this matrix. No new primitive/runtime/authority/
  Resolver/Allocator/provider; no mapping layer; no dual-resolution.
- **Change:** before `assessObjectiveEvidence`, for each objective the executor calls the EXISTING
  `capability-executors.resolve({objectiveId, goal})`; a match runs the capability (producing its evidence this
  run), a non-match is left untouched (no dispatch). Mirrors the proven Path-B model. New probe
  `clean-workspace-scanned` verifies the scan artifact read-only (`objective===CLEAN_WORKSPACE_1`,
  `candidates.length===candidateCount`, `deleted===0`) — structure-only ⇒ environment-independent verdict.
- **Authority/write-scope:** `CLEAN_WORKSPACE_1` writes only `runtime/generated/clean-workspace-scan.json`;
  consumes no `authorized_paths`, no action-gate, no git mutation.
- **Failure/recovery:** a capability that throws propagates ⇒ `LocalMissionRunner` returns `{ok:false}`, no
  ledger write (fail-closed); a missing/malformed artifact ⇒ probe `{ok:false}` ⇒ FAILED. No rollback needed
  (nothing mutated).
- **Tests:** `runtime-executor.clean-workspace.test.ts` 4/4 (dispatch+artifact, real mission SUCCESS, non-match
  no-dispatch, required-probe-absent FAIL); `capability-probes.test.js` 32 (incl. 5 new clean-workspace-scanned
  cases); existing `objective-evidence`/`.probe`/`.ownership`/`local-mission-runner.expert` green; `tsc --noEmit`
  exit 0; `runtime/core/*.test.js` 60/60.
- **Before/after:** BEFORE — LOCAL route produced no evidence; engineering missions could only pass on prior
  artifacts. AFTER — a matching objective runs a real read-only capability that produces fresh evidence, verified
  by a registered probe, end-to-end through the real `LocalMissionRunner`.
- **Limitations:** self-scoping dispatch currently matches only the existing registry prefixes (CLEAN_WORKSPACE_*,
  etc.); only CLEAN_WORKSPACE_1 is loop-closed with a probe. Probe evidence has no run-ownership stamp — freshness
  holds by dispatch-before-assess ordering, not enforced. Resolver/Allocator still off-path; Expert Instance still
  downstream-dead; vacuous-coverage/double-recompute/discarded-plan remain open. VERIFIED, not CERTIFIED.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.

---

## 12. RUNTIME REPAIR LOG — FIX_TS_EVIDENCE_PROBE_RESOLUTION_V1

- **Date (UTC):** 2026-10-06
- **Work item:** FIX_TS_EVIDENCE_PROBE_RESOLUTION_V1 (defect repair; discovery-authorized)
- **Defect:** `verify[].evidence` is canonically a REGISTERED PROBE NAME (all 29 contract entries; consumed by
  `validation-engine.js:131` via `capability-probes.evaluate`), but the TS LOCAL executor path interpreted it
  as a filesystem path — `objective-evidence.ts` fed each `verify[].evidence` to `fs.statSync`. The same field
  carried two contradictory contracts (probe key in runtime/core; fs path in src/runtime).
- **Reproduction:** an engineering mission declaring `verify:[{capability:…,evidence:"build-green"}]` (a probe
  name) could never resolve as a file on the LOCAL route ⇒ `presentEvidence=0` ⇒ `engineering-evidence-missing`
  FAIL, even though the canonical probe would pass. Conversely the VE route resolved the same token as a probe.
- **Root cause:** divergent consumers of one declared field, with no adapter; the TS path never called the
  probe registry.
- **Files touched:** `src/runtime/objective-evidence.ts` (probe resolution), `src/runtime/runtime-executor.ts`
  (supplies the existing `{missionId, verify}` probe ctx), `src/runtime/objective-evidence.probe.test.ts` (new),
  `src/runtime/objective-evidence.test.ts` (case #9 only — migrated to the canonical probe-name contract),
  this matrix (record). No Resolver/Allocator/execution-semantics/authority/primitive/provider change.
- **Repair:** added `makeProbeExists(ctx)` to `objective-evidence.ts` — resolves a declared `verify[].evidence`
  NAME via the existing `capability-probes.runProbe(name, ctx)` (unknown ⇒ `{ok:false}`, never throws). Default
  predicate = probe resolution when `probeCtx` is supplied, else the artifact-path predicate; an injected
  `evidenceExists` still wins (back-compat). `runtime-executor.ts` passes `probeCtx:{missionId, verify}` where
  `verify` = the existing `runtime-verify.json` booleans (read-only; writes nothing). No dual-resolution; no
  filesystem-path reinterpretation of `verify[].evidence`.
- **Tests:** `objective-evidence.probe.test.ts` 9/9 (known-ok, failing-ctx, unknown⇒fail, engineering PASS/FAIL,
  injected-predicate precedence, fs-fallback, read-only compat); migrated `objective-evidence.test.ts` all PASS
  (case #9 now proves the probe-name contract through the real runner); `objective-evidence.ownership.test.ts`
  11/11; `local-mission-runner.expert.test.ts` 6/6; `tsc --noEmit` exit 0; `runtime/core/*.test.js` 60/60.
- **Evidence:** test output + `git status --porcelain` showing exactly the five files below.
- **Before/after:** BEFORE — probe-name `verify[].evidence` silently un-resolvable on the TS route (engineering
  missions FAIL; two gates disagree). AFTER — the TS route resolves the same probe names as the Validation
  Engine; one verification vocabulary; artifact-path evidence remains a separate schema.
- **Limitations:** four contracts declare network-derived probes (`internet-reachable` ×3, `research-acquired`);
  routing those through the LOCAL route makes that verdict depend on a prior audit artifact (same dependency VE
  already has). Freshness (`runStartedAtMs`) is NOT used for probe evidence — it remains for the separate
  artifact-path schema only. Honesty rule: VERIFIED (tested green), not CERTIFIED.
- **Checkpoint status:** VERIFIED, uncommitted on `main`. Commit/push await explicit human authorization.
