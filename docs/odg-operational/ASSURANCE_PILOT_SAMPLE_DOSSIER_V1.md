# ODG — Assurance pilot: sample dossier (SYNTHETIC, V1, 2026-10-27)

> Rendered by `runtime/core/assurance-pilot-runner.ts` (suite 9) on a FICTIONAL synthetic project. **NOT a client engagement; no certification; no guarantee; no client data.** Reproducible (same input ⇒ same provenance seal).

# Assurance pilot dossier — SYNTH-DEMO (fictional, not a client) (SYNTHETIC)

> **SYNTHETIC reproducible pilot — NOT a real client engagement; no certification; no guarantee; no client data.**

SBOM: 4 dependencies · licenses MIT:1, GPL-3.0:1, UNKNOWN:1, APACHE-2.0:1.

Findings (6):
- [MEDIUM] dependency — left-pad is outdated → upgrade left-pad to a maintained version (evidence: SBOM entry left-pad@1.0.0)
- [HIGH] license — copyleft-lib license GPL-3.0 is non-permissive/unknown → review obligations or replace copyleft-lib (evidence: license-policy classification GPL-3.0)
- [HIGH] license — mystery license UNKNOWN is non-permissive/unknown → review obligations or replace mystery (evidence: license-policy classification UNKNOWN)
- [MEDIUM] reliability — passing ratio 60% < 80% → raise test coverage / fix failing tests (evidence: tests 6/10)
- [HIGH] ai-act — generates synthetic content — Art.50(2) marking applies → machine-readable marking of AI-generated content (evidence: declared aiActivities.generatesSyntheticContent)
- [MEDIUM] ai-act — user-facing AI — Art.50(1) disclosure applies → inform users they interact with an AI (evidence: declared aiActivities.systemInteractsWithHumans)

Acceptance: every finding actionable = true. Provenance seal: 9660596c8ee85a4bd849eba60b7a98c32b11dda6d8cf9413d8c8340062f815d3.

---

## Before/after remediation (synthetic)
- open findings before: **6** → after: **2** (resolved 4); AI-Act Art.50 items remain (compliance tasks, not auto-fixed).

## Acceptance checklist (testable)
- [ ] SBOM produced for all deps · [ ] every finding has severity+remediation+evidence · [ ] gaps classified · [ ] provenance seal verifies · [ ] audit chain verifies · [ ] NO cert/guarantee claim.

## Recovery / reproducibility
Deterministic + pure: re-running the same synthetic input yields identical findings and the same provenance seal; the run is logged to a tamper-evident audit chain. Running on real client data/systems requires client authorisation (out of scope).
