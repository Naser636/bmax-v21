# V12.4 — Métier Parity Closure: the 5 gaps closed (2026-11-09)

**CTO Métier Parity Closure — §2/§4.** The 5 NOT_BENCHMARKED gaps in `metier-baseline` were **not capability gaps** —
the 5 métiers already had gate-tested capabilities; the gap was **benchmark-probe coverage**. Closed by adding probes
that exercise the **existing** capabilities (reuse, no new engine). `metier-benchmark-multidim` now covers **15/15**;
`metier-baseline` reports **15 benchmarked, 15 effective, 0 gaps** (detection 1.0, specificity 1.0, reproducible, 0
false-pos/neg/crashes). Gate 391/391.

## The 5 gaps and their treatment (distinguishing real lacunae from coverage gaps)

| Métier | Was it a real capability gap? | Treatment | Probe (adversarial → benign, real capability) |
|---|---|---|---|
| **P5** Cloud/Platform | No — `canary-decision-pack` existed | added probe | engineering/mutating rollout ⇒ `safe=false` (flagged) · read-only ⇒ safe |
| **P10** Regulatory | No — `profession-p10-regulatory` existed | added probe | "ISO 27001 certified" overclaim ⇒ REFUSED · honest prep statement ⇒ not |
| **P11** Document/IDP | No — `profession-p11-document` existed | added probe | missing mandatory BT-1 ⇒ rejected · well-formed invoice ⇒ accepted |
| **P13** AI-Infra/GPU | No — `profession-p13-aiinfra` existed | added probe | gpu-simulated latency ⇒ flagged SIMULATED · cpu-reference ⇒ genuinely measured |
| **P14** DevEx | No — `profession-p14-devex` existed | added probe | incomplete scaffold (no health) ⇒ not attested · complete ⇒ attested |

Each probe runs the métier's **real E3 adversarial case** (DETECTION) + a benign case (SPECIFICITY) + malformed input
(ROBUSTNESS, no crash), measured twice for reproducibility. A "block-everything" guard would fail SPECIFICITY — none does.

## Honest distinctions maintained (§4)

- **NATIVE / PROVIDER / HUMAN / UNKNOWN:** all 15 métier capabilities are **NATIVE** (ODG modules; no provider call in
  these demos).
- **NOT_RUN / PASS / FAIL / FLAKY:** every probe is PASS (gate 391/391); none NOT_RUN or FLAKY.
- **SIMULATED / OBSERVED / VERIFIED:** the probes run on **synthetic** inputs (P13 explicitly flags its simulated path as
  SIMULATED — the honesty property is itself the thing tested); these are VERIFIED engineering capabilities, not client
  outcomes.
- **TECHNICALLY_READY / CLIENT_VALIDATED / COMMERCIALLY_ACTIVE:** all 15 are now uniformly **TECHNICALLY_READY** at
  parity (same DETECTION+SPECIFICITY+ROBUSTNESS standard). **None is CLIENT_VALIDATED or COMMERCIALLY_ACTIVE** — that
  requires a real client (owner-gated). No métier received E5 without real evidence.

## Parity standard (§19): the floor, not the average

Parity is now measured across **all 15** (previously the 5 uncovered métiers were excluded, which would have let the
average hide them). The weakest métier sets the parity level: all 15 are EFFECTIVE on the common 3-dimension standard, so
the parity floor is **EFFECTIVE across 15/15** — honestly, at the TECHNICALLY_READY tier, not a commercial one.

## Evidence

`runtime/core/metier-benchmark-multidim.ts` (15 probes, reuses canary-decision-pack + profession-p10/p11/p13/p14) ·
`metier-baseline.baseline` (15/15 benchmarked, 0 gaps) · both gate-tested (updated assertions reflect the real 15/15
coverage — the gap genuinely closed, not masked). Register + manifest + Boussole updated.
