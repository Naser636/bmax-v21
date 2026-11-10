# V12.4 — V32: Program B (FDIR) — native Fault Detection, Isolation & Recovery (2026-11-10)

Program B AUTHORIZED + delivered (C–L stay PROPOSED, not authorized). A native FDIR capability composing existing
canonical mechanisms, with the 10 safety invariants code-enforced and a fault-injection bench proving 0 silent loss / 0
false success. V31 not interrupted.

## Capability — `runtime/core/fdir-engine.ts` (PURE, fail-closed, gate suite)
The cycle DETECT → CLASSIFY → ISOLATE → DECIDE → (AUTHORIZED) RECOVER → INDEPENDENT VERIFY → EVIDENCE → STATE,
COMPOSING: safety-fmea (severity/worst-case), recovery-drill (verified reference), p12 circuit-breaker, bounded
repair-retry, permissions, STATE/EVIDENCE. No parallel system.
- **DETECT (§3A):** timeout / service-down / contract-error / state-incoherence / data-corruption / repeated-failure /
  resource-anomaly / UNKNOWN. A null/garbled signal ⇒ a fault (UNKNOWN), never dropped.
- **CLASSIFY (§3B):** TRANSIENT / PERSISTENT / CRITICAL / UNKNOWN / DEPENDENCY_UNAVAILABLE / INCOHERENT_STATE /
  UNSAFE_RECOVERY. **An UNKNOWN fault is never benign.**
- **ISOLATE + DECIDE (§3C/D):** bounded-retry (transient), circuit-break (persistent/dependency-down), verified-rollback
  (incoherent + a verified reference), SAFE_MODE (unknown / incoherent-without-reference), ESCALATE (critical / no
  permission). **No unbounded retry; no rollback without a verified reference.**
- **VERIFY (§3E):** a recovery is RECOVERED/operational ONLY if permitted, executed, AND an INDEPENDENT verifier confirms
  it — an uncertain/unverified state is NEVER operational.

## §4 — the 10 safety invariants (code-enforced + tested)
1. no detected fault silently cleared · 2. UNKNOWN never benign · 3. no unbounded retry (clamped ≤5) · 4. no rollback
without a verified reference · 5. no recovery PASS without independent verification · 6. recovery is write-set/permission
gated · 7. Truth Lock never bypassed · 8. no destructive restart · 9. an uncertain state never operational · 10. every
step traceable. **CRITICAL severity escalates regardless of RPN (RPN alone is never a safety decision).** FMEA severity is
reused for detection/classification.

## §5 — fault-injection bench + measures (isolated; no real VPS service perturbed)
12 mandatory scenarios (service-down, timeout, dependency-unavailable, corruption, incoherent-state, repeated-failure,
wrong-response, invalid-checkpoint, rollback-impossible, partial-recovery, unknown-fault, multiple-simultaneous) through
positive + negative paths. **Measures: 0 silent loss (every injected fault produced a traceable outcome), 0 false success
(no outcome is operational without independent verification).** KEY falsification: a recovery that executes but FAILS the
independent verify ⇒ UNVERIFIED, NOT operational.

## §6 — VPS integration state (honest ladder)
`fdir-engine` : REGISTERED + CONNECTED + CALLABLE (gate) + EXECUTED (bench) + **VERIFIED** (0 silent loss / 0 false
success). DEPLOYED/OPERATIONAL as a running VPS daemon = NOT claimed (it is a composable governed capability; wiring it
into a live supervisor is a later authorized step). The bench ran in isolation — no real VPS service was perturbed; SSH:22,
edg-core, admin access, network restrictions untouched (§6).

## §7 — Provenance
`fdir-engine.ts` + test = provider-authored framework (stated; `autonomy-claim-guard` consistent — local models were not
used to author this control-plane logic, which must be deterministic + fail-closed). Native authoring remains the V30/V31
frontier for bounded components.

## §8 — Boussole
Program B integrated via the register (new item `serie30-v32-fdir-program-b`). Programs C–L stay PROPOSED/not-authorized.
Any new discovery ⇒ PROPOSED (roadmap-manager, no self-authorization). §6 restrictions intact; no sudo/new-port/spend/
secret/Docker.

## §9 — Closure + V33 prep
B closed: components built, tests pass, falsifications detected (UNKNOWN→safe, no-reference→safe, unverified→not-operational,
no-permission→escalate), recoveries independently verified, limits published (not a live VPS daemon). **V33 prepared (not
authorized):** Program C (Chaos Engineering) — a governed fault-injection harness extending this bench to live (isolated)
components with hypotheses/blast-radius/rollback; prerequisites: isolated sandboxes, the FDIR engine (this), the
recovery-drill, explicit per-experiment authorization. C stays PROPOSED until a directive authorizes it.
