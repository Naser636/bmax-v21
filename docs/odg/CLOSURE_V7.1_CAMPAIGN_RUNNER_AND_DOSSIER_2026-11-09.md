# V12.4 — V7.1 Closure: Campaign-Runner (§3) + Owner-Dossier Classification (§4), 2026-11-09

## §3 — `campaign-runner-systemd`: the Truth-Lock refusal is CORRECT, not a defect

**Audit:** `odg-schedule-tick` calls `truth-lock-gate.truthLockGate({mutating:true, enforce:true})`, which reuses the
canonical `evaluateTruthLock` (no second control) and checks: **repo present + expected branch (`main`) + HEAD ==
origin/main + clean worktree**. On a non-main / unsynced / dirty repo it returns `STARTUP_REFUSED` — a **fail-closed
safety invariant** so the governed mission runner never auto-executes against unreviewed working-branch code.

**Resolution (honest, no bypass):** this refusal is **working as designed** — it is **not** a code blocker to "fix". It
is resolved **operationally**: the runner activates only when the repo is in the canonical safe state (checked out on
`main`, synced to `origin/main`, clean tree). On this working branch (`excellence/…`) it correctly refuses; a private
timer here would merely log `STARTUP_REFUSED` weekly ⇒ **no benefit ⇒ not activated** (§3: never turn a security refusal
into an artificial success; never bypass Truth Lock).

**Classification:** **DÉJÀ SATISFAIT** (the safety control works correctly) **+ DÉCISION PROPRIÉTAIRE** (the system-level
timer go-live + ensuring the VPS release tracks `main` are owner/operational decisions). No code change made (removing
the branch check would be bypassing a security control — refused).

## §4 — Owner-dossier (15 items) — precise classification

Taxonomy: **RÉSOLU** · **DÉJÀ SATISFAIT** (correct as-is) · **ACTION TECHNIQUE EFFECTUÉE** · **DÉCISION PROPRIÉTAIRE RÉELLE**.

| Item | Classification | Note |
|---|---|---|
| `dashboard-tls-exposure` | DÉCISION PROPRIÉTAIRE RÉELLE | public exposure + hostname/cert (owner); readiness prepared |
| `structured-roadmap-deps` | DÉJÀ SATISFAIT | no honest edge to add; the one real edge exists — nothing to apply |
| `campaign-runner-systemd-activation` | DÉJÀ SATISFAIT + DÉCISION PROPRIÉTAIRE | refusal correct; go-live on main = owner/operational |
| `broad-it-independent-eval-set` | DÉCISION PROPRIÉTAIRE RÉELLE | label independence from evaluee (external data) — not internally satisfiable |
| `broad-it-corpus-grow` | DÉCISION PROPRIÉTAIRE RÉELLE | same (independent labels) |
| `p01-demand-validation` | DÉCISION PROPRIÉTAIRE RÉELLE | real willingness-to-pay signals (lawful experiment) |
| `p01-billing-sandbox` | DÉCISION PROPRIÉTAIRE RÉELLE | real provider credentials + go-live |
| `p0e-audit-log-keyed-integrity` | DÉCISION PROPRIÉTAIRE RÉELLE | key custody; mechanism already proven (options prepared) |
| `adr-166-capabilities-reconciliation` | DÉCISION PROPRIÉTAIRE RÉELLE | CTO ratification; proposal prepared (preserves frozen decision) |
| `historical-roadmap-excellence-28jul-recover` | DÉCISION PROPRIÉTAIRE RÉELLE | external source; verbatim NOT_RECOVERABLE |
| `eleven-profession-program-definition` | DÉCISION PROPRIÉTAIRE RÉELLE | CTO canonical source (forbidden to assume D-map equivalence) |
| `master-unified-campaign` | DÉCISION PROPRIÉTAIRE RÉELLE | CTO scope confirmation |
| `golden-path-scaffolder-poc` | DÉCISION PROPRIÉTAIRE RÉELLE | productization decision (prototype preserved) |
| `commercial-ops-substrate-h3` | DÉCISION PROPRIÉTAIRE RÉELLE | scope decision |
| `p0-autonomy-measure-slice3-delegate-provenance` | DÉCISION PROPRIÉTAIRE RÉELLE | risky deep delegate-path work (forensic deferred) |

Plus a bonus **ACTION TECHNIQUE EFFECTUÉE this session** (not a dossier item, but a real security gap closed):
**edg-core:8080 public internet exposure CLOSED** to loopback-only (see `VPS_SECURITY_CLOSURE_2026-11-09.md`).

## Honest result

**2 items are DÉJÀ SATISFAIT** (structured-roadmap-deps = nothing honest to add; campaign-runner refusal = correct
safety). **13 are DÉCISION PROPRIÉTAIRE RÉELLE** — each fully prepared (proposals/options/mechanisms), each needing a
genuine human/external decision, none internally self-clearable without fabricating data or bypassing a control. No code
change was made to force any of them. The one genuinely-fixable gap this session (edg-core exposure) was fixed + proven.
