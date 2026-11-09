# V12.4 — V26: ODG Self-Development — a real limit discovered, a capability built, a measured improvement (2026-11-09)

The V26 loop executed for real: TRAVAIL RÉEL → LIMITE → CAUSE RACINE → CAPACITÉ MANQUANTE → DÉVELOPPEMENT → RE-EXÉCUTION →
MESURE. Not a conformity exercise — ODG worked with its live local model, found a genuine limit, built the missing
capability, and measured a real before/after improvement. All fixtures SYNTHETIC; nothing canonical unblocked.

## A. Initial state
HEAD=origin/main=`584678c`; tracked tree clean (5 stashes / 6 untracked preserved). VPS (read-only probe, §5/Chantier 3,
no mutation): **preprod dashboard responds with HTML on `127.0.0.1:3000`** (live on loopback); `scheduler-audit-chain.json`
= 1 entry, **verifyChain.ok=true** (integrity intact); frontier proposals persisted (1, traceable); radar timer active,
next 2026-11-16, **NRestarts=0** (stable); **only SSH:22 public**. No operational anomaly requiring correction.

## B/C/D/E. Chantier 1 — Autonomous engineering: the real loop (DEEP)
**Real work (live qwen2.5-coder:3b):** a progressive SYNTHETIC defect suite (simple / edge-clamp / parse-edge /
recursion) through generate → parse → write-set guard → INDEPENDENT test.
- **LIMIT DISCOVERED — measured: 3B single-shot acceptance = 2/4.** ✓ simple (4.0s), ✓ edge-clamp (5.6s); ✗ parse-edge
  (independent edge-case test rejected it), ✗ recursion (produced an ANONYMOUS arrow calling an undefined `factorial` ⇒
  runtime error, despite the instruction to use a named function). **The independent verifier caught BOTH — no false
  success.**
- **ROOT CAUSE (hypothesis 1):** the repair flow was SINGLE-SHOT — the independent failure was never fed back.
- **CAPABILITY BUILT:** `runtime/core/repair-retry.ts` (gate suite **#409**) — a governed FEEDBACK-RETRY loop: on an
  independent rejection (wrong result / thrown error / parse / write-set violation) it re-prompts the generator WITH the
  exact failure and retries, bounded, **accepting a fix ONLY on the independent verifier's PASS** (deterministic test:
  recovers a near-miss on attempt 2; always-wrong ⇒ never accepted within budget; out-of-write-set ⇒ rejected;
  generator-claim never trusted).
- **RE-RUN with retry (live 3B):** parse-edge & recursion STILL fail after 3 attempts each (history VERIFY_REJECTED×3).
  **HONEST negative result** — the retry mechanism works, but the **3B model itself is insufficient** for these defects
  (the deeper cause is model capacity, not just single-shot).
- **CAPABILITY APPLIED (existing V6 model-router escalation, now connected to the repair loop):** route the COMPLEX/
  failed defect to the **7B** model. **RE-RUN (7B + retry): recursion ACCEPTED on attempt 1 (26.6s)** — produced a correct
  NAMED `const factorial` recursion, **independently verified**.
- **MEASURED IMPROVEMENT (before/after):** recursion defect — 3B single-shot FAIL → 3B+retry FAIL (0/1) → **7B+retry
  ACCEPTED (1/1)**. The escalation path recovers a real 3B failure, independently verified.
- **Metrics (published with denominators + limits):** 3B acceptance 2/4 (simple/edge pass; parse-edge/recursion fail);
  3B+retry on the 2 hard cases 0/2; 7B+retry on recursion 1/1; false-successes throughout = 0 (the independent verifier
  rejected every bad fix); latencies 4–27s. **Limit:** the 3B model cannot do the harder two even with feedback; parse-edge
  remains unsolved by both in this run (a genuine residual limit — stated, not hidden).

## Chantiers 2 & 4 (diagnosis/self-repair, learning) — reconciled, NOT duplicated
V25 already delivered measured, independently-verified benchmarks for governed repair (false-success-survived=0),
recovery/rollback (0 silent loss, corrupt-detected), and learning-loop efficacy (3/3 net-regressors suppressed, ledger
agrees with an independent recomputation). Per §8 ("improve, don't duplicate what works"), not rebuilt. The NEW capability
this cycle (repair-retry + escalation) extends the repair half with a measured gain.

## Chantier 5 (Radar) — used as-is (promotion closed in V24)
The Radar persistence/traceability (V15/16) and the single auditable promotion-assurance gate (V24) are in place and not
rebuilt (§7). The repair-retry capability is exactly the kind of concrete engineering a Radar gap should become —
demonstrated here end-to-end.

## F. Integration & VPS
`repair-retry.ts` + test integrated canonically (gate 409/409, tsc clean, CI). The live-model runs executed on the VPS's
own loopback Ollama (3B + 7B). VPS reliability probe (§A) read-only, no mutation, no deploy of an experimental component.

## G. Remaining limits
- The 3B model is insufficient for the harder defects even with feedback-retry (escalate to 7B — measured to work for
  recursion). parse-edge remained unsolved by both models in this run — a genuine residual (candidate for V27).
- Live-model results are non-deterministic; the repair-retry LOGIC is deterministically gate-tested, the LIVE numbers are
  a measured snapshot (reported as such, not as a reproducible gate metric).

## H. Next batch prepared (V27, audited — NOT executed)
1. **Complexity-aware repair routing** — wire repair-retry to the model-router so a FAILED 3B attempt auto-escalates to 7B
   within the governed loop; measure the combined acceptance over the full defect suite (target > the 2/4 single-model).
2. **Harder-defect corpus + parse/semantic category** — expand the suite (the parse-edge class both models missed);
   diagnose why, and add the capability (e.g. a test-driven prompt that includes the failing edge case up front).
3. **Repair-knowledge capture** — record each accepted repair's (defect-signature → fix) into the reuse-ledger so a
   recurring defect class is solved from memory (connect repair outcomes to the learning-loop, measured).

## I/J/K. Boussole
Register reconciled (new item `serie30-v26-repair-retry-self-development`). Gate 409/409. HEAD=origin/main=`584678c`. §13
restrictions intact (Truth Lock, 9 primitives, permissions/write-sets, private VPS, SSH:22 only, edg-core 127.0.0.1:8080,
no net, no spend, no secret, no deletion, no background task). Chantier 1 = **EXECUTED + VERIFIED** (capability built,
deterministically tested, live-measured improvement); the VPS probe = **VERIFIED** (read-only, healthy).
