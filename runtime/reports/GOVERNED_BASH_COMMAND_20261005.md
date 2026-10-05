# Governed Bash/Linux Command — Mission Report (2026-10-05, ODG V6)

Checkpoint-first. Truth Lock: HEAD 52e65c6 on `main`; working tree carried the V5 Git write-set
(uncommitted, VERIFIED-not-ACCEPTED per GOVERNED_GIT_BRANCH_INTEGRATION_20261005.md). V5 taken as
established truth; not rebuilt (its test is in the 57/57 regression below). One mission, reuse-first,
additive. No commit/push.

## OBJECTIVE
Close the seam NL→INTENT→OBJECTIVE→CAPABILITY→BASH/LINUX ANALYSIS→AUTHORITY/POLICY/RISK→SANDBOX OR
GOVERNED ACTION→OBSERVED EFFECT→VERIFICATION→EVIDENCE so ODG can meet an (un)familiar shell command
WITHOUT becoming unrestricted shell execution.

## FOUND (the real seam — reused, not duplicated)
- authority/policy/risk: EXISTING `action-gate.js` `evaluateAction` (ALLOW/DENY/ESCALATE, deny-by-
  default, action classes, reversibility R0–R4, HIGH/CRITICAL→ESCALATE). REUSED verbatim.
- C03 transition contract: EXISTING `state-transition.js`. REUSED to build+validate the evidence record.
- capability dispatch: EXISTING `capability-executors.js` registry → real `patch-executor.js` default
  case → EXECUTED+evidence; proofs via `capability-probes.js`; intent→proof via `mission-contract-
  factory.js resolveVerifyProbes`. All REUSED (new entries only).
- genuine isolation: `bubblewrap` (bwrap) present AND verified working here (unprivileged user+net+pid
  ns, cleared env, tmpfs). REUSED as the sandbox backend. No second command/policy/sandbox system built.

## FIXED (additive, in write-set)
- NEW `runtime/core/bash-command-governor.js` — RAW→PARSED→ACTION→CAPABILITY→EFFECT/RISK→AUTHORITY/
  POLICY→SANDBOX/GOVERNED→OBSERVED→VERIFY→EVIDENCE. Distinct representations. Bounded parser: dynamic/
  unbounded constructs (pipe, redirect, cmd/`backtick`/var-substitution, control-ops, subshell, heredoc,
  glob, tilde) → UNKNOWN_EFFECT, never a runnable argv. Curated SAFE_READONLY (executable) vs DANGEROUS
  (classed WRITE/DELETE/COMMUNICATE/IRREVERSIBLE) vs SHELL_ESCALATOR vs UNKNOWN (identity resolved:
  path/realpath/sha256/shebang — identity, never trust). Routes authority/policy/risk through the reused
  action-gate. Executes ONLY a known-safe read-only command, ONLY in bwrap (clearenv + explicit env
  allowlist, `--unshare-all` net off, tmpfs writable work dir, non-priv, timeout, argv exec NO shell),
  observes the real effect set, compares PREDICTED vs OBSERVED (divergence→REJECTED). Secret-store access
  → SECRET_BOUNDARY→human. Sandbox absent → SANDBOX_UNAVAILABLE→human. Timeout→resource-boundary BLOCKED.
  Dry-run hard default. Secret VALUES redacted from evidence. Outcomes: EXECUTED/SANDBOX_OBSERVED/
  ANALYZED/BLOCKED/HUMAN_APPROVAL_REQUIRED/EFFECT_DIVERGENCE.
- EDIT `capability-executors.js` — executor (objectiveId prefix `BASH_COMMAND`, disjoint), delegating to
  the governor; live BLOCKED/HUMAN_APPROVAL/EFFECT_DIVERGENCE writes honest evidence then throws (FAILED).
- EDIT `capability-probes.js` — probe `bash-command-governed` (shellExecution=false always; EXECUTED⇒
  VERIFIED C03 + net off + env cleared; SANDBOX_OBSERVED⇒net off + trust withheld; dry-run/refusal FAIL).
- EDIT `mission-contract-factory.js` — intent rule (bash/shell/linux command → the proof).
- NEW `runtime/core/bash-command-governor.test.js` — 44 assertions.

## VERIFIED (actual evidence)
- New test 44/44 — parse constructs, identity resolution, gate DENY/ESCALATE/ALLOW, secret boundary,
  dry-run, non-idempotent zero-execution no-retry, SANDBOX_UNAVAILABLE→human, EFFECT_DIVERGENCE→REJECTED,
  REAL bwrap: env cleared + allowlist-only + secrets denied + network genuinely off, EXECUTED+VERIFIED
  C03, timeout→BLOCKED, UNKNOWN→SANDBOX_OBSERVED (trust withheld), registry+probe path.
- REAL ODG PIPELINE E2E (isolated cwd): NL intent → `resolveVerifyProbes` → `bash-command-governed`;
  real `patch-plan.json` through the REAL `patch-executor.js` → EXECUTED+evidence; probe PASS; evidence
  shellExecution=false, C03 VERIFIED, isolation.network=false, envCleared=true, exit 0.
- Regression: full `runtime/core/*.test.js` 57/57 GREEN (incl. the V5 git-branch suite). Affected TS
  suites (phase0-c04-proof-binding, objective-proof-gate) GREEN. `tsc --noEmit` exit 0. `node --check` ok.
  `git diff --check` clean. `./runtime/bin/odg diagnose` → NO_DIVERGENCE, exit 0.
- Real repo HEAD unchanged; no real host/filesystem/process/network state mutated (all execution ran
  inside the ephemeral bwrap sandbox; work dir removed after each run).

## UNKNOWN-CAPABILITY / UNKNOWN-COMMAND HANDLING
Unknown executable → identity resolved (path/sha256/shebang) but NEVER auto-trusted; at most sandbox-
OBSERVED (EFFECT_PROFILED) with network off and trust withheld → HUMAN_APPROVAL_REQUIRED. Foreign
objectiveId → resolve()=null (no hijack). No LLM/name/PATH-based trust; no raw LLM shell execution.

## REPAIR / ROLLBACK
No real repo defect. Two self-inflicted test-expectation defects fixed during verification: (a) `eval`
without authority is DENY not ESCALATE (deny-by-default; ESCALATE proven directly against the gate);
(b) bwrap writable work dir must mount under the tmpfs `/tmp` (parent writable) — fixed the invocation.
Rollback: sandbox work dir is ephemeral (nothing to roll back); file-level rollback remains the existing
build-recovery engine (unchanged).

## GOVERNANCE / SECRETS / NETWORK
No Master/Constitution/CTO/ROADMAP/policy/authority/security file touched. Capability GRANTS no authority
(action-gate decides; consequential commands are deny-by-default). Secrets denied by construction (env
cleared in sandbox; secret-store args rejected; secret values redacted from evidence). Zero network (bwrap
`--unshare-all`; the capability itself contacts no remote). NOT COMMITTED, NOT PUSHED.

## STATE / NEXT
State = VERIFIED (not ACCEPTED). Write-set this mission: `bash-command-governor.js`, `…test.js`, and the
additive entries in `capability-executors.js` / `capability-probes.js` / `mission-contract-factory.js`
(the V5 Git write-set remains alongside, also VERIFIED-not-ACCEPTED). ONE next authorized action:
human ACCEPT → commit (V5 + V6 together, or V6 alone); push remains a separate human gate.
