# Provider Isolation — `odg delegate` (PROVIDER_ISOLATION_E1_E5)

Status: **EXPERIMENTAL, OPT-IN, OFF BY DEFAULT.** Not committed; not enabled in any default path.

`odg delegate` chooses exactly ONE delegation mode per run, decided by
`delegate-isolation.selectDelegateMode(...)` and printed as `Delegation mode:` before any provider runs.
There is **no silent fallback**: if isolation is requested but cannot be guaranteed, the run REFUSES.

## The two modes — and what "isolated" does and does NOT mean

| | HISTORICAL (default) | ISOLATED (experimental) |
|---|---|---|
| Trigger | `ODG_DELEGATE_ISOLATION` unset / ≠ `1` | `ODG_DELEGATE_ISOLATION=1` **and** a guaranteeable config |
| Provider | network provider (e.g. Claude Code) run by the operator | a **local, OFFLINE** provider run by ODG inside bubblewrap |
| Repo access | **full working tree** (provider writes directly) | a working **COPY of only the authorized files** |
| `.git` / Docker socket / host secrets | reachable (normal host context) | **absent** (never bound into the sandbox) |
| Outbound network | available (needed for the API) | **blocked** (`--unshare-all`) |
| Scope enforcement | after-the-fact CM-1 `scopeClean` on the working tree | pre-apply diff validated vs the **exact** write-set; out-of-scope ⇒ whole proposal refused |
| Labelled as isolated? | **NO** — explicitly "NOT isolated" | YES, within the proven boundary below |

### Why Claude Code (and any network provider) CANNOT be isolated here
The sandbox is `--unshare-all` (no network) and `--clearenv` (no secrets). Claude Code requires the
Anthropic API (network) and credentials — it therefore **cannot run inside this sandbox**. The isolated
mode is for a **local/offline** provider only; the operator must assert this with
`ODG_ISOLATED_PROVIDER_OFFLINE=1`. Without that assertion the provider is treated as incompatible and the
run is **refused** — the historical (non-isolated) network path is never silently presented as isolated.

## Configuration (all unset by default)
- `ODG_DELEGATE_ISOLATION=1` — request the isolated path.
- `ODG_ISOLATED_PROVIDER_CMD="<binary> <args>"` — the OFFLINE provider (plain argv; no shell metachars).
- `ODG_ISOLATED_PROVIDER_OFFLINE=1` — operator assertion that the provider needs no network/secrets.
- Contract `authorized_paths` must be **concrete files** (a glob such as `runtime/**` is refused).

## Refusal matrix (explicit STOP, never a downgrade)
| Condition | Enforced by | Result |
|---|---|---|
| isolation requested, no provider command | `selectDelegateMode` | REFUSED |
| provider not declared offline (incompatible/network) | `selectDelegateMode` | REFUSED |
| empty or glob/boundary write-set | `selectDelegateMode` / `resolveWriteSet` | REFUSED |
| bubblewrap unavailable | `runIsolated` (`detectSandbox`) | REFUSED |
| no `--info-fd` launch handshake observed | `runIsolated` | REFUSED |
| any change outside the exact write-set (incl. mixed patch) | `validateScope` / `applyProposal` | REFUSED (atomic; nothing applied) |

## Human acceptance gate (resolves apply↔verify↔converge — no bypass of `verify.gitClean`)
`verify.gitClean` requires a clean tree; the isolated apply is uncommitted, and **ODG never auto-commits**
(mission-lifecycle S4 / D1). The deadlock is resolved by ORDERING, not by weakening the gate:
`delegate-isolation.acceptanceGate({root, writeSet, baselineRef})` (pure, reuses `scope-observer.scopeClean`,
performs ZERO git mutation) classifies the disposable repo after apply:

| State | Condition | Pipeline |
|---|---|---|
| `BLOCKED` | a working **or committed** change lies outside the write-set (incl. **unauthorized commit**) | STOP (always) |
| `PROPOSED_AWAITING_ACCEPTANCE` | in-scope deliverable applied but **not committed** | STOP before verify; await human commit; **no commit performed** |
| `NO_PROPOSAL` | clean tree, nothing committed since baseline | STOP (nothing to accept) |
| `ACCEPTED` | clean tree **and** the committed diff `baseline..HEAD` is wholly in-scope | verify + converge proceed on a clean tree (`gitClean` honestly true) |

Flow (pilot, disposable repo only): `odg delegate <M>` (isolated) → apply → **PROPOSED STOP**. Human reviews
and **commits** (the acceptance; commit is impossible before this — ODG never commits). Re-run → **ACCEPTED**
→ CM-1 → verify (`gitClean=true`) → converge. An out-of-scope or unauthorized-committed change BLOCKS; a
red build/tsc still blocks (verify-failure always blocks). The historical path remains `NOT isolated`.

## Proven boundary (do not over-claim)
Isolation is proven ONLY for: a **local offline provider**, a **concrete write-set**, with unprivileged
user-namespaces + bubblewrap available. Evidence: `runtime/core/delegate-isolation.test.ts` (real bwrap,
disposable repo: real `.git`/Docker/secrets/network all denied; out-of-scope & mixed patches refused) and
`runtime/__bench__/delegate-isolation-equivalence.e2e.test.ts` (JS↔compiled-TS parity). Nothing here
claims isolation for the historical network path.
