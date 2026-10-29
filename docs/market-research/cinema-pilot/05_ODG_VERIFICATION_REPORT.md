# ODG Independent Verification Report — CINEMA_SCRIPT_SPINE_PROBE_V1

**2026-10-23 · sourceCommit 28c15a5 · verifier ran from the sandbox (cwd ≠ repo root), read-only to repo.**

ODG (orchestrator) independently verified the artifacts authored by the bounded provider delegate. The
verifier is deterministic: it recomputes sha256 of every cited source, confirms each load-bearing quote exists
byte-wise in that source, confirms every `[FACT→Pn]` resolves, and checks the prohibition + structure
requirements. (Verifier script retained in the session sandbox; logic summarized here.)

## Result: **PASS — 21/21 checks** (pass=21, fail=0)

- sha256 of all 4 cited sources == values asserted in `03_PROVENANCE_REGISTER.md` ✓ (truth-lock.ts,
  truth-lock-gate.ts, truth-lock-chokepoint.test.ts, evidence-provenance.ts).
- 10 load-bearing quotes (P2–P9) confirmed present byte-wise in the real source ✓.
- All 9 `[FACT→Pn]` ids in the script are defined in the register; zero ungrounded factual claims ✓.
- Deliverables assert NO media generated + ZERO spend ✓.
- Structure: §251 Film Mission Constitution present; FACT/OPINION/CREATIVE separated; shot-plan textual-only;
  needs+estimate carries the mandatory human-verdict gate ✓.

## Honest finding caught by this pass (and corrected)
Initial run FAILED 1/21: register entry **P7** paraphrased the gate's refusal text as a single line
("…exits 1, no stage runs"), but in the source that sentence **wraps across two comment lines**. The *claim is
true*; the *quote was not byte-faithful*. Correction applied: P7's evidence now quotes the two comment-line
fragments exactly, and the verifier checks both fragments. Re-run → **21/21 PASS**. No claim was weakened or
removed; a provenance imprecision was made exact. This is the probe demonstrating its own value — the Truth-Lock
discipline it describes, applied to itself.

## Prohibition trace (contract invariants honoured)
- Network: NONE (offline; `permissions.network=false`; verifier reads local files only).
- Spend: €0 (no paid call, no purchase).
- Media generation: NONE (no image/video/audio/voice/music).
- Publication / public exposure: NONE.
- System/preprod/8080/allowlist: untouched. Git: HEAD 28c15a5 unchanged; no commit/push.
- Execution: sandboxed (cwd ≠ repo root); diff limited to write_set (cinema-pilot docs + compass; contract file
  gitignored by convention).
- Delegation accounting: the creative *writing* was a bounded provider delegation (ODG has no proven native
  reviewer-quality prose generation — the gap under test); it is NOT counted as ODG-native autonomy. ODG's
  contribution = orchestration + this independent verification.

## What is proven vs not
- PROVEN (by this pass): the artifacts are internally consistent, every factual claim is provenance-traced to a
  byte-verified source, and all contract prohibitions held.
- NOT proven (by design — requires the human gate): editorial/creative quality. The mandatory human verdict
  ("usable with ≤ minor corrections" | "needs rework") is the final acceptance and has NOT been given. Until it
  is, the probe is NOT complete.

---
## Rev. 2 — corrective iteration (CTO verdict USABLE_WITH_MINOR_CORRECTIONS), re-verified 2026-10-23
Bounded text-only iteration applied to `01_PILOT_SCRIPT.md`:
1. Removed inline stage directions + meta "terminal artifacts" from the spoken flow; FACT/OPINION/CREATIVE
   separation preserved as a structured mapping (clean oral narration). (grep: 0 [NARRATOR]/[ON SCREEN] in body.)
2. De-duplicated Beat 3 (single refusal/receipt statement; removed the cross-beat restatements).
3. Re-checked every technical claim vs the provenance register + exact sources; **added the required nuance** —
   the script now states Truth-Lock "is not a force field … does not make the system secure … guards exactly
   one narrow thing" (which version of itself it acts as), grounded in P3/P5/P7. (grep: nuance present ×2.)
4. Polished the CLOSE for voice; title, angle, structure, central message UNCHANGED (grep: title ×1).
Re-verification: **ODG VERIFY PASS 21/21** (sha256 unchanged + valid; 10 quotes byte-present; P1–P9 all
defined; no media/spend; structure intact). Integrity: HEAD 28c15a5 unchanged; no change outside the write_set;
no commit/push; offline; €0; no media/publication/system change.
