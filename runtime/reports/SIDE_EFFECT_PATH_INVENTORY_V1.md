# Side-Effect Path Inventory V1 — executors & execution paths

Scope: every effect-capable call site (`_seams.spawn`, `_seams.httpRequest`, filesystem writes)
reachable through mission dispatch (`capability-executors.resolve(patch).run()`). Companion to
`ROADMAP_TRUST_AND_SLO_GOVERNANCE_V1.md`. HEAD at authorship: `2cda788` (+ this lot).

## Dispatch chokepoint (TRUST-GAP-3 a+b, CLOSED)
`resolve(patch)` consults the PRODUCTION effect registry `CAPABILITY_EFFECT` (SOT): an
UNREGISTERED or ungoverned-consequential capability is DENIED before any effect (deny-by-default).
Registered executors resolve normally (no double-gating). Proven: a dummy ungoverned executor →
`resolve().run()` REFUSES + no side-effect file written.

## Per-path table
| Capability | Effect | Site(s) | Authority / control AT EXECUTION | Absent/invalid/expired/cross-mission ctx | Refusal-before-effect proof |
|---|---|---|---|---|---|
| Connectivity Audit | observational | `_seams.httpRequest` HEAD; `writeEvidence` | read-only reachability probe; no mutation/egress | n/a (no mutation) | report write is observational |
| Clean Workspace | observational | `writeEvidence` scan report | scan-only; deletes nothing | n/a | `deleted:0` invariant |
| Governed Observability Verification | observational | `writeEvidence` | re-derives+verifies autonomy signal (read-only) | n/a | read-only |
| ODG Synthetic Deliverable | consequential | `fs.writeFileSync` (confined) | `confineSyntheticTarget(authorizedPaths)` — write confined to authorized_paths; protected-governance refused | empty/absent authorizedPaths ⇒ **REFUSE before write**; protected target ⇒ refuse | PROBED 2026-10-19: empty plan ⇒ `refused — no valid authorized path`, no file |
| ODG Spec Author | consequential | `fs.writeFileSync` (confined) | same `confineSyntheticTarget` | same | same mechanism |
| Governed Git Branch Integration | consequential | `gitBranchIntegration.run` → `_seams.spawn git` | ff-only; `execute===true` else dry-run; `authorization`+`protectedBranches`; C03-recorded | no execute flag ⇒ dry-run; protected branch ⇒ refuse | gate inside gitBranchIntegration; evidence written after |
| Governed Bash/Linux Command | consequential | `bashGovernor.govern` → sandboxed `_seams.spawn` | action-gate deny-by-default; dry-run hard default; fail-closed STOP (BLOCKED/HUMAN/EFFECT_DIVERGENCE throw); `now`+`missionId` threaded (GAP-3b) | expired ⇒ DENY/expired; cross-mission ⇒ DENY/cross-mission; absent ⇒ deny | bash-governor 58 assertions |
| External Research Acquisition | consequential | `_seams.spawn` self `--http-get` (egress) | dry-run default; LIVE egress requires an **injected** fetch (`ra.fetch`/`patch.__fetch`); JSON-nameable client removed (GAP-1) | no injected fetch ⇒ no egress ("no fetcher injected") | external-research-live.test (secure assertion) |
| Provider Activation | consequential | `_seams.spawn` tsx entry (local) | local subprocess; the billed EXTERNAL call is gated downstream by provider-live-call-gate (`ODG_PROVIDER_LIVE`); dry-run default | live flag unset ⇒ dry-run (no billed call) | spawn is local; billed call = GAP-2 (reserved D-external-provider) |
| Implement Via Local Provider | consequential | `_seams.spawn` ollama/curl **loopback**; `fs.writeFileSync` workDir | delegate-isolation `validateScope` (fail-closed/atomic) + independent verify; **never commits**; non-loopback host refused | out-of-scope change ⇒ reject; non-loopback ⇒ refuse | implement-via-local-provider tests; delegate-isolation |

## Directly-exported effect functions (bypass resolve)
`governedHttpGet` (self-spawn egress), `implementViaLocalProvider(Escalating)`, `localProviderActivation`,
`writeEvidence`, `runAudit`. These are the implementation primitives; **production mission dispatch goes
through `resolve()`**. `governedHttpGet` has NO production caller — it is an injection-only seam (GAP-1
removed name-selection). A trusted in-process caller invoking them directly is by-design, not a mission path.

## Conclusion
No ungoverned consequential path reachable via mission dispatch. All 6 consequential capabilities apply an
execution-time control and refuse-before-effect under absent/empty/invalid authorization (probed). Observational
paths mutate nothing. Residual, reserved: GAP-2 billed-provider global flag → per-mission/budget (awaits
D-external-provider). No fix required this lot beyond the already-committed chokepoint.
