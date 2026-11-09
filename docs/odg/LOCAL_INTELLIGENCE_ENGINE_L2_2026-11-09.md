# V12.4 — ODG Local Intelligence Engine: L2 Native Engineering Loop PROVEN (2026-11-09)

**CTO Master Directive §5/§13 Step 2 — L1 → L2.** The local coding model (`qwen2.5-coder:7b`, CPU-only) performed a **real
code modification, independently verified and reversible**, in an isolated workspace. L2 is declared **only after the full
chain validated** (§6). Truth Lock `main @ 37c01ad`; preservation intact (5 stashes / 6 untracked). No tracked repo file
was modified by the model; no cloud fallback; no permission escalation (§9).

## The native loop (every step real, measured)

| Chain step | What happened (measured) |
|---|---|
| MISSION | fix a controlled defect in `clamp(x, lo, hi)` |
| CONTEXTE / MÉMOIRE / PLAN | buggy module + failure description assembled (the model is NOT given the test) |
| MODEL SELECT | `qwen2.5-coder:7b` via `ollama-provider` (local, CPU) |
| GÉNÉRATION LOCALE | model output: `return x < lo ? lo : x > hi ? hi : x;` (~6 tok/s, 35 tokens, 22 s) |
| ANALYSE / PATCH / APPLICATION | parsed + applied to the isolated workspace file; **diff is minimal** (only the buggy line replaced) |
| BUILD | `tsc --strict` on the patched module ✓ type-checks |
| TESTS (before→after) | **independent ODG-authored test**: BEFORE = FAIL (`clamp(-3,0,10)` returned −3), AFTER = **ALL PASS** |
| DIAGNOSTIC / CORRECTION / RÉGRESSION | no regression; the 3 independent assertions (within-range, below-lo, above-hi) all pass |
| ASSURANCE INDÉPENDANTE | the test was authored by ODG, run with `tsx` — **independent of the model that generated the patch** (the model never saw or wrote the test) |
| RÉVERSIBILITÉ | revert → the independent test **FAILS again** (the defect returns) ⇒ reversible verified |
| ACCEPTATION ODG / PREUVES / CLÔTURE | ODG accepts on the independent evidence; recorded here |

## Honest level verdict

- **L0 ✓** (model operational) · **L1 ✓** (exploitable generation, Phase-0) · **L2 ✓ PROVEN THIS LOT**: a real file
  modification by the local model, **verified by an independent test** (before FAIL → after PASS) and **reversible**, in
  an isolated workspace.
- **Scope honesty:** L2 is proven for a **controlled synthetic defect in an isolated workspace** — exactly the §5
  environment (isolated workspace, synthetic defect, reversibility, model-independent assurance). It is **NOT** a claim
  that the model may modify **tracked production code** autonomously (that stays gated — it would need the governed
  patch-executor + full gate + independent review, not a single demo). No overclaim.
- **L3/L4 NOT declared:** L3 (a full real engineering mission end-to-end via the governed executor) and L4 (long
  campaigns + autonomous recovery) are the next steps; studied, not claimed.

## Significance for the Stage-E residual

Stage-E (ODG authoring/repairing code natively without Claude Code) is now demonstrated at **L2 on existing CPU hardware**
for controlled defects: the local model generates a fix, ODG applies + independently verifies + proves reversibility —
**without Claude Code authoring the fix.** The remaining frontier is scaling this (slow CPU ~6–8 tok/s) and promoting it to
tracked-code repair under the governed executor (L3) — a measured, reversible path, not a declared status.

## Gate boundary (unchanged)

The live model call stays OUT of the gate (non-deterministic/slow). `local-coding-qualification.ts` gate-tests the pure
scoring/level logic; this L2 run is **recorded, reproducible evidence** (re-run the loop against the installed model). No
flaky/NOT_RUN presented as PASS.
