# V12.4 — V9 Closure: Campaign-Runner End-to-End PROVEN on main + Capability Ladder (2026-11-09)

## §4 — Campaign-runner: authorized mission EXECUTED + unauthorized REFUSED, proven on `main` (not just IDLE)

Ran the **real built artifact** `runtime/dist/bin/odg-schedule-tick.js` (the service's ExecStart target) end-to-end on a
**synced-main worktree** (branch=main · HEAD==origin/main · clean) — `runtime/__bench__/odg-schedule-tick.e2e.test.ts`,
**14/14 PASS**. This goes past the V8 IDLE test and proves the full §4 ladder:

| § demand | Scenario | Proof |
|---|---|---|
| authorized mission **executes** | **A** | allowlisted READ-ONLY mission → dispatched to the **real governed 13-stage pipeline** (`odg-run`) |
| **results** + **independent validation** | **A** | `mission-report.json` **status SUCCESS**, `validated===true` — the **Validation Engine verdict** (not the mission's self-report) |
| **canonical closure** | **A/F** | mission recorded proven in the ledger; exit 0 PASS |
| **no duplicates** | **F** | second tick on the now-proven mission ⇒ **IDLE, no re-dispatch** (dedup via the mission-ledger proven set) |
| **refuse unauthorized** | **E** | a non-allowlisted **mutating** mission present ⇒ **never dispatched** (deny-by-default) |
| **refuse non-conforming** | **B/G** | wrong-branch repo state ⇒ **STARTUP_REFUSED (exit 2) before any dispatch** (Truth-Lock default-on) |
| enforcement reaches the executor | **A** | child wrote `truth-lock.json enforce=true` — enforcement propagated to the odg-run child |
| zero consequential effect | A/B/E | git clean in every case; **no provider ever constructed** |

**Code-enforced read-only safety (not allowlist-trust):** `assessCanarySafety` runs `canary-decision-pack` over the
mission's **own** definition and admits only an explicit read-only mode (READ_ONLY/OBSERVATION/ANALYZE/AUDIT/DIAGNOSTIC/
HEALTH) with no engineering/authorized_paths/network/spend/destructive — the allowlist alone **cannot** promote the canary
into an engineering executor (default-DENY, fail-closed).

### Persistent private activation — examined (owner/operational)
Mechanism: a `systemd --user` timer (same class as the active `odg-radar-weekly.timer`) that `cd`s into a **persistent
synced-main checkout**, `git fetch` + forward-only fast-forwards `main`, and runs the tick with an **empty allowlist**
(IDLE-safe: nothing executes without an explicit read-only allowlist + Truth-Lock + canary-safety). **Not auto-enabled:**
(1) it requires a persistent synced-main checkout (the primary repo holds the dev branch + 6 preserved untracked items);
(2) §6 forbids invisible background agents — enabling an autonomous mission executor (even IDLE-default) is a different
risk class from the read-only radar and is an **owner/operational** go-live decision. The mechanism is proven and ready;
the enablement is reserved.

## §2/§3 — Capability ladder (REGISTERED→CONNECTED→CALLABLE→EXECUTED→VERIFIED), no parallel inventory

Per §1, this reuses the existing `SYSTEM_INTEGRATION_AUDIT` (352 capabilities, 0 cycles, components×métiers,
Claude-dependency map) + `capability-map` + the register — **no re-inventory**. The canonical ladder:
- **REGISTERED / CONNECTED:** 352 capabilities in the capability-map, 0 dependency cycles (SYSTEM_INTEGRATION_AUDIT).
- **CALLABLE / EXECUTED / VERIFIED:** the gate (400/400) + campaign-controller (36/36) exercise the library capabilities;
  the **runner** capability is now **VERIFIED** end-to-end on main (this doc, §4) — not merely registered.
- **Claude-dependency (§3):** ODG natively selects/plans/decomposes/authorizes/dispatches/validates/dedups/closes via the
  governed primitives (schedulerStep + odg-run + Validation Engine + mission-ledger + Truth-Lock), proven by the e2e run
  with **no provider constructed**. Claude Code remains a **replaceable provider** for the L1-L4 *authoring/repair* step
  (now routed to the local 3B/7B model under the independent test) — never the decider. The residual native-authoring gap
  is covered by the Local Intelligence Engine (L0-L4 proven); its quality is gated by the independent test, not the model.

## §5 — Ports (re-inventory): unchanged, no public port is auto-trusted
Public binds: **only SSH:22** (key-only auth, hardening extras sudo-gated — V8 §1). edg-core `127.0.0.1:8080` (private),
ollama/dashboard loopback. SSH:22 is evaluated as a **genuine admin necessity** (the sole remote-access path on a
no-console VPS), not auto-accepted as "standard"; closing/restricting it without a verified second access path would risk
lockout and is owner-reserved. No public port added.

## §7/§8 — Closure + decision rule
Gate 400/400; campaign-controller 36/36; the runner e2e 14/14 on main. The §8 rule (don't conclude exhausted until
orchestration/autonomous-use gaps are examined) is honored: the runner's autonomous use is now **VERIFIED** (executes an
authorized mission + refuses unauthorized, on main). Remaining genuine work is **owner/operational** (persistent runner
go-live; deploy-from-main; SSH extras) or **owner-decision** (the 13 dossier items) — examined, not assumed.
