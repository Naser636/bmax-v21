# ODG V7 — Local Capability-Resolution Seam (NL → correct LOCAL capability, no external-ai substitution)

**Status:** GREEN (dry-run routing + real governed execution both VERIFIED; NO COMMIT / NO PUSH)
**Date:** 2026-10-05
**Checkpoint start:** HEAD `52e65c6` (`feat(odg): add governed autonomy and self-diagnostic cycle`), branch `main`,
V5 (Governed Git Branch Integration) + V6 (Governed Bash/Linux Command) uncommitted on the tree.

## Observed V7 gap (reproduced before change)
`./runtime/bin/odg objective "<legit local request>"` → `resolvedCapability=null`,
`missingLocalCapability=true`, `chosen.source=EXTERNAL`, `MISSING_CAPABILITY`, `status=BLOCKED`,
`providerCalls=0 externalCalls=0 externalWrites=0`.

## Root cause
The shared resolver — `runtime/core/decision-rules.js` (the P4 "Rules" tier consumed by
`capability-router.route()` and by `mission-synthesizer.fromRequest()`) — had **no rule** for the local
system capabilities that already exist. So a legitimate request (diagnose / inspect repository state /
a known Git action / a known Bash command) matched no rule → the Capability Router found **no LOCAL
tier** → it fell through to the always-present `EXTERNAL_AI` last resort. ODG was routing a local
system request to external AI purely because the resolver was blind to local capabilities. This is a
**recognition** gap, not an authority gap.

## Fix (minimum sufficient change — ONE file)
`runtime/core/decision-rules.js`: added a leading block of `RULES` (first-match-wins) mapping local
system intents to **EXISTING** capabilities — introduces no new executor, registry, resolver or primitive:
- `diagnos*` → `self-diagnostic` (self-diagnostic.js)
- `integrate/merge branch`, `branch into`, `git` → `Governed Git Branch Integration` (V5)
- `bash` / `shell` / `command` → `Governed Bash/Linux Command` (V6)
- `connectivity` → `Connectivity Audit`
- `repository` / `repo state` / `workspace state` / `system state` → `runtime-context-loader`

Recognition ≠ authorization: every resolved action still passes the existing action-gate / authority
(governance-kernel) / risk / external-effect stages unchanged.

## Direct ODG tests (`./runtime/bin/odg objective …`, all providerCalls/externalCalls/externalWrites = 0)
| # | request | resolved capability | source | status |
|---|---|---|---|---|
| 1 | run a governed diagnostic on the runtime | self-diagnostic | LOCAL | READY_DRY_RUN |
| 2 | inspect the repository state | runtime-context-loader | LOCAL | READY_DRY_RUN |
| 3 | integrate the feature branch into main | Governed Git Branch Integration | LOCAL | READY_DRY_RUN |
| 4 | run the ls command in the workspace | Governed Bash/Linux Command | LOCAL | READY_DRY_RUN |
| 5 | remove the unused import and run the ls command | local-fixers + Governed Bash/Linux Command (2 objectives) | LOCAL | READY_DRY_RUN |
| 6 | compose a haiku about mountains (unknown) | external-ai | EXTERNAL | BLOCKED (MISSING_CAPABILITY) — abstains |
| 7 | delete the production database (unsafe) | — | — | DENIED (ADMISSION_DENIED, requiresHuman) |
| 8 | find commercial opportunities online (ext disabled) | — | — | BLOCKED (EXTERNAL_EFFECT_NOT_RUN) |

Invariant proven: external-ai is **never** an execution substitute — counters stay 0 in every case,
including the ones that still route to the EXTERNAL tier (it is a routing label the dry-run never calls).

## Real governed execution (isolated fixture, reuses V6 — not rebuilt)
`capability-executors.resolve({objectiveId:"BASH_COMMAND_…", bash_command:{command:"echo …", execute:true, authorization:…}})`
run from a scratch fixture cwd:
- resolved executor = **Governed Bash/Linux Command**; outcome **EXECUTED**, decision **ALLOW**, exitCode 0
- STATE_BEFORE `{executed:false}` → OBSERVED_EFFECT stdout `odg-v7-observed-effect\n` → STATE_AFTER `{executed:true,exitCode:0}`
- **VERIFICATION_STATUS: VERIFIED** (C03), real bubblewrap isolation (bwrap 0.11.1)
- evidence written **under the fixture**, 0 generated artifacts in the repo tree

## Verification / gates
- targeted: decision-rules (7/7), capability-router (10/10), nl-objective-gateway (79/79)
- core regression: **57/57** `runtime/core/*.test.js` pass, 0 fail (V6 baseline preserved)
- `odg diagnose` → **NO_DIVERGENCE**; `git diff --check` clean; `node --check` OK
- write-set = **1 file** (`runtime/core/decision-rules.js`); Master/Constitution/governance/authority/
  action-gate/kernel/V5/V6 **unchanged**; NO COMMIT, NO PUSH, NO NETWORK, NO SPEND

## Limitations / not verified
- The NL gateway stays **dry-run**; live execution of a resolved objective still goes through the
  governed executor path (proven above for Bash) with human authorization — unchanged by design.
- Pre-existing classifier keyword `"current "` maps NETWORK (load-bearing for gateway test 12); a local
  phrase containing "current" (e.g. "current repository state") still classifies as an external effect.
  Out of this resolution-gap's scope; documented, not changed.

## Next authorized action
Extend `nl-objective-gateway.classifyObjective` so a local read phrased with "current" is not
misclassified as an external NETWORK effect — only after explicit authorization, since it edits the
one governance-classification stage.
