# V12.4 — V14: Canonical Ingestion Qualification (REAL seams, not mocks) 2026-11-09

Exit criterion honored: ingestion is qualified over the CANONICAL paths with REAL seams, not on mock-seam tests alone.

## §2 — Targeted audit: a REAL gap found (mocks masked it) and FIXED
Re-read `external-input-ingestion.ts`, `external-input-intake.ts`, `audit-log.appendEntry`, and the apply/update/verify/
rollback seams. **Finding:** `processIntake` did not handle an `updateRegisters` failure — if the register update returned
`{ok:false}` but `verify` passed, it still reported `APPLIED_REAL` (a success whose register effect never landed). The
V13 mocks always returned a succeeding update, masking it. **Fix:** a failed register update now **ROLLS BACK**
(no partial `APPLIED_REAL`); invariant added; regression test added (scenario 5b). tsc clean.

## §3 — Nine scenarios, REAL seams (run live): `runtime/__bench__/ingestion-canonical-qualification.e2e.test.ts`
Seams are the ACTUAL mechanisms: audit = real `audit-log.appendEntry`/`verifyChain` (persisted to a temp file);
apply = real `broad-it-eval-ingest.measureOnEvalSet` (real `independent-label-policy` + `code-execution` checker);
update/verify/rollback = real reads/writes of a **sandbox** register file. **15/15 PASS:**

| # | Scenario | Result (real seams) |
|---|---|---|
| 1 | synthetic admission, SIM | APPLIED_SYNTHETIC, unblocks nothing, sandbox register UNCHANGED |
| 2 | real declared, no permission | ESCALATED, register UNCHANGED |
| 3 | authorized, real harness MEASURED | APPLIED_REAL, sandbox register → ACCEPTED+measured, independently verified |
| 4 | audit-persist failure | REJECTED (fail-closed), register UNCHANGED |
| 5 | apply yields no proof (self-authored eval set ⇒ harness NO_DATA) | NO_PROOF, nothing unblocked, register UNCHANGED |
| 6 | register-update failure | ROLLED_BACK, sandbox register RESTORED |
| 7 | independent verify failure | ROLLED_BACK, sandbox register RESTORED |
| 8 | audit chain integrity | real chain verifies; tampering an entry breaks verifyChain (fail-closed) |
| 9 | dedup after interruption/resume | seen-digests reloaded from disk; re-ingest ⇒ REJECTED (dedup survives restart) |

**Honesty:** all inputs are SYNTHETIC qualification fixtures; the "independent" provenance is a TEST construct to drive
the REAL_ADMITTED mechanical path; the MEASURED number is over synthetic cases in a **sandbox** register — **NOT** a real
broad-IT measurement, unblocks **NOTHING** canonical. The canonical `closure-register` was never touched.

## §4 — Integrity & governance
- **Verifiable chain vs HMAC-anchored chain (precise):** the keyless `verifyChain` recomputes each link's `sha256` and
  detects **any single-entry tamper** (proven: altering entry[0] ⇒ ok=false). Its limit: a full rewrite of the WHOLE chain
  can be re-hashed consistently. A **keyed-HMAC + tip-anchor** binds every link to a secret key, so a full rewrite without
  the key fails and the tip can be externally anchored. **Key custody is owner-gated** — no secret is created or invented
  here; the chain runs keyless-verifiable today (`tipAnchored:false`), and becomes forge-resistant once the owner provides
  a key (register item `p0e-audit-log-keyed-integrity`: mechanism already DONE, only custody remains).
- **Every consequence authorized/traceable/reversible:** REAL apply needs `canApplyReal` (else ESCALATE); audit persisted
  for every outcome (persist failure ⇒ fail-closed); failed update/verify ⇒ rollback.
- **No bypass:** grep confirms `external-input-intake` is the sole caller of the gate, and the gate is the sole external-
  input path that runs provenance+independence. Even a direct `measureOnEvalSet` call independently enforces label
  independence (NO_DATA otherwise) — there is no secondary path that admits an external input as real proof unchecked.

## §5 — Three voies (unchanged; no real input fabricated)
EVAL_SET (independent labels) · DEMAND_SIGNAL/BILLING_PROOF · CLIENT_DOSSIER — exact envelope formats + expected proofs +
authorized consequences in the V12 §6 dossier. ODG fabricates none.

## Exit criterion — ingestion capability ladder
- **REGISTERED** (register items serie30-v12/v13/v14) · **CONNECTED** (intake→gate→audit-log/harness/register seams) ·
  **CALLABLE** (unit suites in the 403-gate) · **EXECUTED** (canonical e2e run live, real seams) · **VERIFIED** (9 scenarios
  + the register-update-rollback fix + tamper detection).
- **Verdict:** the ingestion PATH is **operationally qualified over the canonical mechanisms** (not mocks). The only thing
  it still awaits is a **real owner input** to drive the apply→update on the CANONICAL register — the mechanism is proven
  ready; no synthetic input can or does unblock a canonical capability.

## Closure
Gate 403/403 (incl. the intake fix regression); canonical e2e 15/15 live; tsc clean. Preservation, SSH, ports, edg-core,
Truth Lock unchanged. Next native ODG selection: weekly Radar (2026-11-16) or an authorized real input.
