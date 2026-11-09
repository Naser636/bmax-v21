# V12.4 — V18: Second métier E2E (P8) + assurance correction + generalization (2026-11-09)

Records V17. Extends — does not rebuild — V17's orchestrator to a SECOND distinct métier with its true guard, and
corrects an over-stated assurance level found by audit. Two parcours do NOT declare fifteen métiers operational.

## §2 — Audit of the P3 parcours (really-executed vs represented) + a correction
Each P3 step is REALLY executed by the orchestrator (réception / identification via the registry / permission
deny-by-default / capability resolution via lazy require of the REAL guard / dedup / execution of the REAL
`vetDependency` / result / assurance / closure+audit / fail-closed error handling). What was **only represented**: the
V17 "allocation des ressources" step is a local no-op (no resource contention) — not a real mechanism; not claimed as one.
- **CORRECTION (not masked):** V17's default assurance **re-ran the same guard and compared the decision** — that proves
  *reproducibility/determinism*, NOT independence. V18 corrects the level: each métier now declares a **genuinely
  INDEPENDENT** assurer (a necessary-condition cross-check via a DIFFERENT code path than the guard's own verdict). The
  `assurance` field now reports the real level: `independent` | `injected` | `reproducibility` (fallback, honestly weaker).
- No hidden P3 dependency; input/output contracts explicit; every step emits an audit record; métiers are isolated
  (registry entries are independent); fail-closed throughout; synthetic fixtures mutate no canonical register (verified).

## §3/§4 — Second métier: P8 (release / SemVer governance), selected for a real E2E gap + a DISTINCT verdict shape
Reuses the REAL guard `p8-semver-enforcement.enforce` (no business logic duplicated, no new service). Connected to
`metier-parcours.ts` via a registry entry that declares the **legitimate per-métier variations**: the input shape
(`{oldContract,newContract}`) and `decisionOf` (P8's native `{ok,verdict}` → ADMIT/REJECT; vs P3's `{decision}`).
Demonstrated live (synthetic fixtures, clearly flagged, unblock nothing canonical):
- compliant major bump for a breaking change ⇒ **CLOSED / ADMIT**;
- a patch bump for the same breaking change ⇒ **CLOSED / REJECT** (SEMVER_VIOLATION).
P8's **independent assurer** recomputes `rank(actualBump) ≥ rank(requiredBump)` via the module's `requiredBump`/
`actualBump` exports — a different path than `enforce`'s verdict branch.

## §5 — Résilience + regression (real risks only; V17 guarantees preserved)
All V17 terminal stages still proven (PERMISSION_REFUSED / CAPABILITY_UNAVAILABLE / UNKNOWN_METIER / EXECUTION_FAILED /
INVALID_RESULT / ASSURANCE_FAILED / DUPLICATE / CLOSURE_FAILED). **New regression test (A3):** a synthetic guard that
WRONGLY ADMITs an unpinned typosquat is **caught by P3's independent assurer ⇒ ASSURANCE_FAILED** (proves assurance ≠
reproducibility — no positive decision without genuine assurance). Guarantees intact: no silent closure, no execution
without permission, no positive decision without assurance, no unsignalled evidence loss.

## §6 — Generalization to the fifteen (from two real parcours)
- **Common (the orchestrator, generic):** the governed parcours réception→identification→permission→capacité→dedup→
  exécution→résultat→assurance→clôture→traçabilité, with fail-closed stages + audit.
- **Legitimate per-métier variation (in the registry, NOT erased):** the resolved guard, the payload shape, `decisionOf`
  (native verdict → ADMIT/REJECT), and the independent `assure`. The orchestrator is generic **without** flattening each
  métier's own requirements.
- **Next technically-executable métiers:** any whose guard is a deterministic verdict function (P1 semantic-regression,
  P9 unit-economics, P12 circuit-breaker/idempotency, …) — each plugs in as a registry entry, one per cycle. ODG selects
  next per the real gap. **Two parcours (P3, P8) do NOT make fifteen métiers operational** — the other 13 remain
  parcours-not-yet-E2E.

## §8 — Fifteen métier states
| | guard-level | full parcours E2E |
|---|---|---|
| **P3, P8** | VERIFIED | **EXECUTED + VERIFIED** |
| P1,P2,P4,P5,P6,P7,P9,P10,P11,P12,P13,P14,P15 | VERIFIED-as-guard (parity 15/15) | NOT yet E2E (honest) |

## Closure
Gate 404/404 (expanded metier-parcours suite, already in the gate); tsc clean; CI green on merge. §7 restrictions intact
(Truth Lock, 9 primitives, permissions, private VPS, no new public port, no net, no spend, no secret, no deletion); npm
auto-update notice untouched (no global npm permission change). Register reconciled.
