# V12.4 — Local Model Benchmark & Task-Aware Routing (CTO V6 §2/§3, 2026-11-09)

**Measured on the private VPS (8-core Haswell CPU-only), same controlled repair task (clamp), independent-test verified.**
No production code modified; no download/purchase/paid-call.

## §2 Results — 3 local models, same task

| Model | load_ms (warm) | eval_ms | tok/s | tokens | correctness (independent test) |
|---|---|---|---|---|---|
| `qwen2.5-coder:7b` | 2 | 1980 | **8.1** | 16 | **CORRECT** |
| `qwen2.5-coder:3b` | 2 | 2505 | **15.2** (~2× 7b) | 38 | **CORRECT** |
| `qwen2.5:0.5b` | 2 | 541 | **59.2** (~7× 7b) | 32 | **INCORRECT** (`x>hi?hi:x` — ignores lo; too weak) |

**Finding:** `3b` is ~2× faster than `7b` **and** produces correct code for simple repairs → best for SIMPLE tasks.
`0.5b` is fastest but **fails correctness** → never a default for a correctness-critical code task. `7b` is correct,
slower → reserve for COMPLEX tasks.

## §3 Governed optimization — `runtime/core/model-router.ts`

Benchmark-grounded, task-aware recommendation over the existing `ollama-provider.PREFERRED_MODELS` (no new transport):
- **SIMPLE** task → `qwen2.5-coder:3b` (fastest benchmarked-CORRECT; ~2× faster).
- **COMPLEX** task → `qwen2.5-coder:7b` (highest quality).
- A model benchmarked **INCORRECT** (`0.5b`) is **never** the default for a correctness task (fail-closed).
- Unknown model ⇒ not correctness-trusted ⇒ falls back to the quality model.

**Quality/security/reproducibility preserved:** the router only **recommends** — the **independent test** (l3-governed-
repair / l4-campaign `scoreL3`, which requires `testAfter=PASS`) remains the **sole arbiter of acceptance**. A faster
model's output is accepted **only if it passes the independent test** (demonstrated: a fast repair that fails the test ⇒
L3 not accepted). Speed never lowers the quality gate; Truth Lock + the nine primitives unchanged. Gate-tested
(`model-router.test.ts`, 11 assertions).

## Note on the existing default

`ollama-provider.PREFERRED_MODELS` already lists `3b` first, so the current default already selects the fastest-correct
model (the gain is realized by default now that 3b is installed). The router adds **explicit, benchmark-grounded,
task-aware** selection and guards against defaulting to the benchmarked-incorrect `0.5b`. Reversible (pure module; no
behaviour change to existing callers unless they opt in to `selectModel`).
