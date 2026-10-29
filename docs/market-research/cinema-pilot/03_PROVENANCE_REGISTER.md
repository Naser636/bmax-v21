# Factual-Claim Provenance Register — Pilot "The Machine That Refuses to Lie About Itself"

**CINEMA_SCRIPT_SPINE_PROBE_V1 · 2026-10-23**

Every `[FACT]` in `01_PILOT_SCRIPT.md` is bound below to a repository source: file path + **sha256** of the
file + **sourceCommit** + the exact line/behaviour evidencing the claim. Determinism-first: a reader can
recompute each sha256 (`sha256sum <path>`) at this commit and confirm the file is byte-identical to what was
cited. No external/web claim appears in this pilot (network was disabled for the probe).

**sourceCommit (HEAD):** `28c15a57537c5d775a6312ef94f1f1068afe3cc3` (short `28c15a5`)

**Cited source files + sha256:**
| Source | sha256 |
|---|---|
| `runtime/core/truth-lock.ts` | `78ae1c7b2ecdac04479eaea5924aa9a393af38f9ba92a76d618fc4bad3f5fd7d` |
| `runtime/core/truth-lock-gate.ts` | `d0313335369d73d35f0f2ab0b09ebf934ab5588623d8f7971c2e4c892e6efb0c` |
| `runtime/core/truth-lock-chokepoint.test.ts` | `f9c9dc2a155fe47c3653a8a6c02e8137d65a3724e00c6b9cbc2df474eaad28ab` |
| `runtime/core/evidence-provenance.ts` | `b33b9e3b30b41cf6eaecf6bb1c2ed44ee9ca8decbe3831e9bd983f55a23d0cbc` |

---

| ID | Claim in script | Source (path) | Evidence (line/behaviour) |
|----|-----------------|---------------|---------------------------|
| **P1** | A real agent-runtime codebase contains a component called the "Truth Lock". | `runtime/core/truth-lock.ts` | Header L3–4 "Truth Lock — the single CANONICAL home of the pure repository-safety POLICY"; file exists at this commit. |
| **P2** | It is a *pure* policy — no fs, process, clock, or randomness; same input → same verdict (deterministic). | `runtime/core/truth-lock.ts` | Header L8 "PURE: no fs, no process, no clock, no randomness — unit-testable with synthetic states"; `evaluateTruthLock` (L38) is a pure function of its `GitState` argument. |
| **P3** | It decides on exactly five observable Git facts: (1) is-repo, (2) expected branch=main, (3) origin/main resolvable, (4) HEAD==origin/main, (5) empty staging index. | `runtime/core/truth-lock.ts` | `GitState` fields L18–24 (isRepo/branch/head/originMain/staged); `DEFAULT_TRUTH_LOCK_POLICY = { expectedBranch: "main" }` L26; checks L39–48. |
| **P4** | On any failure the verdict becomes "refused" and states the reason in words. | `runtime/core/truth-lock.ts` | `detail = ok ? … : "REFUSED — " + violations.join("; ")` L51–53; `violations:string[]` accumulates human-readable reasons L40–48. |
| **P5** | It deliberately does NOT require a pristine worktree; unstaged edits are isolated (candidate = committed HEAD + overlay of only the authorized write-set), never overwritten/incorporated. | `runtime/core/truth-lock.ts` | Doc L29–36 "deliberately does NOT require a fully clean WORKTREE … candidate is `git archive HEAD` plus an overlay of ONLY the authorised write-set … never overwritten, staged, or incorporated." |
| **P6** | The policy is wired into a gate that runs once, at pipeline entry, before any stage. | `runtime/core/truth-lock-gate.ts` | Header L2–4 "PRE-EXECUTION GATE … into the real odg-run execution path, BEFORE any pipeline stage runs"; "WHEN: once, at odg-run entry … BEFORE the stage loop" L8. |
| **P7** | A mutating mission with a failing verdict ⇒ BLOCKED (odg-run exits 1, no stage runs); a read-only mission is never blocked, its verdict is RECORDED for observability. | `runtime/core/truth-lock-gate.ts` | Header L9–11 (quote spans two comment lines): "REFUSAL: a MUTATING mission (requiresEngineering) with a failing verdict ⇒ status BLOCKED (odg-run exits 1," / "no stage runs). A READ-ONLY mission is never blocked — the verdict is RECORDED for observability only." |
| **P8** | Indeterminate mutating-ness defaults to RECORDED (it will not block work it cannot prove mutates). | `runtime/core/truth-lock-gate.ts` | Header L11 "Indeterminate mutating-ness defaults to RECORDED (never block a workflow we cannot prove mutates)." |
| **P9** | Every verdict is written to an evidence file. | `runtime/core/truth-lock-gate.ts` | Header L12 "CONSIGNED: the caller writes the verdict to runtime/generated/truth-lock.json (evidence)." |

**Supporting (not individually quoted in the script but underpins the theme):** a dedicated chokepoint test
asserts the gate cannot be bypassed — `runtime/core/truth-lock-chokepoint.test.ts` (sha256 above). The
provenance-stamping discipline used by THIS register (sha256 + sourceCommit) mirrors the repo's own
`runtime/core/evidence-provenance.ts` (sha256 above).

**Ungrounded factual claims in the script: NONE.** Items tagged `[OPINION]` / `[CREATIVE]` carry no truth claim
and are intentionally excluded from provenance (they are editorial/inventive, per the fact/opinion/creative
separation requirement).
