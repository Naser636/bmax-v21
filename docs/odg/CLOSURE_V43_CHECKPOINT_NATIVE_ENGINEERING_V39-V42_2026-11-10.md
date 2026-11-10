# CLOSURE V43 — CANONICAL CHECKPOINT (Boussole V12.4) — Native Engineering Campaign V39→V42

> **CTO Directive V43 (clôture)** — 2026-11-10. This is the canonical session checkpoint for the LOCAL native self-engineering campaign (lots F→O, series V37→V42). It is a RECORD, not a new roadmap. Authority stays with the Master (FROZEN) / Runtime Constitution / CTO Directives / `runtime/governance/ROADMAP.json` / `ODG_AUTONOMOUS_WORK_PROTOCOL.json`. The operational Boussole is `ODG_PROJECT_STATE.md`; this file holds the detail it points to.

## 0. Git truth-lock at checkpoint
- Branch: `excellence/v3-wave3-demonstrators-20261101`
- HEAD (before the checkpoint commit): `46bca61` — **13 local commits ahead of the last known `origin/main` `0a792c7`, NOT pushed.**
- Tracked tree: CLEAN. **5 stashes preserved. 6 pre-existing untracked paths preserved** (`bmax-v21@0.1.0`, `docs/action-film/`, `docs/ecommerce/`, `docs/film-factory/`, `docs/market-research/`, `tsx`).
- Register: `docs/odg/closure-register.json` → **427 items**. Full local gate: **432/432 PASS**. `tsc --noEmit`: **exit 0**.
- NO VPS / SSH / push / fetch / pull / deploy performed in this campaign. Everything is **VERIFIED in-repo (LOCAL) ≠ DEPLOYED ≠ OPERATIONAL on the VPS**.

## 1. The 13 local commits (series V37 §8 → V42 LOT O)
| commit | lot | one-line |
|---|---|---|
| `a2b1dcc` | V37 LOT D | radar-gap-analysis (classify opportunities; propose only demonstrated+useful; never self-authorize) |
| `2b829c3` | V37 LOT E | intelligence-scorecard (per-dimension measured; no single global score) |
| `fb380f7` | V37 §8 | intelligence-loop (wire existing capabilities into one governed cycle) |
| `940a20b` | V38 LOT F | decomposition-planner (detect too-complex/meta; choose DECOMPOSED; the V30 lesson) |
| `3b36608` | V38 LOT G | native-build-outcome (raccord native builds → ledger/calibration; failure-inclusive) |
| `fab20d8` | V38 LOT H | native-engineering-readiness (fail-closed native-vs-provider gate; autonomy EARNED) |
| `7dce448` | V38 LOT I | native-engineering-cycle (end-to-end governed native loop; EXPLORE needs external auth) |
| `ab9ae46` | V39 LOT J | local-model-generator (real generateFile seam → qwen2.5-coder) + LIVE exploration |
| `c92343b` | V39 LOT K | measured self-improvement: concrete META sub-contracts flip META 0/1 → 3/3 ACCEPT |
| `c1d1bb8` | V40 LOT L | calibration campaign — MONOLITHIC:SIMPLE EARNS ATTEMPT_NATIVE (20 attempts, 0.95, CALIBRATED) |
| `120c505` | V40 LOT M | repair on INDEPENDENT-TEST failure; 2 live false successes fixed; 0-failure ⇒ BIASED ⇒ DEFER |
| `8b98ac5` | V41 LOT N | COMPLEX duel 3B-vs-7B — both 8/8 on 4-file pipelines; 3B ~1.6× faster; n<20 ⇒ DEFER |
| `46bca61` | V42 LOT O | HARD spec-only duel — real limit; 3B 2/12, 7B 1/12; 7B no advantage; hard reasoning limit, no engine gap |

## 2. Capabilities DEMONSTRATED (local, independently verified) vs LIMITS
- **Native authoring is real**: the local qwen2.5-coder models (via `local-model-generator.ts`, network-injected so the gate stays hermetic) genuinely author multi-file CommonJS projects; the **INDEPENDENT verifier** in `native-project-builder.ts` is the sole acceptance arbiter — it caught **every** false success.
- **Strategy selection**: `decomposition-planner.ts` chooses MONOLITHIC vs DECOMPOSED; META with concrete sub-contracts measurably beats the generic split (LOT K: 0/1 → 3/3).
- **Honest measurement/learning**: `native-build-outcome.ts` + `mission-outcome-ledger.ts` + `calibration.ts` record failure-inclusively; `native-engineering-readiness.ts` grants ATTEMPT_NATIVE only on CALIBRATED (≥MIN_OBS=20, ≥1 observed failure so not survivorship-biased, reliability ≥0.8); otherwise DEFER_TO_PROVIDER.
- **Earned autonomy, once**: MONOLITHIC:SIMPLE earned ATTEMPT_NATIVE on 3B (LOT L, 20 real attempts, 0.95). LOT M's repair fix then biased that sample (0 failures) back to DEFER — honest statistics over a louder claim.
- **Repair on test-failure** (LOT M): native-project-builder now repairs a false success (compiles but fails the test), bounded; the gate is never lowered.
- **LIMIT (LOT O, spec-only)**: both local models fail ~83–92% of multi-file SPEC-implementation (large 6-file DAGs and contracts/validation = 0/3 both). **7B shows NO measured advantage over 3B** and is ~2× slower; the "7B-only" success quadrant is EMPTY; 3B even won bracket-balance. A `maxRepair=3` probe still fails ⇒ **hard model reasoning limit, NOT a repair-budget or engine defect** (verifier/decomposition/repair all functioned). **No ODG engine change was made.**
- **Native vs provider-assisted provenance**: the framework/orchestration/tests were authored by Claude Code (bounded provider); the PROJECT code under benchmark was authored by the LOCAL models (native). Acceptance of every native build was decided by ODG's independent verifier, never by the generator.

## 3. V42 LOT O result (headline)
- HEAD initial `8b98ac5` → final `46bca61`. 12 HARD tasks, 4 structural families (A large 6-file DAGs, B deep logic, C shared state, D contracts), **SPEC-ONLY contracts** (behaviour + 1 example; no implementation ⇒ reasoning not transcription; a first version leaked the algorithm and both scored ~100% — corrected).
- **24 comparative builds + 2 repair probes.** 3B **2/12** final ACCEPT; 7B **1/12**. **19 first-pass false successes detected** (all caught by the independent verifier); **21 persistent failures** after 1 repair. Quadrants: both pass = stack-machine; 3B-only = bracket-balance; 7B-only = NONE; both fail = 10. Timing: 3B ~45s vs 7B ~95s avg.
- **432/432 suites PASS; tsc exit 0.** Readiness **INSUFFICIENT_DATA / DEFER** for both cells (n=12<20 AND reliability ≪0.8; thresholds unchanged; no ATTEMPT_NATIVE). **Conclusion: observed local-model limit, no demonstrated ODG engine defect.**

## 4. Dataset paths + SHA256 fingerprints (REAL outcomes; preserved, not overwritten)
| dataset | sha256 (first 16) |
|---|---|
| `docs/odg/native-exploration-live.json` | `57fce1da0ff62e82` |
| `docs/odg/native-exploration-meta-improvement.json` | `c3cc49958048f2f7` |
| `docs/odg/native-calibration-simple.json` | `67437d08e5cd4aa9` |
| `docs/odg/native-calibration-simple-v2-repair.json` | `f6cee374951edba2` |
| `docs/odg/native-duel-complex.json` | `445e500b16d525bd` |
| `docs/odg/native-hardbench.json` | `17444cdf57cb8720` |
| `docs/odg/native-hardbench-repairprobe.json` | `3e81c70887f2fae1` |

## 5. Statistical honesty (carried forward)
- Corpora share structural templates within a family ⇒ CORRELATED observations, **not** N independent structures. Repeated attempts are **not** independent observations. Zero observed failures ⇒ **BIASED**, not calibrated reliability. Classes below MIN_OBS(20) or below 0.8 remain INSUFFICIENT_DATA / DEGRADED / DEFER. Thresholds were never reduced to obtain a favourable verdict.

## 6. LOT P — FUTURE WORK, **NOT AUTHORIZED** (do NOT start)
Recorded as candidate improvements to EXISTING ODG components (not new systems), to be run only on explicit CTO authorization:
- (a) Finer guided decomposition (1 concept/file sub-primitives) — does it lift the large-DAG / contract success rate? (`decomposition-planner`).
- (b) Per-file targeted repair (regenerate only the failing file identified by the test) instead of whole-project repair — may converge where global repair does not (`native-project-builder`).
- (c) Richer verification (property-based / extra edge cases) to harden false-success detection.

## 7. NEXT PHASE — ODG RELEASE & MARKET OPPORTUNITY VALIDATION (recorded, NOT executed)
Two coordinated chantiers, to begin in a NEW session (not now):

**CHANTIER A — Real delivery**: (1) audit the 13 local commits vs the remote; (2) diff vs the remote branch; (3) prepare + perform the push of validated changes; (4) prepare VPS deployment; (5) controlled deploy with backup + rollback; (6) startup/health/integrity/security/regression/real-function tests; (7) verify ODG missions + their execution chain; (8) record real evidence in ODG governance. **A local test is never proof of VPS function; never bypass security/authorization.**

**CHANTIER B — 15-métiers opportunity research**: (1) deep internet research on the 15 métiers; (2) real needs + potential clients; (3) competitors/offers/prices/margins/sales cycles; (4) rank by demand × profitability × difficulty × ODG's really-available capabilities; (5) a verifiable €500k-year-1 strategy (hypotheses, scenarios, monthly targets); (6) demonstrators + concrete tests; (7) public/reference projects where needed; (8) client code only with explicit authorization in an appropriate environment.

ODG remains the central authority and primary executor; Claude Code a bounded fallback provider; the independent controller decides acceptance. Research and delivery prep may progress coordinately; **no deployment is rushed for a commercial calendar.**

## 8. RESUME INSTRUCTIONS for a new session (do not restart completed work)
1. Read this checkpoint (`docs/odg/CLOSURE_V43_CHECKPOINT_NATIVE_ENGINEERING_V39-V42_2026-11-10.md`) and `ODG_PROJECT_STATE.md` FIRST.
2. Verify HEAD + git state (`git rev-parse HEAD`, `git status`); confirm 13 local commits vs `0a792c7`, 5 stashes, 6 untracked.
3. Verify local commits and remote refs BEFORE any synchronization. Do NOT push blindly — audit/diff first (Chantier A step 1-2).
4. Do NOT re-run the V39–V42 benchmarks (results are in the datasets above, fingerprinted). Do NOT start LOT P.
5. Begin with CHANTIER A (delivery: audit → diff → push validated → VPS deploy with backup/rollback → health/regression/function tests → evidence) and CHANTIER B (15-métiers opportunity research → ranked strategy toward €500k year-1).
6. Keep results/decisions/evidence in the canonical Boussole (`ODG_PROJECT_STATE.md`) + register; no parallel roadmap.
7. Continue to the new phase's objectives without asking the user to pick each technical sub-task.
