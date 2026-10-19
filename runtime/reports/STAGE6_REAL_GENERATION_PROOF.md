# ODG — Stage-6 REAL Local-Model Code Generation: Live Proof (2026-10-19)

**Base:** `c244839`. **Status:** the governed Stage-6 mechanism (`implementViaLocalProvider`, committed c244839)
is now proven end-to-end with a **REAL local code model**, not only a STUB. Local inference only — **no billing,
no external network, no model download** (the model was already installed). **Stage-6 is NOT declared
production-complete**: a permanent sandboxed wiring is a documented follow-up (see §4).

## 1. D1 dependency — SATISFIED on this host (evidence)
- `ollama` installed (`/usr/local/bin/ollama`) with a code model: **`qwen2.5-coder:3b`** (1.9 GB) + `qwen2.5:0.5b`.
- `local-model-manager.isAvailable()` is `false` ONLY because `ODG_LOCAL_MODEL_CMD` is unset (wiring), not
  because a model is absent. So the prior "generator unavailable" blocker is a WIRING gap, not a resource gap.

## 2. Live proof — ODG governs a REAL model end-to-end (VERIFIED)
Drove the COMMITTED `capability-executors.implementViaLocalProvider` with an injected `generate` that calls
the local `ollama run qwen2.5-coder:3b` (prompt scoped to the authorized file), on a disposable temp fixture
with one authorized file `src/math.ts`. Objective: implement `add`/`mul`. Result (live, ~4.0 s):

```
status: EXECUTED   verified: true   committed: false
authoredBy: LOCAL_PROVIDER   appliedBy: ODG_EXECUTOR
scope: all 1 change(s) within the authorized write-set
verification: add(2,3)=5 & mul(2,3)=6 verified
changedPaths: [ "src/math.ts" ]
```
The model produced correct novel TypeScript:
```ts
export function add(a: number, b: number): number { return a + b; }
export function mul(a: number, b: number): number { return a * b; }
```
ODG — not the provider — resolved the write-set, isolated a working copy, **validated scope** (fail-closed),
**applied in-scope only**, and **independently verified real behaviour** (executed add/mul), then capped at
VERIFIED and did **not** commit. This is genuine autonomous novel-code implementation under ODG governance.

## 3. What this proves vs. does NOT
- PROVES: a real, already-present LOCAL model, driven through ODG's governed chain, produces an in-scope,
  behaviour-correct change that ODG validates/applies/verifies autonomously — execution AND quality evidence.
- Fail-closed behaviour (out-of-scope atomic refuse, malformed output, verification-fail, no-authorization,
  idempotent replay, provider-never-commits) remains proven DETERMINISTICALLY by the committed STUB test
  `implement-via-local-provider.test.ts` (22 assertions) — not re-proven with the (non-deterministic) model.
- Does NOT prove the model is reliable across arbitrary tasks (one task, one model). No general quality claim.
- The live harness is intentionally NOT committed (it is env-dependent: requires ollama + the model; it would
  be a flaky/CI-absent test). The deterministic STUB test stays the committed gate.

## 4. Follow-up to make it PERMANENT (bounded; one governance decision)
The hardened path `local-model-manager.complete()` runs the model command inside the bwrap `provider-sandbox`
with `--unshare-all` (NO network). `ollama` needs its **localhost** daemon (127.0.0.1:11434), which the
no-network sandbox blocks — so the live proof called ollama DIRECTLY (bounded: it only saw the scoped prompt
and wrote only the working copy), NOT through the hardened sandbox.
**Decision required (governance, not red):** either (a) allow loopback-only access for a LOCAL-inference
provider in the sandbox (a deliberate loosening of the no-net invariant — reserved to governance because E1–E6
hardened it), or (b) use a fully in-process/offline model binary (e.g. a llama.cpp gguf) that needs no daemon
(a download — not red, but a resource step). Until decided, `ODG_LOCAL_MODEL_CMD` stays unset and the capability
fails closed (GENERATOR_UNAVAILABLE) in production — no external/billable fallback.

## 5. Reproduction
Scratchpad harness `stage6-real-proof.cjs` (not committed): materialize a temp fixture, inject
`generate = ollama run qwen2.5-coder:3b`, call `implementViaLocalProvider({root, activation:"AUTONOMOUS_SANDBOXED",
generate, verify})`, assert `status===EXECUTED && verified`. Requires a host with ollama + qwen2.5-coder:3b.

## 6. PRODUCTION-WIRED (D-Stage6 authorized 2026-10-19) — measured, not injected
`implementViaLocalProvider` now defaults its `generate` to a narrow LOCAL adapter (`defaultLocalGenerate` +
`resolveModelInvocation` + `localModelPresent` in `capability-executors`): `ODG_LOCAL_MODEL_CMD` argv, else
`ollama run <ODG_LOCAL_MODEL|qwen2.5-coder:3b>` on the **loopback** daemon — no external network, no download,
no cost; NEVER an external/billable fallback. The untrusted-output isolation is unchanged (working-copy +
fail-closed `validateScope` + independent `verify` + VERIFIED cap + never-commit); E1–E6 is NOT globally
disabled; `local-model-manager` is untouched (its no-net sandbox blocks ollama's localhost — this adapter is
the CTO-sanctioned narrower local path). The loopback client call is not yet network-namespaced (hardening
follow-up).

**Measured over the PRODUCTION-WIRED path (real ollama, NO injected generate), 4 bounded disposable-fixture
tasks:** 3/4 EXECUTED+verified (add/sub, isEven, reverseStr — behaviour independently checked); 1 miss (max2)
⇒ ODG returned **FAILED (verified:false, committed:false) — NO false success**. This is ONE model / 4 tasks:
the wired path works AND fails closed; it is NOT a general-reliability claim and defines no SLO.

**Committed deterministic tests:** `implement-via-local-provider.test.ts` (33 assertions) covers the adapter
with an INJECTED runner (no real model in the suite) + the STUB fail-closed matrix; `present:false` forces
deterministic unavailability. Real-model runs stay out of the committed suite (env-dependent).

## 7. Reliability campaign + adapter root-cause fix (CLI → loopback HTTP API, 2026-10-19)
**Root cause fixed:** the adapter invoked the `ollama run` CLI, which emits terminal cursor-rewrite controls
(`\x1B[nD\x1B[K`) that corrupt captured code at line-wrap boundaries (duplicated tokens ⇒ syntax errors).
`resolveModelInvocation` now uses the **loopback ollama HTTP API** (`POST http://127.0.0.1:11434/api/generate`,
`stream:false`) via `curl` (sync); a non-loopback `OLLAMA_HOST` is refused (never external). `cleanCompletion`
also strips `\r`/keypad escapes. Clean machine interface — no terminal artifacts.

**Reproducible campaign (model qwen2.5-coder:3b `f72c60cabf62`, WIRED path, real inference, tsx verifier that
EXECUTES the applied TypeScript):** 5 progressive tasks → **3/5 EXECUTED+independently-verified**:
- T1 simple (add/sub) ✓ · T2 edge-case (safeDiv ÷0→null) ✓ · T5 reproduced-defect-fix (off-by-one sumToN) ✓
- T3 strict input-validation ✗ — model used lenient `parseInt` (accepts "3.5"); T4 transform ✗ — correct logic
  but dropped the `export` keyword (not importable).
Both failures returned **FAILED (verified:false, committed:false) — NO false success** (independent verification
caught them). These are genuine 3b-model output limits, NOT harness defects. Honest measurement: one small
model, 5 bounded tasks — NOT a general-reliability claim; SEPARATE from the deterministic 25% benchmark; no SLO.
Harness is env-dependent (scratchpad, not committed); the committed suite stays deterministic (injected runner).
