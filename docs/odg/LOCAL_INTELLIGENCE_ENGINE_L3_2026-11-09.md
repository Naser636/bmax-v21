# V12.4 — ODG Local Intelligence Engine: L3 GOVERNED Native Repair on TRACKED Code PROVEN (2026-11-09)

**CTO Execution Order L2 → L3.** The local model (`qwen2.5-coder:7b`, CPU) repaired a **real Git-tracked repository
file** through the **governed write-set guard**, independently verified and reversed via **git-native rollback**. L3 is
declared **only after the complete governed chain succeeded** (§6). Truth Lock `main @ bf75f77` (the fixture committed +
tracked); preservation intact (5 stashes / 6 untracked); working tree clean after rollback. No production code modified
(a dedicated tracked fixture — §3); the model generated the repair, **Claude did not write it** (§4).

## The governed chain (every step real + measured, on the TRACKED fixture)

| Chain step | Result |
|---|---|
| TARGET (§3) | `runtime/core/__l3fixture__/clamp-fixture.ts` — a **committed, git-tracked** fixture (not production), with its own independent gate test |
| CONTROLLED DEFECT | `clamp` returns `x` for `x < lo` (ignores the lower bound) — introduced into the tracked file |
| INDEPENDENT TEST (before) | **FAIL** (`clamp(-3,0,10)` returned −3) — a real, reproducible failure |
| LOCAL MODEL generation | `qwen2.5-coder:7b` produced `return x < lo ? lo : x > hi ? hi : x;` — **the model generated the repair, not Claude** |
| POLICY / WRITE-SET VALIDATION | `l3-governed-repair.guardAuthorizes` (reusing `repair-workflow.makeWriteSetGuard`) **authorized** the fixture path **before** writing; out-of-set / `..` traversal / absolute paths are **rejected** (gate-tested) |
| GOVERNED APPLY | the repair was written **only through the authorized guard** |
| BUILD | `tsc --strict` ✓ |
| INDEPENDENT TEST (after) | **PASS** (all 3 assertions) — model-independent assurance |
| CONFINEMENT CHECK | `git status`: **only `clamp-fixture.ts` modified** — no unauthorized tracked file changed |
| ROLLBACK | **`git checkout -- <fixture>`** → independent test PASS, **working tree clean (0 modified)** — git-native reversibility |
| ODG ACCEPTANCE | ODG accepts on the independent evidence; recorded here |

## §5 Write-set security (gate-tested, `l3-governed-repair.test.ts`)

The reused guard **rejects**: out-of-write-set paths, `..` traversal, absolute paths. `scoreL3` is fail-closed: any
file changed **outside** the authorized write-set is a **CONFINEMENT BREACH ⇒ NOT L3**; a Claude-written (not
model-generated) repair ⇒ NOT L3; no defect-before / no pass-after / non-minimal diff / no Truth Lock / no rollback ⇒
NOT L3. Security controls were **not weakened** to pass.

## Honest level verdict

- **L0 ✓ · L1 ✓ · L2 ✓ · L3 ✓ PROVEN**: the full governed chain succeeded on a **git-tracked** file — local-model-generated
  repair, write-set-confined governed apply, independent FAIL→PASS, confinement held, git-native rollback, Truth Lock
  intact.
- **Scope honesty:** proven on a **dedicated tracked fixture** with a **controlled synthetic defect** — exactly the §3
  environment (real tracked file, controlled defect, fully reversible). It is **NOT** a claim that the model may
  autonomously repair **arbitrary production code** unattended — that remains governed per mission (write-set +
  independent review + full gate), which is precisely what L3 demonstrates the *mechanism* for.
- **L4 NOT declared:** long campaigns / multi-mission / autonomous recovery / interrupted-mission resumption are the next
  step — studied, not claimed without evidence (§9).

## Significance

The **Stage-E residual** (ODG performing real software engineering on its own tracked repository without Claude Code
authoring the change) is now demonstrated at **L3** on existing CPU hardware, **under the real governance** (write-set
confinement, Truth Lock, independent assurance, git-native rollback). ODG directs; the local model generates; the
governed guard applies; the independent test verifies; ODG accepts.

## Gate boundary

The live model call stays OUT of the gate (non-deterministic/slow). `l3-governed-repair.ts` gate-tests the pure
governance+scoring logic + guard security; the fixture's independent test is in the gate (passes on the repaired state).
This L3 run is **recorded, reproducible evidence** (re-run the loop; `git checkout` restores the fixture). No flaky/
NOT_RUN presented as PASS.
