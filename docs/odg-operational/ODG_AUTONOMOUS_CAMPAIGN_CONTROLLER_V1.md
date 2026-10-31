# ODG Autonomous Campaign Controller — reality, mechanism, and the exact provider limit (V1)

**Date:** 2026-10-31. **Status:** forensically diagnosed + bounded lifecycle enrichment shipped.
**Principle:** this documents what is REAL. It does not fabricate background execution or claim a
provider session can survive its own termination.

## 1. What actually drives the campaign today (forensic, file:line)
The autonomous **consecutive-mission loop already exists and is proven** — it is not missing:
- `runtime/core/campaign-controller.ts` — PURE selector/transition over the durable SSOT
  `docs/odg/closure-register.json` (`selectNextLot`, `advance` fail-closed on evidence, `reconcile`,
  `summary`, crash-atomic `saveRegister`). No loop; never self-executes an effect.
- `runtime/core/campaign-loop.ts` — the in-process continuity loop `runCampaignLoop({execute,…})`:
  MISSION → verdict → persist(after EACH mission) → reconcile deps → select next → repeat, until a
  JUSTIFIED stop. The caller INJECTS `execute(lot)` (ODG performs the mission, returns a verdict);
  the loop never fabricates an effect. The register is the durable checkpoint ⇒ resume is idempotent
  (ACCEPTED lots are never re-run).
- `runtime/bin/odg-campaign-run.ts` — the real CLI wrapping the loop; `resolveExecutor` is fail-closed
  (`ODG_CAMPAIGN_EXECUTOR` unset ⇒ `NO_EXECUTOR_AUTHORIZED`; the only shipped executor, `verification`,
  runs a real subprocess and accepts only on the expected status).
- `scripts/odg-campaign-loop.ts` — a `while()` multi-mission driver that spawns the governed per-mission
  pipeline (`runtime/bin/odg-local-pipeline.sh`) with iteration + consecutive-failure caps + anti-reloop.
- `runtime/bin/odg-schedule-tick.ts` + `deploy/odg-mission-runner.{service,timer}` — a ONE-bounded-tick
  unattended entry invoked by a systemd timer every 15 min; today it runs an **IDLE** read-only canary
  (empty `ODG_CANARY_ALLOWLIST`).

## 2. Why the campaign returned to an interactive prompt — the honest root cause
Two facts, neither of which is a missing loop:
1. **No authorized executor for the OPEN lots.** The loop's `execute`/dispatch seam is deny-by-default.
   The only shipped executor handles `exec`-spec lots (there are none); the remaining open register items
   are **owner-gated external actions** (secrets, systemd, external accounts, product decisions) that no
   local executor can legitimately perform. So the loop correctly runs to a justified stop
   (`NO_EXECUTOR_AUTHORIZED` / `IDLE_BLOCKED` / all-remaining-BLOCKED) and exits.
2. **No in-repo mechanism re-invokes the Claude Code model turn after it stops, and nothing waits on CI.**
   The campaign has, in practice, been driven by the **interactive Claude Code agent turn**, which
   advances missions and then stops.

### Empirical observation (this is the key nuance)
Within a single Claude Code session the agent turn IS re-invoked **automatically by background-task
completion notifications** (a `run_in_background` watcher, a sub-agent, or a Monitor emitting an event).
This session advanced **many consecutive missions with the user issuing directives but NOT typing
"continue" between them** — P0C3 (absent-verify → read-only scope → closeout), CI-reliability, the
httpGetBounded/suite-watchdog/observability chain, and the entry-authorization decision — each landing
across background-notification-driven turns. So *intra-session* autonomy is REAL as long as a wake signal
(a pending background task) is always in flight. The campaign only truly stalls when all background work
drains AND the agent stops with nothing pending.

## 3. The precise provider limitation (NOT fabricated)
- **An ODG supervisor PROCESS driving `odg-run`/pipeline subprocesses unattended is feasible and built**
  (`scripts/odg-campaign-loop.ts`, `odg-campaign-run.ts`) — it runs for as long as its parent process
  lives, with no model call. Its reach is bounded by what a local executor may legitimately do.
- **Re-invoking the interactive Claude Code model turn after it stops requires an EXTERNAL wake.** Nothing
  in-repo can do this for itself, and none is fabricated here. The available real wakes are:
  - intra-session: keep a background task pending (notification re-invokes the turn) — in use;
  - cross-session/unattended: the PREPARED-but-owner-gated systemd `odg-campaign.timer`
    (`docs/odg/deploy/CAMPAIGN_RUNNER.md`), or populating `ODG_CANARY_ALLOWLIST` on the already-active
    `odg-mission-runner.timer` (a gated CTO security decision). **systemd/sudo = owner-gated; ODG cannot
    self-install it.**
- A **terminated** Claude Code session cannot resume itself. On restart, ODG recovers from the durable
  register checkpoint (`detectInterrupted` ⇒ SESSION_INTERRUPTED) and continues without duplicate
  execution. There is no undocumented provider API and none is assumed.

## 4. What this lot shipped (bounded, additive, reversible)
`runtime/core/campaign-loop.ts` now models the directive §5 lifecycle ADDITIVELY (no change to the
existing STOP reasons / the 13 prior assertions):
- Richer verdicts the executor MAY return — `WAITING_FOR_CI{ciRunId}`, `WAITING_FOR_PROVIDER`,
  `WAITING_FOR_DEPENDENCY`, `WAITING_FOR_EXTERNAL_AUTHORIZATION` — each parks the lot BLOCKED with a
  distinct `waitKind` (identical effect to the generic `WAITING_EXTERNAL`, distinct diagnosis), and a
  blocked lot never freezes independent work.
- `result.lifecycleState` — the §5 classification (COMPLETED / WAITING_FOR_CI / WAITING_FOR_PROVIDER /
  WAITING_FOR_DEPENDENCY / WAITING_FOR_EXTERNAL_AUTHORIZATION / RECOVERING / NO_SAFE_WORK_AVAILABLE /
  SESSION_INTERRUPTED / IN_PROGRESS).
- `resolveCiWaiters(register, ciStatus)` — the CI-completion→next-action mechanism (PURE + injected
  `ciStatus`): success ⇒ re-admit the lot (READY); failure ⇒ bounded RECOVERING (never auto-retried /
  auto-accepted); pending ⇒ unchanged.
- `detectInterrupted(register)` — SESSION_INTERRUPTED detection for idempotent restart.
- `reconSuggested` — a SIGNAL that the READY list is empty but the frontier may not be exhausted (ODG/the
  supervisor runs read-only reconnaissance; the loop never runs recon itself).
- Bugfix: `scripts/odg-campaign-loop.ts` recorded checkpoints via a non-existent `scripts/compass-update.js`;
  now runs the real `tsx scripts/compass-update.ts`.

All §7 autonomous-controller behaviors are proven in `campaign-loop.test.ts` (25 assertions): 3+
consecutive missions without manual continuation; CI-completion→next-action; failed-CI→bounded recovery;
crashed-child (executor throw)→FAILED not hung/accepted; provider-wait ≠ completed; restart resumes from
checkpoint; duplicate execution prevented; independent missions continue when one is blocked; no-READY ⇒
reconSuggested; external-authorization never advanced to ACCEPTED by the loop; completion never reported
while open/blocked work remains.

## 5. Exact owner action to enable fully-unattended cross-session operation
1. Install + enable the prepared `odg-campaign.service`/`.timer` (`docs/odg/deploy/CAMPAIGN_RUNNER.md`) so
   the loop is re-invoked on a timer (requires sudo/systemd — owner-gated).
2. Decide the executor/canary authorization for the classes of lot that may run unattended (a gated CTO
   security decision; the deny-by-default default stays until then).
Until (1)+(2), continuous operation within a live session is driven by keeping a wake signal in flight;
across sessions it requires the owner wake above. This is a provider/environment boundary, not a code gap.
