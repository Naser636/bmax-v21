# V12.4 — V31.2: Cognitive/Operational Intelligence integrated — LOT 1 first capability (plan evaluator) 2026-11-10

CTO V31.2 (NASA/JPL/Airbus/Tesla/SpaceX adaptive-engineering METHODS adapted to ODG — principles, not proprietary code)
is integrated into the living Boussole. V31/V31.1/V32 preserved and NOT interrupted. The 5 cognitive LOTs are intaked as
PROPOSED (discovery ≠ authorization); the LOT 1 keystone capability — a multi-criteria constrained plan evaluator — is
delivered.

## Integration (no parallel registry; roadmap-manager used)
The 5 V31.2 LOTs (1 Mission-Intelligence/CASPER-ASPEN · 2 Data&Learning/Engineering-Data-Engine · 3 Multi-Métier ·
4 Radar&Strategic · 5 Self-Engineering&Digital-Twin) were **intaked via the V31 roadmap-manager** → **5 PROPOSED
(authorized:false, executed:false)**, discovery ≠ authorization enforced. The high-assurance programs (V31.1 A–L, V32
FDIR) are REPOSITIONED per §12 as the safety spine that SUPPORTS — not replaces — reasoning/planning/learning.

## LOT 1 keystone — `runtime/core/plan-evaluator.ts` (PURE, fail-closed, gate suite)
Implements the §10 governed objective: **J(π) = w1·Psuccess + w2·Vobjective + w3·Qquality − w4·Ttime − w5·Cresources −
w6·Rrisk − w7·Uuncertainty**, the heart of §2 (NASA constrained decision) / §6.5–6.7 (reason/plan/decide) / §16.1–2
(build + optimize a plan under constraints).
- **Hard constraints BEFORE optimization (§10):** a plan violating POLICY / authorization / Truth-Lock / write-set / a
  declared hard constraint is **INFEASIBLE (J = −∞)** and is NEVER selected, whatever its benefits.
- **Balanced, not speed-greedy:** benefits (success/value/quality) vs costs (time/resources/risk/uncertainty) — a
  **slower, reliable, low-risk plan beats a fast, risky one** (tested); speed alone never wins.
- **Fail-closed factors (high-assurance):** a missing benefit ⇒ 0 (no credit); a missing risk/uncertainty ⇒ 1
  (worst-case) — an under-specified plan is NOT favoured (tested).
- **Explainable + reproducible (§6.5/§16.16):** returns per-criterion contributions, the winner-vs-runner-up margins, the
  rejected (infeasible) plans, and the MISSING information (never silently assumed favourable); deterministic tie-break.
**Falsifications caught:** reliability > fast-risky; a perfect-but-POLICY-denied plan rejected; each hard-constraint type
rejects; an under-specified plan loses to a specified-safe one; all-infeasible ⇒ nothing selected.

## Mapping to existing mechanisms (reuse, no new authority)
The evaluator consumes plan metrics + the POLICY/authorization/Truth-Lock/write-set signals ODG already has; it selects no
action (the governed caller decides + authorizes). It is the DECISION layer of the SENSE→…→IMPROVE cognitive cycle whose
other layers partly exist: perception (register/logs/health probes), model (capability-map/SYSTEM_INTEGRATION_AUDIT),
learning (reuse-ledger), recovery (fdir-engine V32), risk (safety-fmea V31.1), discovery/roadmap (roadmap-manager V31).

## Honest scope / limits
This delivers the constrained DECISION/evaluation keystone of LOT 1 — not the full CASPER continuous-replanner, the
Engineering Data Engine (LOT 2), multi-métier coordination (LOT 3), Radar transfer (LOT 4) or the digital twin (LOT 5);
those remain PROPOSED for subsequent authorized batches. Plan metrics are inputs (the probability/quality estimators that
feed them are a LOT 2 learning concern) — stated, not overclaimed. In-repo capability, not a deployed service.

## Provenance & security
`plan-evaluator.ts` + test = provider-authored framework (decision-layer control logic must be deterministic + fail-
closed; `autonomy-claim-guard` consistent). §17 restrictions intact (Truth Lock, 9 primitives, permissions, private VPS,
SSH:22 only, edg-core loopback, no spend/account/secret/third-party/exposure/Docker; no auto-delegation). Read-only public
Radar research remains available within limits.

## Boussole + next
Register reconciled (new item `serie30-v312-cognitive-lot1-plan-evaluator`). HEAD=origin/main=`81719a6`. The cognitive
program is integrated as transversal requirements; LOT 1's decision keystone is live. **Next (ODG-selectable, each
PROPOSED requiring governed authorization):** LOT 1 continuation (CASPER-style continuous replanning over the register),
then LOTs 2–5; V32 Program C (Chaos); the weekly Radar; or an owner input. The §13 intelligence-measurement suite is a
cross-cutting LOT-2/benchmark concern (prepared, not built here — avoids an arbitrary global score masking a weak domain).
