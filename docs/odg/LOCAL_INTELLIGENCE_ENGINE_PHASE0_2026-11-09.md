# V12.4 — ODG Local Intelligence Engine, Phase 0: Install Audit & Local Coding Qualification (2026-11-09)

**CTO strategic transition authorization — Phase 0 (§2/§3/§6).** Read-only audit (no reinstall, no download — §2) + a
measured qualification of the local coding model. This directly addresses the **Stage-E residual** (ODG authoring novel
code natively). No cloud fallback, no purchase, no permission escalation (§5). Truth Lock `main @ aabe3a9`; preservation
intact (5 stashes / 6 untracked).

## §2 — Real installation (audited, measured, not assumed)

| Item | Reality (measured 2026-11-09) |
|---|---|
| Ollama | **v0.35.1** at `/usr/local/bin/ollama`; local API **live on 127.0.0.1:11434** |
| Model(s) downloaded | **`qwen2.5-coder:7b`** — 7.6B params, **Q4_K_M** quant, ctx **32768**, 4.68 GB (a dedicated *coding* model), pulled 2026-10-19 |
| CPU | 8 cores, Intel Haswell (no TSX), **CPU-only** |
| RAM | 22 GiB total, 21 GiB available |
| Storage | 161 GB free of 193 GB |
| GPU / VRAM | **none** (no nvidia-smi) — inference is CPU-only |
| ODG adapters | `ollama-provider` (generate / buildRepairPrompt / parseEditsProposal / detectOllama), `ollama-control-plane`, `local-model-manager`, `generative-repair-adapter` — the ODG↔model connection exists |
| Offline | the model + ollama are local; inference needs no network |

## §3 — Local coding qualification (measured, reproducible)

**Task A — generate exploitable TypeScript (temp 0):** prompt "write `sumEven(nums: number[]): number`". Result:
```typescript
function sumEven(nums: number[]): number {
  return nums.filter(num => num % 2 === 0).reduce((acc, num) => acc + num, 0);
}
```
- **Correct logic.** Written to an **isolated workspace** (§5), then: **`tsc --strict` type-checks ✓** and **executed:
  `sumEven([1,2,3,4,6]) === 12` ✓**.
- **Performance (CPU):** ~7.9 tokens/s; ~5.4 s eval for 43 tokens; ~20 s end-to-end incl. model load. Slow but functional.

**Honest verdict:** the local model produces **real, compilable, test-passing TypeScript** — not just explanations.

## §6 — Qualification level (never declared without proof)

`runtime/core/local-coding-qualification.ts` scores exploitability (compiled AND tested, fail-closed) and assesses L0–L4:

| Level | Definition | Status |
|---|---|---|
| **L0** model operational | ollama + coding model reachable | **✓ PROVEN** |
| **L1** generation & analysis | ≥1 exploitable generation (compiled + tested) | **✓ PROVEN** (Task A) |
| L2 real repo modifications | the LLM modifies a real repo file + tests pass | **NOT YET** (Task A ran in an isolated scratchpad, not a repo file) |
| L3 full engineering mission verified | MISSION→…→ODG-acceptance via the native loop | NOT YET |
| L4 long campaigns + autonomous recovery | — | NOT YET |

**Current level: L1, measured.** L2+ are honestly **not** declared — they require the native loop (generate → parse edits
→ apply to a real repo file in an isolated workspace → run the affected tests → ODG acceptance), whose primitives exist
(`ollama-provider.buildRepairPrompt` + `parseEditsProposal`, `generative-repair-adapter`) but which has not yet been
run+verified end-to-end on a real repo defect in this Phase.

## Significance for Stage-E

The Stage-E residual (ODG authoring novel code without Claude Code) is **partially addressable with existing local
hardware**: a 7B coding model runs CPU-only and writes exploitable TypeScript at ~8 tok/s. The path from L1 to L2/L3 is
the **next Phase** (wire the native loop on a controlled, reversible repo defect). **No level is claimed beyond L1; no
cloud fallback; no hardware purchased.**

## Gate-safe boundary

The live model call is **kept OUT of the gate** (non-deterministic, environment-dependent, slow) — `local-coding-
qualification.ts` gate-tests only the pure scoring/level logic (fail-closed: exploitable = compiled AND tested; no level
without proof). The live measurements above are recorded evidence, reproducible by re-running the prompt against the
installed model.
