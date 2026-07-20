# Provider Contract — ODG ↔ Claude Code (Engineering Capability Provider)

- **Contract name:** `OFFICIAL_CLAUDE_PROVIDER_CONTRACT`
- **Provider Contract Version:** `1.0.0`
- **Classification:** Capability boundary (NOT a new engine, NOT a new foundation)
- **Owning engine:** Runtime (decision authority delegated to Governance + Release Manager)
- **Status:** SPECIFICATION (frozen once accepted). No code. No new foundation.
- **Scope:** Defines *how* an external engineering provider (Claude Code, later OpenAI/Gemini/Codex/…)
  is driven by ODG. Reuses existing primitives exclusively: the Autonomy Cycle, the mission
  pipeline (`runtime/bin/odg-run.js`), evidence assembly (`odg-verify.js` + Documentation Engine),
  and the Release Manager as the sole completion authority.

---

## 0. Founding invariants (inherited, not re-invented)

This contract adds **one boundary** to the frozen Runtime — nothing else. It inherits every
invariant already frozen in `docs/RUNTIME_AUTONOMY_DESIGN_v1.md` and `docs/RELEASE_MANAGER_DESIGN_v1.md`:

1. **ODG decides, the provider executes.** The provider (Claude) never selects a mission, never
   judges quality, and never decides completion. Mission selection stays in
   `selectNextMission()` (`src/core/runtime-autonomy.ts`); completion stays with the
   **Release Manager** (`RELEASE` / `NO_RELEASE` is the only authority — design §0 founding invariant).
2. **The provider is an injected port, not a foundation.** It sits exactly where `runPipeline()`
   sits today in `AutonomyRuntimePorts` (`src/contracts/runtime-autonomy.ts`). It is impure glue at
   the Runtime edge; the pure core stays deterministic and never talks to a provider directly.
3. **Evidence, not narrative.** A provider run is *accepted* only through the existing evidence gates
   (`build`, `typescript`, `gitClean`, `missionPipeline`, documentation proof). The provider's own
   prose report is never trusted as proof.
4. **Frozen means frozen.** The provider may not modify any frozen Runtime file (see §9) unless a
   mission contract explicitly authorizes it and Governance permits the state transition.
5. **Reuse before create** (Runtime Constitution). This boundary introduces **no new persistence
   format**: it reuses the Mission Contract schema, `runtime/generated/*`, the Documentation Engine,
   and the Mission Ledger.

> **Position in the cycle.** The Autonomy Cycle is:
> `select → generate contract → **execute** → gather evidence → Release Manager → archive → advance`.
> This contract specifies *one* implementation of the **execute** stage: instead of (or in addition to)
> the deterministic `odg-run.js` pipeline, ODG may delegate the engineering work of a mission to
> Claude Code. Everything before and after the execute stage is unchanged.

---

## 1. How ODG launches Claude Code

ODG launches Claude through a single, impure adapter method — the **Provider Port** — modelled
exactly on the existing `runPipeline(mission)` port. Conceptually:

```
EngineeringProviderPort {
  execute(request: ProviderRequest): ProviderOutcome
}
```

The Runtime adapter (the same layer as `src/runtime/autonomy-runtime-adapter.ts`) is the ONLY place
allowed to spawn a provider process. It does so with a child process, exactly as the adapter already
launches the pipeline:

```
spawnSync(<provider-binary>, [<provider-args>], {
  cwd: <repo root>,          // the mission workspace
  stdio: ["ignore", "pipe", "pipe"],   // stdout captured (JSON), stderr captured (diagnostics)
  timeout: <mission budget ms>,
  env: { ...process.env, /* provider credentials only; no ODG secrets leaked */ },
})
```

Launch sequence (ODG-driven, deterministic):

1. **Decide.** The Autonomy core selects the next mission (`selectNextMission`). If the mission is
   flagged as requiring engineering work (i.e. it cannot be satisfied by the deterministic pipeline
   alone), ODG routes the **execute** stage to the Provider Port instead of `odg-run.js`.
2. **Authorize.** `authorizeMission(mission)` (Governance Kernel) must return `authorized: true`
   before any provider is spawned. A refused mission never reaches the provider.
3. **Prepare context** (see §3).
4. **Spawn** the provider process in the repo working directory (never in a frozen subtree; see §9).
5. **Collect** stdout/stderr and the working-tree diff (see §4, §5, §6).
6. **Assemble evidence** through the existing `gatherEvidence()` path — unchanged.
7. **Decide completion** via the Release Manager — unchanged.
8. **Archive** via the Mission Ledger and advance — unchanged.

The provider is a **peer of `odg-run.js`**, not a replacement for the cycle. The cycle owns it.

---

## 2. The official command to use

The canonical, non-interactive ("headless") invocation of Claude Code is the **print mode** of the
`claude` CLI with structured JSON output. This is the single official command ODG uses; no
interactive TTY session is ever driven by ODG.

```
claude -p "<PROMPT>" \
  --output-format json \
  --model claude-opus-4-8 \
  --permission-mode acceptEdits \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob" \
  --add-dir <repo-root> \
  --max-turns <N>
```

Argument contract (each flag is part of the frozen boundary — pin exact values per mission):

| Flag | Role in the contract | ODG policy |
|------|----------------------|------------|
| `-p, --print` | Headless, one-shot execution. **Mandatory.** ODG never runs interactive mode. | always set |
| `--output-format json` | Machine-readable result envelope (see §4). **Mandatory.** | always set |
| `--model` | Provider model id. Pinned per mission for reproducibility. | e.g. `claude-opus-4-8` |
| `--permission-mode` | Governs autonomy of edits. `acceptEdits` for authorized engineering missions; `plan` for read-only / audit missions. | mission-scoped |
| `--allowedTools` / `--disallowedTools` | The provider's capability surface for this mission. Read-only missions omit `Edit,Write` and network Bash. | mission-scoped allowlist |
| `--add-dir` | Restricts the filesystem surface to the repo root (or a narrower subtree). Frozen subtrees are **never** added when the mission does not target them. | mission-scoped |
| `--max-turns` | Hard upper bound on provider agent turns (defensive termination, mirrors `maxCycles`). | mission budget |
| `--append-system-prompt` | Injects the ODG mission guardrails (§9) into the provider. | always set |

Session continuation flags (`--continue`, `--resume`) are covered in §8.

> **Version pinning.** The exact flag set MUST be validated against the installed `claude`
> version at mission time (`claude --version`). The contract pins *semantics*; the adapter pins the
> *literal flags* for the installed CLI and records the version in the mission evidence.

---

## 3. Exact format of prompts transmitted

ODG never sends free-form chat. Every prompt is a **rendered Mission Contract**, produced from the
existing `MissionContract` shape (`src/contracts/runtime-autonomy.ts`, matching
`runtime/missions/*.json`). The prompt is deterministic given the contract.

Two channels are transmitted, both derived from ODG state:

### 3.1 System guardrails (`--append-system-prompt`)

A fixed, mission-independent preamble that encodes the non-negotiable rules:

```
You are an engineering capability provider invoked by the ODG Runtime.
- Execute ONLY the mission described below. Do not expand scope.
- Do NOT modify any frozen Runtime file unless the mission's `authorized_paths`
  explicitly lists it. Frozen roots: runtime/, src/contracts/, src/core/, docs/*_DESIGN_v1.md.
- Do NOT create commits. Do NOT push. Leave changes in the working tree only.
- Produce evidence, never claims. You do not decide completion; the Release Manager does.
- On any ambiguity or blocked precondition, STOP and report the blocker. Do not guess.
```

### 3.2 Mission prompt (`-p`)

A single rendered document with a fixed section order (deterministic serialization of the contract):

```
# MISSION: <mission>
PROVIDER_CONTRACT_VERSION: 1.0.0
PRIORITY: <priority>            # from MissionContract.priority
MODE: <mode>                    # from MissionContract.mode

## OBJECTIVES
- id: <objective.id>
  goal: <objective.goal>
  done_when:
    - <criterion>               # objective.done_when[]

## DEFINITION_OF_DONE
- <item>                        # MissionContract.definition_of_done[]

## COMPLETION
- <item>                        # MissionContract.completion[]  (always: "Release Manager decision is RELEASE.")

## AUTHORIZED_PATHS               # explicit write scope; empty ⇒ read-only mission
- <glob>

## CONTEXT
- repo_root: <abs path>
- branch: <git branch>
- head_commit: <git HEAD>
- master_plan_objectives: [...]  # AutonomyPlanState.masterPlanObjectives
- missing_capabilities: [...]    # AutonomyPlanState.missingCapabilities

## REQUIRED_OUTPUT               # see §4
Return a final message that is a single JSON object matching the RESULT SCHEMA.
```

The prompt is a **pure function of the Mission Contract + `AutonomyPlanState`**. No timestamps, no
randomness — the same contract renders byte-identically (DETERMINISM_FIRST).

---

## 4. Expected response format

Two layers, both machine-checked. ODG trusts the **envelope + evidence**, never the prose.

### 4.1 CLI envelope (from `--output-format json`)

The `claude -p … --output-format json` call returns a single JSON object on stdout. ODG consumes:

| Field | Meaning | ODG use |
|-------|---------|---------|
| `type` / `subtype` | Result kind (e.g. `result` / `success` \| `error_max_turns` \| …) | classify outcome |
| `is_error` | Whether the provider run errored | gate |
| `result` | The provider's final message text (contains §4.2 payload) | parse |
| `session_id` | Session handle | persisted for §8 resume |
| `num_turns` | Turns consumed | budget audit |
| `total_cost_usd`, `duration_ms` | Cost/latency | audit only, never a gate |

### 4.2 Mission result payload (inside `result`)

The provider's final message MUST be a single JSON object (the **RESULT SCHEMA**), never prose:

```
{
  "mission": "<mission>",
  "providerContractVersion": "1.0.0",
  "status": "DONE" | "BLOCKED",          // provider's self-report — advisory only
  "objectivesAddressed": ["<objective.id>", ...],
  "changedFiles": ["<repo-relative path>", ...],
  "commandsRun": ["<cmd>", ...],
  "blocker": null | "<reason if BLOCKED>",
  "notes": "<optional short summary>"
}
```

**`status: "DONE"` is not acceptance.** It is a hint. Acceptance is decided later by the Release
Manager from real evidence (§0 invariant 3). A provider that claims `DONE` but leaves `build:false`
is rejected; a provider that reports `BLOCKED` is a certified stop (maps to an autonomy halt).

---

## 5. Files read and written

### 5.1 Read by ODG (to build the request) — all existing artifacts

- `runtime/brain/MASTER_PLAN.md` — objectives (via `readPlanState`).
- `runtime/generated/mission-plan.json` — pipeline-produced plan (preferred over the brain parse).
- `runtime/generated/capability-registry.json` — `missingCapabilities`.
- `runtime/generated/mission-ledger.json` — completed missions.
- `runtime/missions/<mission>.json` — the mission contract, if present.
- `git HEAD` / branch — provenance (`readSource`).

### 5.2 Written/allowed to be written by the provider

- **Only** paths inside `AUTHORIZED_PATHS` for the mission (working tree only, never committed).
- For a **read-only / audit** mission, `AUTHORIZED_PATHS` is empty and `--allowedTools` omits
  `Edit,Write` — the provider may read but not mutate.
- The provider MUST NOT write to the frozen roots (§9) unless the mission explicitly authorizes them.

### 5.3 Written by ODG after the provider returns — existing generated surface only

- `runtime/generated/runtime-verify.json` — via `odg-verify.js` (build/typescript/gitClean).
- `runtime/generated/mission-report.json` — canonical pipeline/mission report.
- `runtime/generated/mission-ledger.json` — appended on RELEASE, via `runtime/core/mission-ledger.js`.
- The provider transcript is captured to a non-tracked evidence location (see §6). These live under
  the git-ignored `runtime/generated/` tree, so `gitClean` reflects only *source* changes.

---

## 6. Artifacts produced

Each provider-executed mission produces, through the **existing** evidence path, no new format:

1. **Working-tree diff** — the actual code changes (the only real engineering output). Verified by
   `git diff` and the validation gates.
2. **Provider transcript** — the raw `--output-format json` envelope, persisted under
   `runtime/generated/` for audit (never tracked, so it cannot dirty `gitClean`).
3. **Validation evidence** — `runtime/generated/runtime-verify.json`
   (`build`, `typescript`, `gitClean`; `missionPipeline` is set true only after a successful run).
4. **Documentation proof** — produced by the **Documentation Engine** from the mission's
   materialized artifacts (`gatherEvidence → buildDocumentationProof`), unchanged.
5. **Release record** — the immutable `ReleaseRecord` (decision, gates, `proofHash`, included refs),
   produced by the Release Manager.
6. **Ledger entry** — appended via the Mission Ledger on RELEASE.
7. **Mission-Standard artifacts** (when the mission is run via `odg mission <NAME>`): passport,
   report, certificate under `runtime/mission-standard/…`, pinned as `ReleaseArtifactRef`s.

The provider **invents no artifact type.** It only fills the working tree; ODG turns that into the
existing proofs.

---

## 7. Return codes (success / failure / interruption)

Two distinct layers of return codes; ODG maps both onto the **existing** `AutonomyStatus` set.

### 7.1 Claude Code process exit code

| Exit | Meaning | ODG interpretation |
|------|---------|--------------------|
| `0` | Provider completed its turn(s) and returned a JSON envelope | proceed to evidence gathering |
| non-zero | Provider process failed (crash, `--max-turns` with error subtype, auth failure, timeout kill) | provider execution failed |
| killed (timeout / signal) | `spawnSync` `timeout` exceeded or signal | treated as interruption (see §8) |

Exit `0` does **not** mean the mission is done — it means the provider process ran. Combine with
`is_error` and the RESULT SCHEMA `status`.

### 7.2 ODG autonomy status (unchanged, `src/contracts/runtime-autonomy.ts`)

The provider outcome is folded into the existing halting set — no new statuses are introduced:

| Condition | AutonomyStatus | `odg autonomy` exit |
|-----------|----------------|---------------------|
| Release Manager returns `RELEASE`, plan exhausted | `PLAN_COMPLETE` | `0` |
| Release Manager returns `NO_RELEASE` | `BLOCKED` | `2` |
| Release Manager returns an error (missing evidence) | `EVIDENCE_INCOMPLETE` | `1` |
| Provider process failed / non-zero exit | `EXECUTION_FAILED` | `1` |
| Rendered/returned contract invalid | `CONTRACT_INVALID` | `1` |
| Non-advancing loop guard | `STALLED` | `1` |
| Provider contract version mismatch | `AUTONOMY_CONTRACT_INCOMPATIBLE` | `1` |
| Malformed ports/config | `INPUTS_MALFORMED` | `1` |

This mapping is the whole point of the boundary: **a provider failure is just another halt reason**,
handled by machinery that already exists.

---

## 8. Resuming an interrupted session (best practices)

A provider run is interrupted when the process is killed (timeout/signal), the machine restarts, or
`--max-turns` is hit mid-work. Because ODG is the driver, resumption is deterministic:

1. **Persist the session id.** Every launch records `session_id` from the JSON envelope into the
   mission's evidence before ODG acts on the result. No id ⇒ no resume; ODG re-runs the mission
   from a clean tree instead.
2. **Resume with the same context.** Continue the exact session rather than starting fresh:
   ```
   claude --resume <session_id> -p "<CONTINUATION PROMPT>" --output-format json …
   ```
   or `--continue` to resume the most recent session in the working directory. The continuation
   prompt restates the mission and appends: *"Resume the interrupted mission. Do not repeat
   completed edits; verify current working-tree state first."*
3. **Idempotency over replay.** The continuation prompt instructs the provider to **inspect the
   working tree first** and only perform the remaining work — never blindly replay. Missions must be
   written so partial progress is safe to re-enter (Runtime rule: `ROLLBACK_MUST_ALWAYS_BE_POSSIBLE`).
4. **Bounded retries.** ODG retries a mission at most `maxCycles`/mission-budget times. On repeated
   interruption it halts as `EXECUTION_FAILED` rather than looping — the defensive guard already in
   the core.
5. **Clean-slate fallback.** If the working tree is inconsistent (e.g. partial edits that break
   `build`), ODG discards the working-tree changes (`git checkout -- .` / `git clean` on
   authorized paths only) and relaunches from the last known-good commit. Frozen roots are never
   touched by cleanup.
6. **Never resume across a decision.** Once the Release Manager has decided, the session is closed.
   Resumption applies only to the **execute** stage, never after evidence/decision.

---

## 9. Rules so the provider never modifies the frozen Runtime without an explicit mission

The frozen Runtime is protected by **four independent layers**; a provider must clear all four to
touch a frozen file, and a normal mission clears none of them.

**Frozen roots** (default read-only, never writable without explicit authorization):
`runtime/**`, `src/contracts/**`, `src/core/**`, and every `docs/*_DESIGN_v1.md` / `*_SPEC_v1.md`.

1. **Mission-scoped write allowlist.** The provider may write only to `AUTHORIZED_PATHS` from the
   Mission Contract. A mission that does not name a frozen path cannot legitimately edit it. Empty
   allowlist ⇒ read-only mission (`--permission-mode plan`, no `Edit,Write` tools).
2. **Tooling surface.** `--allowedTools` / `--disallowedTools` and `--add-dir` restrict the
   provider's reachable filesystem and capabilities to the mission scope. Frozen subtrees outside
   the mission are not added.
3. **System guardrail.** The `--append-system-prompt` preamble (§3.1) explicitly forbids editing
   frozen roots and forbids commits/pushes.
4. **Post-run enforcement (the real gate).** After the provider returns, ODG runs the existing
   protections:
   - `git status --porcelain` restricted to exclude expected artifact dirs (the Mission-Standard
     Governance check pattern) — any change **outside** the authorized paths ⇒ hard STOP.
   - `odg-verify.js` `gitClean` gate and the Release Manager gates — unauthorized frozen-file
     changes fail the release.
   - `authorizeMission()` (Governance Kernel) + the state machine gate whether the mission was ever
     permitted to reach a mutating state.

Layers 1–3 are *preventive*; layer 4 is *detective and authoritative*. Even if a provider ignores
the prompt, the post-run check rejects any unauthorized frozen-file mutation and halts the cycle
(`EXECUTION_FAILED` / rejected release) with the offending paths listed. **Frozen files change only
when a mission contract explicitly lists them in `AUTHORIZED_PATHS` and Governance authorizes the
transition — and even then the change must survive the same evidence gates.**

---

## 10. Adding further providers (OpenAI, Gemini, Codex, …) via the same contract

The boundary is **provider-agnostic by construction**. A new provider is added by implementing the
same `EngineeringProviderPort` — nothing in the core, the contracts, or the Release Manager changes.

Each provider adapter must supply the same five things this contract defines for Claude:

1. **A launch command** (§1/§2) — the provider's headless, non-interactive CLI/API call, with an
   equivalent of print-mode + structured output. (e.g. an OpenAI/Codex or Gemini CLI headless run,
   or a thin process wrapper over the provider's API.)
2. **The same prompt contract** (§3) — the identical rendered Mission Contract + guardrail preamble.
   The prompt is provider-independent; only the transport differs.
3. **The same RESULT SCHEMA** (§4.2) — every provider returns the identical JSON payload. Providers
   whose native output differs are wrapped so the adapter normalizes to the schema before ODG sees it.
4. **The same evidence contract** (§5/§6) — every provider produces only a working-tree diff; ODG
   turns it into the existing proofs. No provider adds a persistence format.
5. **The same return-code mapping** (§7) — provider exit + result normalized into the existing
   `AutonomyStatus` set.

Selection between providers is an ODG decision (deterministic, mission-scoped), e.g. a
`provider` field on the Mission Contract or a capability-registry mapping. Recommended practices:

- **One normalization adapter per provider**, each ≤ the size of `autonomy-runtime-adapter.ts`,
  living at the Runtime edge — never in the core.
- **Pin provider + model + CLI version** in the mission evidence for reproducibility.
- **Identical guardrails and post-run enforcement (§9) for every provider** — the frozen-root
  protection is provider-independent and non-negotiable.
- **Provider parity is proven by evidence, not trust:** a new provider is "supported" only once a
  mission executed through it reaches `RELEASE` via the unchanged Release Manager.

The result: providers are interchangeable engineering *capabilities* behind a single frozen boundary.
ODG decides, prepares, launches, collects, validates, and continues — identically, whichever provider
executed the work.

---

## Appendix A — Traceability to existing components (reuse map)

| Contract clause | Existing component reused (no new code) |
|-----------------|------------------------------------------|
| Mission selection | `selectNextMission()` — `src/core/runtime-autonomy.ts` |
| Plan state / inputs | `readPlanState()` + `AutonomyPlanState` — adapter + `src/contracts/runtime-autonomy.ts` |
| Mission Contract shape | `MissionContract` / `runtime/missions/*.json` |
| Execute stage (port) | peer of `runPipeline()` in `AutonomyRuntimePorts` |
| Governance gate | `authorizeMission()` — `runtime/core/governance-kernel.js` |
| Validation evidence | `runtime/bin/odg-verify.js` → `runtime-verify.json` |
| Documentation proof | `DocumentationEngine` — `src/core/documentation-engine.ts` |
| Completion authority | Release Manager (`RELEASE` / `NO_RELEASE`) — `RELEASE_MANAGER_DESIGN_v1.md` |
| Archive / advance | `runtime/core/mission-ledger.js` + `archive()` |
| Halt/return semantics | `AutonomyStatus` / `AutonomyHalt` — `src/contracts/runtime-autonomy.ts` |
| Frozen-root enforcement | Mission-Standard Governance `git status --porcelain` check (`runtime/mission-standard/bin/mse`) + `gitClean` gate |

*No file under `src/` or `runtime/` is modified by this specification. This document is architecture
only; it defines a boundary and reuses the frozen Runtime exactly as-is.*
