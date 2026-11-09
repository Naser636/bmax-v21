# V12.4 — V13: Operational Ingestion Wiring (the pure gate made end-to-end) 2026-11-09

CTO V13 rule: *a built ingestion gate is not an operational capability until ODG can use it, govern its effects, and
verify its results end-to-end.* This closes that gap. (V11/V12 not repeated; their evidence reused.)

## §2 — Caller audit (the exact missing wiring, now built)
Before: `external-input-ingestion.ts` (the PURE gate) had **zero operational callers** — confirmed by grep. The pure
component was never an operational system. Built the missing orchestrator:

| §2 question | Answer (now) |
|---|---|
| who receives inputs | `external-input-intake.processIntake(envelope, deps)` (the production bin supplies real IO via the deps seams) |
| who calls the gate | the orchestrator (step 1) |
| who persists the audit | `deps.persistAudit` → `audit-log.appendEntry` (keyed tamper-evident chain) — **persisted for EVERY outcome** |
| who applies admitted inputs | `deps.apply` (the per-kind deep harness) — only after permission + on REAL/SYNTHETIC admission |
| who updates registers | `deps.updateRegisters` — **only on a REAL apply with admissible proof** |
| who verifies consequences | `deps.verify` (independent) — failure ⇒ rollback |
| who can undo a bad apply | `deps.rollback(token)` — invoked on no-proof or failed verify |

## §3 — Guarantees (code-enforced + tested, `external-input-intake.ts`, gate suite #403, 20 assertions)
- a **REJECTED** input is **NEVER applied** (invalid / duplicate / tampered / synthetic-declared-real) — proven;
- a **duplicate** is rejected on re-ingest (shared seen-digest) — proven idempotent;
- **SYNTHETIC** admitted ⇒ **SIM only, unblocks NOTHING** (a simulation never becomes real proof) — proven;
- **no provenance invented**, **no capability unblocked without admissible proof** (REAL apply must return `proofAdmissible`
  else **NO_PROOF**, nothing unblocked, staged effect rolled back) — proven;
- every admission is **traceable** (audit persisted for every outcome; an audit-persist failure is **fail-closed**, not
  applied) and **reversible** (failed independent verify ⇒ **ROLLED_BACK**) — proven;
- a consequential **REAL** apply requires **canonical permission** (`canApplyReal`) else **ESCALATED**, not applied — proven.

## §2/§8 — Raccordement RÉELLEMENT effectué (live, not a mock)
Wired the orchestrator to the **real** `audit-log` keyed chain and ran a SYNTHETIC fixture (declared-real but
self-authored) live:
```
outcome REJECTED | applied false | audit entries 1 | verifyChain.ok true
after tampering entry[0]: verifyChain.ok false   (tamper detected — fail-closed)
```
⇒ pure gate → intake orchestrator → REAL keyed tamper-evident audit chain (verified); a rejected synthetic-as-real input
was **not applied** but **was traceably audited**; tampering is detected. (`tipAnchored` stays false — tip-anchoring needs
the owner-gated HMAC key; the chain verifies keylessly.)

## §4 — Three voies tested with SYNTHETIC fixtures (never presented as real)
A (EVAL_SET), B (DEMAND_SIGNAL / BILLING_PROOF), C (CLIENT_DOSSIER) each exercised through admit/reject/dedup/persist/
rollback. All fixtures are **synthetic technical fixtures** — they unblock **nothing** in the canonical register (the
`apply`/`updateRegisters` seams are mocks in the test). The only real inputs remain the owner's (V12 §6 dossier).

## §5 — ODG autonomy
ODG: identifies the expected input (kind), selects the mechanism (the gate), checks permissions (`canApplyReal`), calls
the component, processes the result, decides admit/reject **via the pure gate (not by fiat, not by Claude Code)**, triggers
only authorized consequences, has them independently verified, and closes in the Boussole. Claude Code only authored the
wiring; it decides no admission.

## §6 — Other blockers (no new technical resolution; concluded audits not repeated)
The operational ingestion path IS the new resolution for the P-track *mechanism* — only the real owner input remains.
No other of the 13 decisions / 2 déjà-satisfait gained a new internal resolution. Prior concluded audits (SSH key-only,
ports, 15-métier parity, 352-capability ladder, private deploy, Radar) are **not re-run** (§6: no new reason).

## §7/§8 — Closure
Gate **403/403**; tsc clean; CI green on merge. Register updated. HEAD/preservation/edg-core unchanged. No public
exposure, no spend, no secret, no deletion. **Still blocked (owner input):** the 3 voies — one real input activates the
`apply`→`updateRegisters` path (now built + verified) and unblocks the P-track. Next native ODG selection: weekly Radar /
an authorized real input.
