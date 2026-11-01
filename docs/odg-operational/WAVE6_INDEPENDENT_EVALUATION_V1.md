# Wave 6 — Independent Evaluation Report (V1)

**CTO Master Unified Mandate, Wave 6.** Date **2026-11-01**. Consolidates the **actually-performed** independent evaluation of the campaign's engineering + the honest frontier of what is **NOT yet run** or **owner-gated**. **No fabricated benchmark, no external head-to-head that wasn't run, no "world-class" or superiority claim. "Cannot verify" is treated as a gap, not a pass.** All results verified against live git/CI/test state.

## 1. What independent evaluation actually occurred (FACT)
Every Wave-4 capability build (G-01…G-08) was adversarially validated by a **separate-context agent** (own tooling, own commands), not the implementer, before merge. Each ran **mutation testing** (break an invariant → confirm the test FAILS → restore) to prove non-vacuity, attempted to force a false-pass/fail-open, and left the working tree byte-identical. Summary (all merged, 2 green CI each):

| Build | Module | Independent verdict | Mutations caught | Concern raised → closed | Notable |
|---|---|---|---|---|---|
| G-01 | characterization-baseline | ACCEPT | yes (4 invariants) | zero-entry vacuous-PRESERVED → fail-closed guard | tamper-evidence via evidence-provenance confirmed |
| G-02 | charter-record | ACCEPT | yes (6/6) | — | non-invasive byte-confirmed; faithful dual-engine normalization |
| G-03 | executable-spec-intake | ACCEPT | yes (5/5) | — | precedence referential (reuses MA.PRECEDENCE), not copied |
| G-04 | dataset-quality-assertions | ACCEPT | yes (5/5) | — | SARIF reuse correct; non-blocking note (assertionType not forwarded into SARIF) recorded |
| G-05 | golden-path-evidence-bundle | ACCEPT-WITH-CONCERNS | yes (5/6) | zero-components pin → added | source correct; test-gap closed |
| G-06 | dora-metrics | ACCEPT-WITH-CONCERNS | yes (4/4) | null-arg fail-soft → one-line guard | denominator math confirmed exact; deployment-freq never inferred from completions |
| G-07 | misleading-case-corpus | ACCEPT | yes (5/5) | shallow-freeze → deep-freeze | **surfaced a REAL k-eval resistance gap (falseSuccessRate 0.25); confirmed a FAIR honest measurement, k-eval unmodified** |
| G-08 | evidence-pack-export | ACCEPT | yes (5/5) | — | double-guard caught a planted "SATISFIED" even with the primary guard neutralized; no pass ever emittable |

Also independently validated earlier in the campaign (separate context): audit-log #326 (one REJECT→fix→ACCEPT on a real NUL regression), evidence-provenance #328, mission-ledger #332, actor-provenance #333. The independence is real — a validator rejected a genuine defect.

## 2. Mechanical regression + typecheck (FACT, reproducible)
- Full classified gate **`ODG_TEST_WORKERS=8 npm run test:report` → 253/253 PASS, 0 FAIL, 0 BLOCKED, 0 un-run, 0 stale** (grew 245→253 as G-01…G-08 landed; each addition kept it green).
- `tsc --noEmit -p tsconfig.json` = 0 and `-p tsconfig.runtime-dist.json` = 0 on every merged lot.
- `npm run build:runtime` (dist-closure guard) OK on every lot.
- CI "build + typecheck + parity + tests" green first-try on all 20 PRs this campaign (#339–#358); no stalls.

## 3. Evaluation specs authored (Wave 3 deliverable) + their honest status
Each `EXPERT_SYNTHESIS_D0x_V1.md §5` and `CLIENT_READINESS_D0x_V1.md §Q` defines reproducible tasks, external baselines (for *calibration/conformance*, not a leaderboard), metrics, and limitations. Status:
- **RUN + green (in-repo, deterministic, synthetic):** the per-module adversarial suites behind G-01…G-08 + the pre-existing k-eval before/after, reality-gate ladder, mechanical-acceptance precedence, dataset-quality injected-defect fixtures, einvoice round-trip, SLO survivorship/PREPARE-not-APPLY, O3 byte-identical readiness matrix (10/10). These measure **pipeline integrity on synthetic cases**, not general capability.
- **NOT RUN (honest):** no head-to-head performance comparison against external products (Datadog/Grafana/Vanta/Drata/Great-Expectations/LangSmith/COMPL-AI, etc.) was executed — those are named as *conformance/positioning* references only; running them is out of scope + would require their harnesses. **No superiority claimed.**
- **NO_DATA by design:** broad-IT success rate (`broad-it-eval`) + any fairness measurement on real data (`fairness-eval`) remain `NO_DATA`/`NOT_APPLICABLE` until an **independently-labelled external dataset** is admitted (owner-gated OG-03). This is the honest abstention, not a failure to try.

## 4. Security / reliability / false-success-resistance (FACT)
- **Security:** bubblewrap confinement of untrusted compilers/shell; patch-executor write-confinement (symlink/`..` escapes closed); keyless tamper-evidence across audit-log/evidence-provenance/mission-ledger (keyed-HMAC owner-gated); third-party-agent-gate OWASP Agentic Top-10 fail-closed. Recon across the campaign caught real fail-OPENs green tests missed (e.g. the CRITICAL bash-governor host-read class) — all closed or confined.
- **Reliability:** checkpoint-engine crash-atomic + reboot-validated; slo-collector survivorship guard; slo-response PREPARE-not-APPLY (autoApply always false); odg-health fail-visible (absent ⇒ UNKNOWN).
- **False-success-resistance:** G-07's misleading-case corpus + scorer is the headline integrity instrument; run against the real k-eval evaluator it honestly reported falseSuccessRate 0.25 (2/8 fooled) — a real gap surfaced, not hidden.

## 5. Deliverable completeness (FACT)
Waves 0–5 deliverables all merged + register-reconciled: 1 unified register, 1 capability inventory, 11 market dossiers, 99 expert profiles + 11 synthesis models + 11 benchmark specs, 1 capability-gap register, **8 capability builds (G-01…G-08)**, 11 client-readiness dossiers. Register 0-stale throughout.

## 6. Honest gaps the evaluation itself reveals (what Wave 6 does NOT prove)
1. **No external performance head-to-head** was run — ODG's positioning vs named competitors is argued from capability + market evidence, not a measured contest. No superiority asserted.
2. **No real-client / authorized-external-case evaluation** — every eval is on synthetic/own-repo data (consistent with €0 clients, no R4+).
3. **broad-IT + real-data fairness = NO_DATA** until an independently-labelled dataset (OG-03, owner-gated).
4. **Latency SLOs / DORA keys** remain `null`/unobservable until a provenanced baseline + a stamped campaign run (owner-gated baseline).
5. **Keyed-authenticity** of evidence writers awaits `ODG_AUDIT_HMAC_KEY` (OG-01).
6. **G-04 non-blocking note:** the dbt assertionType is reachable via `assertionTypeOf`/`coverage` but is not forwarded into the delegated SARIF output (recorded, violates no claim).

## 7. Verdict
The campaign's engineering is **independently validated at the mechanism level** (adversarial separate-context validation + mutation testing + full green regression on every lot), with **honest NO_DATA/NOT_RUN markers** wherever outcome-measurement would require an external dataset, an authorized client case, or an owner-gated key/baseline. No benchmark was fabricated; no superiority or world-class claim is made; the one real resistance gap found (k-eval, via G-07) is reported, not hidden. **This closes Wave 6 at the honest ceiling reachable without owner-gated inputs.** Remaining outcome-level evaluation is enumerated in §6 and tracked in `CAPABILITY_GAP_REGISTER_V1.md §B` (OWNER_GATED).
