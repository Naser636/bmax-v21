# Gate-A Design — p0c-entry-authorization-design (P0-C#1 follow-on)

**Status:** Gate-A design complete. **Decision is OWNER/ARCHITECTURE-gated** (per the register entry);
this document analyzes and recommends — it authorizes no execution-entry change.
**Date:** 2026-10-31. **Author:** ODG implementer (Claude Code), standing autonomous mandate.

## Question
Should a bare `odg-run <mission>` require a **deny-by-default per-mission authority grant AT the
native-executor entry** (option A), or is the current **downstream enforcement** model the intended
design (status quo, option B)?

## Current reality (evidence, file:line)
The odg-run entry performs **no per-mission authority check** today:
- `runtime/bin/odg-run.ts:56` `authorizeMission()` → `runtime/core/governance-kernel.ts:33-54` returns a
  **lifecycle-transition fact only** (`authorityEnforced:false` by construction, `:46`). The only entry
  STOP is a terminal-state lifecycle check (`odg-run.ts:72`). The source comment (`odg-run.ts:65-77`)
  states explicitly that per-mission AUTHORITY is enforced DOWNSTREAM, never at entry.
- `runtime/bin/odg-run.ts:90-102` a **repo-safety** truth-lock gate runs at entry but is **opt-in**
  (`ODG_TRUTH_LOCK_ENFORCE`, default record-only) and checks git state (branch/HEAD/clean index),
  **not authority** (`runtime/core/truth-lock.ts:38-53`).

Effects are contained by a **layered, deny-by-default DOWNSTREAM chain**:
1. **action-gate** (`runtime/core/action-gate.ts:64,121-244`) — per-action, `denyByDefault:true`; gates
   consequential classes WRITE/COMMUNICATE/TRANSACT/DELETE/IRREVERSIBLE (READ/ANALYZE/GENERATE ungated);
   requires STATE+CONTRACT+POLICY+AUTHORITY; ESCALATE for DELETE/TRANSACT/IRREVERSIBLE. Invoked in
   `runtime/core/patch-executor.ts` before any file write (hard refusal throws pre-write) and composed by
   `capability-executors.ts` (governed bash self-gates).
2. **capability-authorization** (`runtime/core/capability-authorization.ts:289-420`) — explicit **human
   grant** (mission-bound, scoped, expiring, non-revocable-transfer) required for consequential
   capabilities (Git Branch Integration / Bash / External Research; `:62-74`). Grants enter via the
   `odg objective --authorize` CLI (`runtime/bin/odg-objective.ts:419-457`), NOT via odg-run.
3. **mission-ledger proven-gate** (`runtime/core/mission-ledger.ts:40-65`) — **default-DENY**: refuses to
   record success unless a mission-matched `validated===true` report exists. An unauthorized/again mission
   cannot be recorded as a success.
4. **canary admission** (`runtime/bin/odg-schedule-tick.ts:60,208-212`) — a real **deny-by-default
   per-mission allowlist** (empty ⇒ deny-all) + code-enforced read-only safety — but it governs ONLY the
   autonomous scheduler's synthetic canary queue, not a direct `odg-run`.
5. unattended **launcher truth-lock** is DEFAULT-ON (`odg-schedule-tick.ts:155-171`) and propagates
   `ODG_TRUTH_LOCK_ENFORCE=1` to the child; systemd unit sets it too.

**Conclusion of fact:** the status quo is *downstream* enforcement. Starting a mission via bare odg-run is
not gated by authority; its *effects* are gated per-action/per-capability, and its *success recording* is
default-deny. Read-only/observational stages of any mission can run unauthenticated.

## Options
**A — entry deny-by-default per-mission authority grant.** Add, at the odg-run chokepoint
(`odg-run.ts` between :56 and :72), a gate that refuses to START a mission absent an explicit authority
grant/allowlist.
- Pro: a single chokepoint covering every spawn (direct + dispatcher); audit trail of mission *starts*;
  blocks resource use by an unauthorized mission before any stage.
- Con: **high blast radius.** 7+ legitimate callers invoke odg-run today with NO per-mission grant and
  would break unless each is granted/allowlisted/bypassed: the autonomous scheduler
  (`odg-schedule-tick.ts:134-136`), recovery (`odg-recover.ts:106`), the local-pipeline front door
  (`odg-local-pipeline.sh:252`), CI evidence pilots/parity (`scripts/odg-execution-evidence-pilot.ts:62`,
  parity/closure scripts), post-boot smoke (`g8-postboot-verify.sh:22`), the entry truth-lock test, and
  the default `BUILD_RUNTIME` fallback (`odg-run.ts:54`). A blanket deny risks a self-inflicted outage of
  the operator/dev/CI/autonomy paths for marginal added containment (effects already gated).

**B — status quo (downstream enforcement).** Keep entry ungated; rely on the layered deny-by-default
chain above.
- Pro: no blast radius; effects + success-recording already deny-by-default and independently proven; the
  model is explicit and documented in code.
- Con: an unauthorized mission's non-consequential (read-only) stages can run and consume local resources;
  no first-class audit record of *who authorized this mission to start*.

**C — opt-in, record-by-default entry authority gate (recommended middle path IF the owner wants
defense-in-depth).** Mirror the truth-lock pattern exactly: at the odg-run chokepoint evaluate a
per-mission `authorityGate(mission, {enforce})`, ALWAYS write an authority-decision record to
`runtime/generated/`, but only BLOCK when `ODG_AUTHORITY_ENFORCE` is explicitly set (default record-only).
Reuse `capability-authorization` grant shapes; no new primitive.
- Pro: zero blast radius by default (every current caller keeps working, record-only); gives the owner an
  opt-in enforcement switch + a complete audit trail of mission starts; reversible (flag off); consistent
  with the existing opt-in truth-lock discipline operators already know.
- Con: not enforced-by-default, so it is an *audit + optional* control, not a hard entry gate — until the
  owner flips the env (and populates an allowlist/grant for the legitimate callers).

## Recommendation
**Adopt B as the standing model; it is sound and the layered downstream deny-by-default chain already
contains effects and success-recording.** Do NOT ship a blanket entry deny-by-default (option A) — its
blast radius across the autonomy/operator/CI paths is not justified by the marginal containment it adds
over the existing per-action/per-capability/ledger gates.

**IF the owner wants first-class entry authority (audit of mission starts + an enforcement switch), adopt
C** — an opt-in, record-by-default per-mission authority gate at the odg-run chokepoint, which is bounded,
reversible, and breaks no current caller until explicitly enabled. That would be a separate **Gate-B**
contract (write-set: `runtime/bin/odg-run.ts` + a small `authority-gate` module reusing
`capability-authorization` + a hermetic entry test proving record-only-by-default and enforce-on-block,
plus allowlist/grant coverage for the 7 legitimate callers before any enforce-by-default flip).

## Escalation (OWNER DECISION REQUIRED)
Per the register entry, the choice between B (status quo, no code) and C (opt-in entry audit/gate, Gate-B)
is an owner/architecture call. **Escalated to the CTO.** No execution-entry authorization change will be
made without an explicit owner decision authorizing a Gate-B contract. Until then the item is DEFERRED on
this owner decision; the status quo (B) remains in force and is safe.
