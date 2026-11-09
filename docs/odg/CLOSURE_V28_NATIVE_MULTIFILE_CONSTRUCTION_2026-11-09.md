# V12.4 — V28: Native multi-file construction by ODG's local model (2026-11-09)

The honest V27 frontier — "native FRAMEWORK/multi-file authoring by the local models is not yet demonstrated" — is now
CROSSED for a bounded project: ODG's local 3B model constructed a complete, correct, interdependent 2-file project,
governed end-to-end, accepted only on an independent test. The PROJECT code is model-authored (native); the ORCHESTRATOR
is framework. All synthetic; nothing canonical unblocked.

## A. Initial state
HEAD=origin/main=`520ee2c`; tracked tree clean (5 stashes / 6 untracked preserved — verified present). Reused (not
rebuilt): repair-retry, repair-router, autonomy-claim-guard, actor-provenance, makeWriteSetGuard, ollama-provider, the
loopback Ollama 3B/7B. VPS posture unchanged (only SSH:22 public, edg-core loopback).

## B. Provenance (honest)
- **PROJECT code (ops.js + calc.js): AUTHORED BY the local 3B model** (ODG's native capability), governed by ODG
  (write-set confinement, assembly/build, independent verification). This is **native construction**, not provider-written.
- **ORCHESTRATOR (`native-project-builder.ts`): provider-authored framework** (like the prior V23–V27 modules) — stated
  plainly, consistent with V27 §2. `autonomy-claim-guard` attributes each accordingly (project = native-model + ODG-
  governed; orchestrator = TECHNICAL_PROVIDER). No Git-author-only attribution.

## C. Chantier 1 — Native multi-file construction (PROVEN, measured)
`native-project-builder.ts` (PURE orchestration, gate suite) governs SPEC → ARCHITECTURE → FILE GENERATION (local model,
dependency order, prior contracts in context) → WRITE-SET → BUILD (in-memory assemble/compile; a missing require fails
closed) → bounded REPAIR → INDEPENDENT VERIFICATION → INTEGRATION. Accepted ONLY on the independent test; valid files
retained on a later failure.
**Deterministic tests (gate):** 2 interdependent files assembled (imports resolve) + accepted on the independent test;
a syntax error ⇒ build FAILS ⇒ not accepted; a runtime-missing symbol ⇒ independent test catches it ⇒ not accepted; a
compiling-but-WRONG project (add→sub) ⇒ independent test rejects ⇒ **not accepted (false success caught)**; a file outside
the write-set ⇒ refused.
**LIVE native build (on the VPS loopback Ollama):** spec = a 2-file `calc` project (ops.js exports add/sub; calc.js
`require('./ops.js')` and computes via ops.add).
```
qwen2.5-coder:3b: filesGenerated 2/2, buildOk=true, verified=true, ACCEPTED=true, repairs=0, 12.9s
  src/ops.js  : module.exports = { add:(a,b)=>a+b, sub:(a,b)=>a-b };
  src/calc.js : const ops = require('./ops.js'); module.exports = (a,b)=>ops.add(a,b);
```
Independent test (`calc(2,3)===5 && calc(10,-4)===6`) PASSED. **ODG's local 3B natively built an interdependent
multi-file project with correct imports/contracts, in 12.9s, 0 repairs — accepted only on the independent verifier.**

## D/E. §4 (parse/semantic corpus) & §5 (repair-knowledge → reuse-ledger) — prepared for V29
Not done shallowly (the directive forbids five independent audits). V29 builds the advanced parse/semantic corpus (the
parse-edge class both models missed) + diagnoses the category + a structural capability (symbol/type/dependency check),
and connects accepted construction/repair outcomes to the EXISTING reuse-ledger (no parallel registry), measuring memory
reuse with falsifications.

## F/G. Full cycle + VPS
The SPEC→…→INTEGRATION cycle ran end-to-end for the bounded project; the generation executed on the **VPS's own loopback
Ollama** (the VPS resource). The orchestrator + test are integrated canonically (gate). This is an in-repo capability +
a live-model construction — NOT a deployed service (stated honestly; §10).

## H. Measures & falsifications
Local 3B native build: 2/2 files, build+verify pass, 0 repairs, 12.9s, 0 false success. Deterministic falsifications all
caught (syntax-fail, runtime-missing, compiling-but-wrong, write-set-violation). Independent verifier is the sole arbiter.

## I. Remaining limits
- Demonstrated for a SMALL (2-file) project; larger/more complex multi-module projects + the parse-edge semantic class are
  not yet proven natively (V29). The native capability is real but bounded — stated, not overclaimed.

## J. Capability states
- `native-project-builder` : REGISTERED + CONNECTED + CALLABLE (gate) + EXECUTED (live 3B build) + **VERIFIED** (independent
  test, falsifications caught). Native multi-file construction (bounded) = **EXECUTED + VERIFIED**.

## K/L. Boussole + V29
Register reconciled (new item `serie30-v28-native-multifile-construction`). HEAD=origin/main=`520ee2c`. §13 restrictions
intact. **V29 prepared:** (1) advanced parse/semantic corpus + structural repair capability; (2) repair/construction
knowledge → reuse-ledger (measured memory reuse); (3) larger multi-module native project (3–5 files, cross-module
contracts) with routing measured on multi-file work; (4) end-to-end native engineering mission (spec→integrated) with
provenance; (5) native-authoring limits map (where the local models break, by category).
