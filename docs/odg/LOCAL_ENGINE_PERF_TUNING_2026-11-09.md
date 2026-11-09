# V12.4 — Local Engine CPU Performance Tuning (measured, 2026-11-09)

**CTO §4/§7 — improve CPU inference without purchase.** DISCOVER→RESEARCH→BENCHMARK→VALIDATE on `qwen2.5-coder:7b`
(8-core Haswell CPU-only). Every change requires a **demonstrable** benefit; a measured-negative change is **rejected**.

## Measured results

| Option | Baseline | Tuned | Verdict |
|---|---|---|---|
| **`num_thread=8`** | ~9.0 tok/s (Ollama default) | **~7.0 tok/s** + forced ~11 s reload | **REJECTED** — measurably SLOWER; Ollama's default thread count is near-optimal (HT overhead on Haswell). Not exposed. |
| **`keep_alive`** | model unloads after idle ⇒ ~11 s reload per later call | 2nd call `load_ms ≈ 3` (resident) | **ADOPTED (optional)** — a multi-mission (L4) campaign keeps the model resident, avoiding a reload per mission. |

## Change (minimal, additive, default-preserving)

`ollama-provider.generate` now accepts an **optional** `keepAlive` (e.g. `"10m"`) passed through to the daemon's
`keep_alive`. **Default behaviour is unchanged** (omitted ⇒ Ollama default). Gate-tested with an injectable transport
(no live model): default omits `keep_alive`; `keepAlive:"10m"` sets it; empty is ignored (fail-safe). `num_thread` is
**not** exposed (measured worse).

## Honest conclusion

The genuine, demonstrable CPU win is **model residency across a campaign** (`keep_alive`), not thread forcing. Raw tok/s
(~9) is model/hardware-bound; materially faster inference would need a smaller/faster model (download = owner decision)
or faster hardware (purchase = owner decision) — **neither performed** (no purchase, no unauthorized download). The
adopted change is small, safe, measured, and default-preserving.
