# P0-AUTONOMY-MEASURE — SLICE 2 DESIGN (GATE A, design-only) — V1, 2026-10-31

**Status:** GATE A COMPLETE (inspection + diagnosis + design). **NOT implemented. Awaiting CTO Gate-B authorization.**
**Truth Lock at authoring:** branch `main`, HEAD == origin/main == `52410fc`, divergence 0/0, tracked tree clean;
foreign untracked files + 5 stashes + single worktree preserved. No ledger modified. No slice 2 launched.
**Method:** 3 independent read-only audits (A write-path, B provenance/false-attribution/roles, C test design), each
distinct from the designer; no agent accepted its own work. 9 primitives FROZEN; composes EVIDENCE + STATE.

---

## 1. Diagnosis — the real execution path (why the actor share is NON-MEASURABLE today)

`recordMission(mission: string)` (`runtime/core/mission-ledger.ts:38`) builds every ledger entry (fields at
`:162-178`) from governance / lifecycle / report / plan / context — **no actor/executor field exists**. The 1388
historical entries carry `recordedAt, mission, runId, state, authorized, nextStates, lifecyclePath, archived,
constitutionVersion, policyVersion, strategy, objectives, proven, validated` — and nothing about *who executed*.

The two production finalizers (pipeline "Mission Ledger" stage via `odg-run` spawn; `AutonomyRuntimeAdapter.archive`)
reach `recordMission` through a **child-process CLI that passes `[file, mission]` only** — they cannot pass an actor
argument without editing both spawn sites and the CLI parser.

The REAL executor IS knowable — but only from one artifact. `runtime/core/patch-executor.ts` (`:149-156`) stamps per
`executed[]` entry: `authoredBy` (the proven content origin; default `UNKNOWN`, never assumed ODG), `appliedBy`
(`ODG_EXECUTOR` only when this executor produced the effect), `authorizedBy`, `humanMandatory` — written to
`runtime/generated/patch-execution.json` (mission-scoped, `:136`). This is the **single trustworthy per-action
provenance source** and it is causally upstream of the ledger stage.

**Critical honest limitation (Agent B):** `odg-delegate` HISTORICAL mode — the DEFAULT path where Claude Code edits
the working tree — stamps **no** provenance (it only scope-checks/verifies/converges/archives). Isolated mode applies
a scope-validated diff but does not propagate authorship either. So *most real-world delegated missions have no
author stamp and are correctly UNKNOWN, never ODG*. Slice 2 measures what is honestly attributable; it does not invent
provenance for the delegate path (adding a delegate-mode stamp is a separate, larger write-path change — out of this slice).

Existing vocabulary to REUSE (do not re-mint), `runtime/core/autonomy-measure.ts`: `ACTOR = {ODG, OPERATOR, EXTERNAL}`,
`AUTHORED_BY = {ODG_CAPABILITY, ODG_RULES, PROVIDER, OPERATOR, CONTRACT, UNKNOWN}`, `APPLIED_BY_ODG = "ODG_EXECUTOR"`,
`actorFromAuthoredBy()` (fail-closed → `null` on any unrecognized author), and `classify()`'s demotion rule: **ODG
author + non-ODG applicator ⇒ never counted as ODG**. Gap found: `LOCAL_PROVIDER` (capability-executors) is not in the
enum ⇒ currently maps to UNKNOWN (safe but uninformative) — slice 2 reconciles it to TECHNICAL_PROVIDER.

Role note (CTO point 7): `authoredBy` = DECISION AUTHOR (captured); `appliedBy` = REAL EXECUTOR (captured per-action,
**missing at ledger level = the slice-2 target**); the VERIFIER is the Validation Engine mechanism (no `verifiedBy`
identity string); the ACCEPTANCE AUTHORITY is the governance/mechanical/economic/human gates (no `acceptedBy` identity).
Slice 2 stamps the **EXECUTOR only** and must never conflate it with author, verifier, or acceptor.

## 2. Proposed provenance architecture (honest, fail-closed)

**Actor enum (5 values), default UNKNOWN; proof rule per value:**
| actor | proof required (at record time, mission-scoped) |
|---|---|
| `ODG` | execution artifact `authoredBy ∈ {ODG_CAPABILITY, ODG_RULES}` AND `appliedBy === "ODG_EXECUTOR"` (and EVIDENCED for the verified bucket). Inherits the author+applicator demotion. |
| `TECHNICAL_PROVIDER` | `authoredBy ∈ {PROVIDER, LOCAL_PROVIDER}` (reconcile LOCAL_PROVIDER into the enum). Applicator may be ODG — that does NOT promote to ODG. |
| `HUMAN` | `humanMandatory === true`, or `authoredBy ∈ {OPERATOR, CONTRACT}`, or an explicit human acceptance artifact. Never inferred from blocked status. |
| `AUTOMATED_SYSTEM` | a system finalizer/scheduler record with no execution-author evidence (labels the *record act*, never read as ODG execution). |
| `UNKNOWN` | **default** — artifact absent / mission-mismatched / duplicate-ambiguous / unmapped author. All 1388 historical entries + all delegate-historical missions. |

**Write path (Agent A — Option A, single-file write-set).** In `recordMission`, derive the executor from the
mission-matched `patch-execution.json` using the SAME `=== mission` guard the function already applies to `plan`,
`report`, `checkpoint`. Append **conditionally after `:178`** (mirroring the existing optional `projectFiles` block at
`:180-183`): set `entry.executedBy` (raw signal) + `entry.actor` (normalized) ONLY when a trustworthy mission-scoped
signal resolves; **OMIT both** when absent/mismatched/ambiguous — the entry then stays byte-shape-identical to the 1388
legacy entries. Never default to ODG; never read `proven`/`validated` as an actor signal. Crash-atomic temp+rename,
`(mission,runId)` idempotence, and immutability are all provably unaffected by an optional field (no ledger schema
exists; no existing test asserts whole-object shape). *Option B (change `recordMission` signature)* is rejected for
slice 2: it forces a wide write-set across `odg-run.ts`, `autonomy-runtime-adapter.ts`, and the CLI parser for little
gain over reading the already-stamped artifact.

**Aggregator (`autonomy-program-aggregate.ts`).** Replace the frozen unconditional `ACTOR_NOT_MEASURABLE` with a split
computed over DISTINCT missions **that carry a recognized actor**: `denominator = entriesWithRecognizedActor` (NOT
`distinctMissions`, NOT `ledgerEntries`); buckets `{odg, technicalProvider, human, automatedSystem}` each
`{count, denominator, rate}`; `entriesWithoutActor` + `entriesWithUnrecognizedActor` surfaced separately; UNKNOWN never
credited; **0-denominator trap**: no recognized-actor entry ⇒ `actorAutonomy.measurable:false` (never `true` with
denom 0 — extends slice-1 case 4b). Slice-1 `outcome`/`byState`/dedup output stays byte-identical.

## 3. WORK_ITEM_CONTRACT — slice 2 (PROPOSED → authorize at Gate B)

- **id:** `p0-autonomy-measure-slice2`  ·  **program:** P0  ·  **objective:** make the §S-2 actor share MEASURABLE over
  entries that carry trustworthy provenance, honestly, with zero fabrication and zero retrofit of history.
- **write_set (EXACTLY):** `runtime/core/mission-ledger.ts` (conditional actor append only), `runtime/core/autonomy-program-aggregate.ts` (actor split), a small shared actor-normalizer that REUSES `autonomy-measure` vocabulary (either a new tiny `runtime/core/actor-provenance.ts` or an exported helper — decided at Gate B), `runtime/core/autonomy-program-aggregate.test.ts` (extend), NEW `runtime/core/mission-ledger-actor-provenance.test.ts`, `package.json` (add the new suite), `docs/odg/closure-register.json` (+evidence/acceptance). **No other file.**
- **authorized_symbols:** `aggregateProgramAutonomy` (extend), a `normalizeActor(authoredBy, appliedBy, humanMandatory)` helper, the conditional `entry.actor`/`entry.executedBy` append.
- **invariants:** pure/deterministic aggregator (ledger injected; no fs/clock/net); NO execution-path mutation beyond the conditional stamp; default-UNKNOWN; mission-scoped `=== mission` guard on the artifact read; never infer ODG from proven/validated; never retrofit the 1388; immutability + crash-atomic + idempotence preserved; 9 primitives FROZEN; Master/Constitution/ROADMAP.json untouched.
- **acceptance_criteria:** §5 test matrix green; slice-1's 19 assertions pass verbatim; the 5 existing `mission-ledger-*` suites pass unchanged; tsc clean BOTH tsconfigs; build OK; real-ledger soft check asserts actor NON-MEASURABLE on legacy; independent verifier (separate agent) signs the §5 checklist.
- **stop_conditions:** if an honest stamp requires a delegate-mode authorship change (execution-path, wide) ⇒ STOP (that is slice 3); if `patch-execution.json` proves not mission-scopable on the LOCAL route (open UNKNOWN) ⇒ stamp UNKNOWN there and document, do not force.
- **rollback (non-destructive):** the two source edits are additive (optional field + new aggregator branch); revert = drop the two commits / the field reader. No data migration, so nothing to un-migrate; the ledger is append-only and never rewritten, so no historical entry can be damaged. Branch-only until green + independently verified + merged.
- **evidence_required:** test outputs, tsc×2 + build, CLI aggregate over the real ledger (expect actor NON-MEASURABLE until real provenance accrues), independent verdict.

## 4. Risks · dependencies · still-unproven

- **R1 (honest ceiling):** on the current ledger the actor split will report **NON-MEASURABLE / 0 recognized actors** — because no entry carries provenance yet and the default delegate path stamps none. Slice 2 makes future ODG-native/patch-executor runs measurable; it does NOT retroactively make today's 1388 measurable. This is correct, not a defect — but it means slice 2 yields an *instrument*, not an immediate autonomy number.
- **R2 (delegate blind spot):** the default Claude-Code delegate path is unattributed ⇒ remains UNKNOWN. Closing it = slice 3 (stamp authorship at delegate promotion) — execution-path, separately gated. Dependency, not slice-2 scope.
- **R3 (LOCAL route UNKNOWN):** whether the src/runtime LOCAL route leaves a mission-scoped `patch-execution.json` at record time is UNVERIFIED (Agent A). Slice 2 handles it by omitting actor when absent (fail-closed), so it is safe either way; the design does not depend on resolving it.
- **R4 (hermetic test limits, Agent C):** true crash-mid-rename atomicity and concurrent lost-update cannot be injected hermetically (POSIX-argued + one-active-mission discipline); the TECHNICAL_PROVIDER positive is proven on INJECTED fixtures, never a live metered provider (external/paid-gated). Live provider attribution deferred to a CTO-gated economic run.
- **Dependencies:** reuse `autonomy-measure` vocabulary; slice-1 aggregator; patch-executor attribution stamp.

## 5. Test matrix + independent-verification criteria (Agent C, condensed)

- **POSITIVE:** ODG / provider / human actor each counted in the right bucket with denominator = recognized-actor entries (A1–A6).
- **NEGATIVE / anti-fabrication:** all-proven-no-actor ⇒ NON-MEASURABLE (never ODG); garbage actor ⇒ UNKNOWN, not credited; stale cross-mission `patch-execution.json` ⇒ no actor stamped (mirrors `scopedPlan` guard); missing artifact ⇒ omitted; conflicting executed[] ⇒ ambiguous ⇒ omitted; ODG-authored-but-not-ODG-applied ⇒ not ODG (B1–B7).
- **HISTORICAL COMPAT:** slice-1 fields byte-identical; 1388 legacy stay excluded from the actor denominator; real-ledger soft check NON-MEASURABLE; immutability (C1–C4).
- **PERSISTENCE (hermetic, temp fixtures only):** actor round-trips temp+rename; `(mission,runId)` idempotence stable with the field; no `.tmp-*` residue; corrupt-ledger refuse-to-append unchanged (D1–D4).
- **ROLE SEPARATION:** executor ≠ author ≠ verifier ≠ acceptor read from 4 distinct sources; provider-executed-but-ODG-verified/accepted stays EXTERNAL; an ACCEPT never stamps actor=ODG (E1–E4).
- **GATE NON-WIDENING (F-reg):** absent report + present actor artifact ⇒ `UNPROVEN`, nothing recorded — actor is never a proof substitute. Re-run the 5 existing `mission-ledger-*` suites as a no-regression gate.
- **INDEPENDENT-VERIFY checklist:** fabrication attack; stale cross-mission attack (literal `===` not substring); missing-data ⇒ UNKNOWN; 0-denominator trap; determinism (grep no Date/random/fs in core); aggregator off-execution-path (grep mission-ledger does not require the aggregator); role non-conflation (4 distinct reads); gate non-widening; frozen output + immutability; real-ledger honesty; denominator identity (`odg+provider+human+automated === denominator`, and `withoutActor + unrecognized + denominator === distinctMissions`).

## 6. PRECISE CTO DECISION expected to open GATE B

Authorize implementation of slice 2 under this contract, and decide the three design options:
1. **Write-source:** approve **Option A** (read the mission-scoped `patch-execution.json` inside `recordMission`,
   single-file write-set) — RECOMMENDED — vs Option B (change the `recordMission` signature + spawn sites).
2. **Actor-normalizer location:** a small new `runtime/core/actor-provenance.ts` (reused by ledger + aggregator) vs an
   exported helper from `autonomy-measure.ts`. (Recommend the new tiny module to keep `autonomy-measure` untouched.)
3. **Scope boundary:** confirm slice 2 is **measure-only** and that closing the delegate-path blind spot (stamp
   authorship at delegate promotion) is **slice 3** (execution-path, separately gated) — i.e. accept that the
   immediate actor number will be NON-MEASURABLE until real provenance accrues (R1).

On Gate-B authorization: execute the contract (DIAGNOSE already done → EXECUTE → TEST → INDEPENDENT-VERIFY → ODG
ACCEPTANCE), branch-only, green-gated merge, no force-push, no VPS/secrets/paid calls.
