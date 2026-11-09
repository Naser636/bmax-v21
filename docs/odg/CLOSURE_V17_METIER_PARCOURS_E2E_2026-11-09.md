# V12.4 — V17: Fifteen Trades — first end-to-end operational parcours (P3) 2026-11-09

Records V16. Parity 15/15 is **not** an E2E qualification (CTO criterion). ODG built the missing parcours orchestrator
and demonstrated the FIRST métier end-to-end; the other 14 parcours are honestly marked not-yet-E2E.

## §2 — Operational ladder audit (REGISTERED/CONNECTED/CALLABLE/EXECUTED/VERIFIED), per métier
All 15 métiers are REGISTERED + CONNECTED + CALLABLE and VERIFIED **as guards** (DETECTION/SPECIFICITY/ROBUSTNESS via
metier-benchmark-multidim → parity 15/15). The **full operational parcours** (réception → identification → résolution de
capacité → permission → exécution → résultat → assurance indépendante → décision/clôture → traçabilité → récupération) was
**not** demonstrated E2E for any métier until now.

| Métier | guard(s) | guard-level | full parcours E2E |
|---|---|---|---|
| **P3** (supply-chain) | p3-dependency-trust-gate (+p3-* ) | VERIFIED | **EXECUTED + VERIFIED (this directive)** |
| P1,P2,P4,P6–P15 | 1–6 guards each | VERIFIED-as-guard | **NOT yet E2E** (honest gap — candidates for the next cycles) |
| P5 (decision-rules) | benchmark-covered | VERIFIED-as-guard (via benchmark) | NOT yet E2E |

## §3/§4 — First métier E2E: P3, via the new parcours orchestrator (composes, no parallel architecture)
`runtime/core/metier-parcours.ts` (PURE, gate-tested) composes the EXISTING métier guards behind ONE governed parcours —
it adds **no business logic** and mutates **no canonical register**. Steps, each a fail-closed terminal stage:
réception → identification (métier→guard registry) → permission (**deny-by-default**) → résolution de capacité (lazy
require of the REAL guard) → déduplication → exécution (the REAL guard) → résultat (ADMIT/REJECT) → **assurance
indépendante** (default: the decision must reproduce) → décision/clôture (+ audit) → traçabilité.

**Demonstrated live on P3 with the REAL `p3-dependency-trust-gate.vetDependency`** (synthetic fixtures, clearly flagged,
unblock nothing canonical, no commercial activity):
- a fully-specified clean dependency `{left-pad, 1.3.0, MIT, sha512-…}` ⇒ **CLOSED / ADMIT**, assurance reproduced, traceable;
- a typosquat/unpinned `{reakt, ^1.0.0}` ⇒ **CLOSED / REJECT** (governed closure surfacing the guard's reject).

## §5 — Résilience (only real mechanisms/risks; no artificial tests)
Proven terminal stages: PERMISSION_REFUSED (deny-by-default, guard never runs) · CAPABILITY_UNAVAILABLE (guard resolve
throws) · UNKNOWN_METIER · EXECUTION_FAILED (guard throws) · INVALID_RESULT (no ADMIT/REJECT) · ASSURANCE_FAILED
(decision does not reproduce / independent check disagrees — never CLOSED) · DUPLICATE (idempotent re-request) ·
CLOSURE_FAILED (audit persist fails ⇒ not a silent close). The parcours is read-only (runs a guard), so there is no state
to roll back; a non-persistable closure is fail-closed, not silently accepted.

## §6 — Environment
The npm auto-update notice is a Claude Code CLI **cosmetic** stderr line — unrelated to ODG; **no global permission
change, no sudo, no interruption of operations, no VPS/network change**. All security/preservation restrictions intact.

## §7 — Closure
Gate 403→404/404 (new métier-parcours suite); tsc clean; CI green on merge. Register reconciled. Preservation / SSH /
ports / edg-core / Truth Lock / 9 primitives / permissions unchanged; no net, no spend, no secret, no deletion, no false
real proof.

- **Mission (ODG-selected):** demonstrate the first métier parcours E2E (real gap: parity ≠ E2E).
- **Executed:** P3 full parcours via the real guard, independently assured, traceable, fail-closed resilience.
- **Owner blockers:** unchanged (3 input voies + 13 decisions).
- **Next native missions:** extend the parcours to P1/P2/… per the observed gap (each reuses its existing guard, same
  orchestrator) — one métier per cycle, no fabrication.
