# V12.4 — V16: Autonomous engineering cycle — Radar persistence resilience (2026-11-09)

Records V15 closure. ODG selected a technically-executable, non-owner-gated mission and drove a FULL engineering cycle
under its own governance — not an isolated test.

## §3 — The engineering loop, demonstrated on a REAL repo need (the 10 steps)
1. **Real need detected:** the V15 Radar-persistence path reported `decision: undefined` on a CORRUPT proposal registry
   (a resilience/observability gap on a real mechanism — reproduced).
2. **Mission:** harden `persistFrontierDecision` to surface a clear fail-closed incident; register item `serie30-v16-*`.
3. **Deps/risks:** touches only the Radar bin's reporting; the underlying store already refuses corrupt writes (no data
   risk); risk = masking a real success — mitigated by tests on both the corrupt and the normal path.
4. **Capability:** reuse the EXISTING `frontier-radar-store` fail-closed returns (no new mechanism, no provider, no net).
5. **Plan/authorization:** local edit on the working branch; Truth Lock + permissions intact.
6. **Targeted change:** normalize a store `ok:false` to a clear `CORRUPT`/`BLOCKED`/`ERROR` decision (never `undefined`).
7. **Independent tests:** `odg-frontier.test.ts` (in the gate) — corrupt⇒CORRUPT+NO write; write-failure⇒ERROR; plus the
   existing record/dedup/promoted-REFUSED/no-proposal; full gate 403/403; tsc clean.
8. **Integration:** canonical PR → CI → merge (below).
9. **Evidence:** live proof retained (this doc).
10. **Closure:** register reconciled; cycle closed in the Boussole.

## §2 — Radar exploitation qualification (verified, not rebuilt)
| Check | Result |
|---|---|
| timer real trigger | `odg-radar-weekly.timer` active+enabled, next 2026-11-16 (live) |
| persistence + **dedup after process restart** | V15: two SEPARATE process runs ⇒ run1 PROCEED, run2 DUPLICATE (dedup survives restart — the journal is on disk) |
| provenance + history conserved | `frontier-proposal-registry.json` keeps the provenance-stamped proposal + `frontier-idempotency-journal.json` across runs |
| no auto-promotion | a `promoted` decision is REFUSED; proposals are PROPOSED + grantsNoPermission |
| **write-failure behavior** | throw caught ⇒ `decision: ERROR`, fail-closed, not a crash (tested + live) |
| **corrupt-registry behavior** | `readStrict` flags corrupt ⇒ `recordProposal` refuses BEFORE any write ⇒ **NEW:** surfaced as `decision: CORRUPT` (was `undefined`); **corrupt file NOT overwritten** (evidence preserved) — proven live on the real registry |
| local vs external research | the Radar runs a fixed **allowlisted local** scenario; **external research (TED/etc.) requires authorized network egress — still forbidden/out of scope** (no net) |

## §4/§5 — Scope honesty
- 15 métiers: parity 15/15 acquired (not redone). Full per-métier e2e (entrée→métier→capacités→permissions→exécution→
  résultat→assurance→clôture) is **not yet demonstrated end-to-end for each**; that is a candidate for a future cycle with
  a specific real gap — **not fabricated here** (§1 no invented mission; §5 no artificial tests).
- Resilience was tested only where a real mechanism + real risk exists (corrupt registry / write failure on the Radar
  store). No artificial tests multiplied.

## Capability ladder (ingestion + Radar)
REGISTERED/CONNECTED/CALLABLE (gate 403) · EXECUTED (Radar persists live; ingestion e2e V14) · VERIFIED (dedup-across-
restart + corrupt/write-failure fail-closed, proven live). The Radar persistence capability is now **operationally
resilient**, not merely present.

## Closure
Gate 403/403; tsc clean; CI green on merge. `runtime/generated/` gitignored (live proof not committed; mechanism+tests
are). Preservation / SSH / ports / edg-core / Truth Lock / 9 primitives / permissions unchanged; no net, no spend, no
secret, no deletion, no false real proof.
