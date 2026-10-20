# ODG_LIVE_AUTONOMY_WEB_TO_MARKET_TEST_V1 — Consolidated Final Report

**Mode:** end-to-end orchestration — repair (§1,§2), validate (§3), real Internet commercial test without contact (§4), measures/learning (§5). **Date:** 2026-10-20. **Verdict:** **PASS WITH BLOCKERS**.

Separation discipline throughout: **observed facts** vs **hypotheses** vs **blockers**. No contact sent, no spend, no infra change. Contact & contract counters remain **0**.

---

## 1. Truth Lock & commits
- Entry HEAD `06bae0e`, branch `main` synced with origin, worktree clean, **5 stashes intact**, protected zones untouched, prior report present. PASS.
- Commits this mission (fast-forward): **`d772cc6`** (§1+§2 code) and the documentary commit carrying this report + compass.

## 2. §1 — Planner authorization wiring + results
**Finding (corrects the prior report):** the planner **already** derives the per-objective autonomy-DENOMINATOR authorization from the *verifiable governance envelope* — `mode AUDIT/ANALYZE` ⇒ read-only eligible; `authorized_paths` ⇒ scoped-engineering eligible; else **fail-closed UNDECLARED** — in BOTH `mission-loader.js` and `.ts` (no parity gap), locked by `mission-loader-cm5.test.ts`. `AUDIT_THE_RUNTIME_STATE` was NOT_MEASURABLE because its contract `mode` is `SEQUENTIAL`, not a wiring gap. A naive goal-text eligibility stamp was **rejected**: `nl-objective-gateway` classifies "audit", "z" and "edit" all as GENERATE/NONE, so it cannot prove read-only intent and would have broken the tested anti-inflation case 6.
**Change made (bounded, anti-inflation):** connected the governance goal-classifier (`objective-authorization.declareAuthorization`) to **explicitly EXCLUDE reserved/human-gated objectives with their reason** (CTO §1 "restent exclus avec leur raison") for objectives the envelope left undeclared — stamping **only exclusions, never eligibility from goal text**. An external/human goal that merely lacks paths (deploy, send-email) is now `{excluded, reason}`; an internal/ambiguous no-scope goal stays UNDECLARED (fail-closed). Exclusions can only shrink the eligible denominator ⇒ **cannot inflate**.
**Tests:** `mission-loader-cm5.test.ts` extended 14→**18** (case 2 deploy ⇒ excluded-with-reason; new COMMUNICATE-excluded + internal-undeclared cases); dist closure copies `objective-authorization.js` (build OK). JS/TS dual-port parity green.

## 3. §2 — Direct front-door attempt-logging
**Finding:** the autonomy-loop route feeds the attempt-log (via `src/runtime` adapter + `deriveRunAttempt`), but the **direct human front-door** (`odg-local-pipeline.sh`) did not. `deriveRunAttempt` lives out of the `runtime/` tree (unreachable from the front-door); `recordAttempt` is a plain append (no dedupe).
**Change made:** new in-tree `runtime/core/front-door-attempt.{js,ts}` (+`.test.ts`, **8 tests**) **reuses `mission-attempt-log`**, mirrors the honest outcome rule (signal⇒INTERRUPTED; absent/foreign report⇒UNVERIFIED — never a false completion), is **idempotent by (mission, runId)** (no double-recording), and parses both stage-log formats. Wired into the pipeline's terminal trap: fires once per run, non-blocking (never changes the mission exit code), opt-out `ODG_ATTEMPT_RECORD=0`. The autonomy loop is **unaffected** (it spawns `odg-run.js` directly, with its own recorder) ⇒ no double-count.
**Proven LIVE:** a real `AUDIT_THE_RUNTIME_STATE` run through the real shell recorded `outcome=SKIPPED, finalStatus=BLOCKED, runId, durationMs≈30000, provenance=[mission-report.json], retries=0, recovery=null, stagesExecuted=10, stagesFailed=[Validation Engine]`.

## 4. LIVE measures obtained & limits (§3 validation)
- Full `npm test` **EXIT 0** (both new tests + mission-loader dual-port parity green inside the suite; 233 pass-markers; no genuine failure).
- `tsc` **0 errors** across `tsconfig.json` + `runtime-dist` + `leaves-strict`.
- Targeted + dependency set green (CM-5 18, front-door-attempt 8, autonomy-measure, autonomy-rate, mission-attempt-log, objective-authorization, nl-objective-gateway, mission-loader.verify).
- **Limit:** LIVE autonomy remains NOT a statistically demonstrated SLO — one mission is not a sample; no provenanced SLO target is declared. Not claimed measurable beyond the per-run declaration.

## 5. §4.A — Comparable providers (origin-verified, consulted 2026-10-20)
| Provider | Site | Exact offer observed | Clients | Pricing | Certs | Proof | vs ODG |
|---|---|---|---|---|---|---|---|
| **Regulus** | goregulus.com | "builds the nine CRA documents in Word … and marks what is still missing instead of inventing it"; scope classification, risk assessment, SBOM + vuln tracking, conformity-assessment support, expert review | manufacturers, software teams, IoT vendors, consultancies | product price **not stated** (mentions EU SECURE 50% SME co-funding ≤ €30k) | none stated | none stated (no case studies/logos) | Very close positioning (honest "mark missing, don't invent" ≈ ODG NOT_ASSESSED). ODG adds signed in-toto provenance + independent re-verification; Regulus is a document generator with expert review. |
| **sbomify** | sbomify.com | "Your Security Artifact Hub" — Trust Center, `security.txt` (RFC 9116), **CRA Compliance Wizard**, SBOM generation/storage | manufacturers (general) | not stated (pricing link present) | none stated | case-studies link present, no details on page | SaaS/platform model; ODG is a composable evidence-pack runner, not a hosted hub. |

**Partnership hypothesis (clearly hypothetical):** ODG's signed, re-verifiable evidence-pack + gap report could in theory feed a consultancy/document-generator's workflow as a provenance layer. Unvalidated — no contact made.

## 6. §4.B — Buyer candidates & public evidence
**Honest outcome: ZERO qualified buyers.** Four bounded public searches surfaced (a) the regulatory **NEED CLASS** (CRA reporting from 2026-09-11, full compliance 2027-12-11; broad, dated, verifiable) and (b) a **crowded funded-vendor landscape** (FOSSA, Finite State, ONEKEY, sbomify, Regulus, Mend) — but **no specific EU buyer with a verifiable individual signal of budget/urgency/decision-power**.
**One adjacent procurement signal** (recorded, then discarded): `RFP for Empanelment of Cyber Security Service Providers`, cdn.lichousing.com (issuer inferred **LIC Housing Finance, India**; dated 2026-09; the search snippet states such RFPs require SBOM/AI-BOM). **Verification limit:** the PDF body was not machine-parseable (WebFetch returned raw streams; `pdftotext` unavailable), so budget/eligibility/exact scope are UNCONFIRMED. **Fit = LOW** (India cyber-security empanelment, not EU CRA/AI-Act O2/O3; qualification-gated; a solo provider with no legal entity is ineligible). Per §4.B it is **not** presented as a qualified buyer.

## 7. §4.C — ODG chain run end-to-end on the real signal + preparatory offer
Ran `opportunity-detector.detect` → `enterprise-lead-grade` → provenance → scoring on the LIC Housing signal:
- grade **B** ("probable need, explicit signals, budget unknown"), score 60, `missing=[deadline, budgetEur]`, **`contentProvenance=REJECTED`** (no verified content hash — PDF unparseable), `nextAction="QUALIFY … (send human-gated)"`.
- **ODG fit overlay ⇒ DISCARD** as a qualified buyer (reasons in §6). *Grade B = signal strength, NOT fit or qualification.*
**Preparatory pricing (HYPOTHESES — ODG has no sales history, no observed conversion; buyer budget unknown):** per-engagement quote **€8,500** (CRA evidence pack €4,200 + AI-Act readiness €2,800 + independent re-verification €1,500). Annual scenarios toward a €60k CA target: prudent (6d@€600 ⇒ €3,600 billed, **net −€1,020**), central (8d@€750 ⇒ €6,000, net +€300), favorable (10d@€900 ⇒ €9,000, net +€1,950); days-to-€60k = 100 / 80 / 67 billable days. **Honest reading:** a single evidence-pack engagement is small and does not cover annual fixed costs; the target needs sustained billable capacity.
**Proof artifact:** the evidence runner (`odg-evidence-pack.js`) produces a signed, independently re-verifiable pack — demonstrated on the local `bmax-v21` repo (489 components, ed25519-signed, re-verify OK). **Delivery plan / acceptance / draft message / pre-sale conditions** are PREPARATORY only; **no message was sent** (contact counter = 0).

## 8. §4.D — Independent verification
Provider claims verified from origin sites (goregulus.com, sbomify.com), consultation date 2026-10-20 recorded. The LIC Housing URL was verified to exist (HTTP 200) but its body could not be independently parsed ⇒ flagged UNCONFIRMED (not treated as fact). The two WebFetch extractions each contained one spurious "Anthropic CLI" line (prompt-bleed from the fetch model) — **discarded**, not treated as page content. Explicit ladder honored: comparable provider / potential partner (hypothesis) / buyer candidate (none qualified) / confirmed demand (none) / qualified opportunity (none) / prepared proposal (preparatory) / contact sent (**0**) / contract signed (**0**).

## 9. Limits & blockers
1. **No demonstrated commercial demand** for ODG's O2/O3 offer; the space is crowded with funded incumbents. Commercial validation remains unproven.
2. Buyer budget/eligibility signals are not publicly extractable via bounded search; qualifying a buyer needs human/legal-entity steps (CTO-gated).
3. LIVE autonomy is not yet a statistically demonstrated SLO (one mission; no provenanced target).
4. Real sale/outreach, legal entity, pricing publication, spend — all remain **CTO/human-gated** (unchanged).

## 10. Mission metrics & learning
- Sources consulted: **4 WebSearches + 3 WebFetches** (= 7 egress calls, the only external calls); origin-verified: 2 provider sites fully, 1 PDF URL partially (body unparseable).
- Candidates detected: **3** (2 comparable providers + 1 buyer-signal). Qualified per criteria: **0**. Contacts sent: **0**. Contracts: **0**.
- Chain execution produced honest grade/provenance/score + a discard decision on real data (no fabricated demand).
- **Learning** (persisted here; classified `PERSISTED` by `learning-chain`): *"A bounded public search of the CRA/AI-Act market surfaces a crowded funded-vendor landscape + the regulatory need class, but no specific qualified EU buyer; the lone procurement signal is low-fit and qualification-gated — ODG's solo evidence-pack offer has no demonstrated unmet demand."* **NOT declared EFFECTIVE** (no measured before/after improvement).

## 11. Recommended next decisions (CTO)
1. **Repositioning over net-new discovery:** given incumbents, position ODG's *signed, independently re-verifiable* evidence-pack as a provenance **layer/partner** to existing CRA document-generators/consultancies (e.g. Regulus-class) rather than a standalone buyer offer. (Hypothesis — needs validation.)
2. To qualify ANY buyer, a human/legal step is required (entity, direct outreach) — a CTO Phase-3 go/no-go, still gated.
3. Optionally fix `AUDIT_*` mission synthesis to emit `mode: AUDIT` (contract/synthesizer layer) so genuine read-only audits become measurable without weakening the envelope design — a distinct, bounded future lot.

## Verdict: **PASS WITH BLOCKERS**
§1 and §2 implemented, bounded, dual-ported, dist-closed, and proven (full suite EXIT 0, tsc 0, parity, live front-door recording). The real Internet commercial test ran end-to-end on genuine public data and returned an **honest negative** on buyer qualification (zero qualified buyers; crowded incumbents) — a real result, not a failure. Blockers in §9 are external/authority dependencies.

**STOP.** No contact performed; no auto-chain to outreach, spend, or deployment.
