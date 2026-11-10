# V12.4 — V31.1: High-Assurance Program integrated — Program A (Safety/FMEA) built + 12 programs intaked (2026-11-10)

CTO V31.1 (NASA × Airbus × SpaceX × Tesla high-assurance methods, ADAPTED to ODG — no certification claimed) is
integrated into the living Boussole as transversal requirements WITHOUT interrupting V31. Discovery is open; execution
stays governed. Program A is delivered; the other 11 programs are governed PROPOSED chantiers.

## Integration (no parallel registry; V31 roadmap-manager used)
The 12 V31.1 programs (A Safety · B Fault-Tolerance/FDIR · C Chaos/Fault-Injection · D IV&V · E Requirements-Traceability ·
F Autonomous-Mission-Control · G Continuous-Learning/Telemetry · H AI-Assurance · I Fifteen-Métiers-High-Assurance ·
J Secure-Engineering/SLSA · K Radar-Strategic-Intelligence · L VPS-Operational-Assurance) were **intaked through the V31
`roadmap-manager`**: **12 recorded PROPOSED (authorized:false, executed:false), 0 duplicates.** The "discovery ≠
authorization" invariant held — no program auto-executes; each requires a separate governed authorization. This IS the
living-roadmap mechanism V31 built, now absorbing a new program the operator never pre-decomposed.

## Program A — Safety Engineering (FMEA/FMECA + residual-risk register) — BUILT
`runtime/core/safety-fmea.ts` (PURE, fail-closed, gate suite) adapts aerospace FMECA to ODG: for each component failure
mode, RPN = Severity × Occurrence × Detection; classify (CRITICAL/HIGH/MEDIUM/LOW); apply a declared mitigation →
RESIDUAL risk; build a residual-risk register. **FAIL-CLOSED (the high-assurance core):** a missing/invalid factor is
assumed **WORST-CASE (10)** — risk is NEVER under-stated; absence of a mitigation ⇒ no reduction; a HIGH/CRITICAL residual
that is unmitigated or poorly detectable is FLAGGED for explicit owner acceptance or further mitigation; the residual
register is **never silently cleared**.
**Falsifications caught (tests):** S×O×D computed; **missing factors ⇒ worst-case 10 ⇒ CRITICAL** (never a flattering
default); a declared mitigation reduces residual, no mitigation ⇒ residual == raw; unmitigated HIGH/CRITICAL flagged;
residual register lists every CRITICAL/HIGH, not the LOW. This directly encodes "ne jamais confondre absence d'erreur
observée et preuve de fiabilité" — an un-analyzed factor is treated as a worst-case risk, not as safe.

## Mapping to the existing high-assurance posture (reconciled, §15 "reuse, no 13 new services")
Much of V31.1 is already partly satisfied by prior work — recorded so the programs build ON it, not over it:
- **D IV&V:** the independent-verifier discipline (≠ generator) is proven across métier-parcours (15), repair-retry,
  native-project-builder, promotion-assurance, learning-loop — the "generator never its own arbiter" rule is live.
- **B Fault-Tolerance/FDIR + C Chaos:** recovery-drill-benchmark (checkpoints vs independent reference, 0 silent loss,
  corrupt detection, idempotent resume/rollback) + circuit-breaker (P12) + fail-closed everywhere are the FDIR seed.
- **G Learning:** reuse-ledger (verified-only, net-regressor suppression, agrees with independent recompute).
- **J Secure/SLSA:** supply-chain-attest + license-policy + SSH key-only + edg-core loopback.
- **I Métiers:** 15 individually EXECUTED+VERIFIED (V17–V23) with independent assurers.
- **K Radar:** traceable, promotion-assurance-gated, no self-authorize.
Program A (FMEA) is the NEW foundational layer that makes risk EXPLICIT and worst-case-by-default across these.

## §16 Radar strategic research (read-only, within limits)
The 15 research topics (NASA Software/Mission Assurance, FDIR, DO-178C/DO-330, ARP4754/4761, ISO 26262/21448, ECSS,
NIST AI RMF, OWASP Agentic, SLSA, formal methods…) are recorded as Radar research directions (PROPOSED). No spend, no
account, no secret, no third-party contact — read-only public research only, governed, never self-promoting.

## Provenance, security, limits
`safety-fmea.ts` + test = provider-authored framework (stated; `autonomy-claim-guard` consistent). §16 restrictions intact
(Truth Lock, 9 primitives, permissions, private VPS, SSH:22 only, edg-core loopback, no spend/secret/deletion/background
task; NO Docker per §16). **Remaining:** programs B–L are PROPOSED (built in subsequent batches, each requiring governed
authorization); the native-engineering frontier (V30/V31 chantiers) continues.

## Boussole + next
Register reconciled (new item `serie30-v311-high-assurance-program-a`). Gate (new suite). HEAD=origin/main=`65f290f`.
The high-assurance program is now a transversal requirement set in the living Boussole; Program A gives ODG an explicit,
fail-closed, worst-case-by-default risk analysis. Next: authorize + build B/C/D… per priority, via the governed roadmap.
