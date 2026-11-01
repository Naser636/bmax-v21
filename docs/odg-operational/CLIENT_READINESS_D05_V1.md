# Client-Readiness Dossier — D05: Quality Engineering & Independent Evaluation (V1)

**Wave 5, CTO Master Unified Mandate.** Date **2026-11-01**. **Exemplar dossier** establishing the reusable A–S structure for all eleven domains. **Honesty posture (binding):** internal/researched/implemented only — **R2 overall, R3 on independently-validated components; NO R4/R5; €0 clients; no fabricated testimonial/case-study/SLA/certification.** Grounds every claim in already-merged artifacts: `MARKET_DOSSIER_D05_V1.md`, `EXPERT_SYNTHESIS_D05_V1.md`, and the real `runtime/core/` modules (incl. Wave-4 G-01/G-02/G-03/G-07). ODG's D05 identity = **independent evaluation / evaluation-integrity / no-false-success** (NOT test automation).

## A. Professional identity & scope
An **evaluation-integrity service**: independently adjudicate whether evidence justifies a success claim — refuse false-green, refuse self-certification, report `NO_DATA` honestly. Scope IN: evaluation-integrity audits, independent-label/contamination checks, false-success-resistance testing, acceptance-criteria adjudication. Scope OUT (NON_GOAL): UI/e2e test-automation product, a managed QA team, issuing certifications.

## B. Target customer & buyer profile
(From D05 market dossier §3.) Regulated AI deployers (EU) needing defensible independent testing evidence; AI-native teams worried about contamination/self-judging; public-sector/assurance buyers valuing independence; QA/eval leads. Persona: an AI-assurance owner or SRE/QA lead who must *prove* a number. **No buyer verified (R-ladder: potentially-concerned ≠ qualified buyer).**

## C. Problems solved & measurable outcomes
"We can't trust our green CI"; "our LLM eval may be gaming itself (contamination/self-judging)"; "we need defensible, reproducible testing evidence (AI-Act Art.9(7)/43)". Measurable outcomes (on the client's own artifacts): false-green cases surfaced; self-authored-label admissions denied; leakage detected; a reproducible, provenance-sealed evidence pack. Outcomes are **evidence-graded, not certification**.

## D. Service catalogue & exclusions
1. **Evaluation-integrity audit** — run a client's test/eval suite through reality-gate + mechanical-acceptance to find false-green + unverifiable claims. 2. **Independent-label & contamination check** — independent-label-policy + DEV/HELDOUT leakage checks → ADMIT/DENY with reasons. 3. **False-success-resistance test** — the G-07 misleading-case corpus + scorer against the client's evaluator (headline: false-success rate, target 0). 4. **Executable-spec acceptance adjudication** — G-03 Gherkin→deny-by-default criteria. **Exclusions:** no UI/e2e automation build; no certification; no live-monitoring platform.

## E. Discovery, intake & diagnostic process
Client supplies (read-only, no-egress where possible): their test/eval artifacts, an optional declared schema/acceptance spec, and provenance descriptors for any ground-truth labels. Diagnostic: classify what is measurable vs `NO_DATA`; map coverage (Agile-Testing-Quadrants vocabulary, from the synthesis) to show which dimensions the suite exercises.

## F. Delivery methodology & technical architecture
The D05 synthesis operating model (evaluation-integrity harness), mapped to real modules: `independent-label-policy` (deny-by-default admission) → `broad-it-eval` (DEV/HELDOUT disjoint by id+content-sha256; `NO_DATA` until independent corpus) → `code-execution` (argv-only, bubblewrap-confined real compilers) → `mechanical-acceptance` (FACTS-not-claims, REJECT>BLOCKED>UNKNOWN>ACCEPT) → `reality-gate` (ladder; a check ≠ verified) → `k-eval`/`fairness-eval` (sealed synthetic corpus, +/−/misleading controls; NO_DATA/NOT_APPLICABLE). **Wave-4 additions wired in:** G-01 `characterization-baseline` (behavioral safety net before edits), G-02 `charter-record` (every verdict carries probe/method/ground-truth, sealed), G-03 `executable-spec-intake`, G-07 `misleading-case-corpus` (false-success resistance).

## G. Tools, automation & reusable capabilities
All listed modules are shipped + test-covered in `test:report` (253 suites, 0-stale). Reusable: the sealed synthetic corpora (k-eval, G-07), SARIF emission (sarif-report + G-04), provenance sealing (evidence-provenance). No external paid dependency.

## H. Quality controls & acceptance criteria
The service's OWN acceptance is mechanical: a deliverable is ACCEPTED only when its checks pass + evidence is provenance-bound (reality-gate + mechanical-acceptance applied to our own work). Headline integrity metric on an engagement: **false-success rate (target 0)** on the adversarial corpus; self-judgment refusal rate (target 100%); leakage-detection recall.

## I. Security, privacy & compliance controls
Local/sandboxed, no-egress analysis where the client provides artifacts; bubblewrap confinement of any untrusted code-execution; multi-tenant evidence isolation (where applicable). **No SOC 2 / ISO 27001 certification claimed** (mechanism ≠ certified) — a go-to-market gap, recorded.

## J. Deliverable templates & evidence standards
Every finding uses the `{id,area,severity,detail,remediation,evidence}` shape (SARIF-emittable). Every verdict ships a G-02 charter-record (what-probed/how/against-which-ground-truth, sealed) + a provenance stamp. Deliverable = an evidence-graded report with explicit `NO_DATA`/`INSUFFICIENT_EVIDENCE` where applicable; **no confident headline number without an independent corpus.**

## K. Customer communication & reporting procedures
Report states FACT vs INFERENCE, confidence, and the exact limits (e.g. "measures pipeline integrity on synthetic cases, not general capability"). Escalate `cannot verify` as a finding, never a pass.

## L. Maintenance, support & escalation procedures
Re-runs are deterministic (sealed corpora + hash-pinned); drift is detected by re-running + diffing. Escalation: any owner-gated dependency (independent eval dataset, OG-03) is surfaced with the exact human action.

## M. Pricing research & proposed commercial models
From the D05 market dossier §5: adjacent anchors LangSmith $39/seat/mo, Braintrust $249/mo, FR QA TJM ~€463–750/day. **ODG price = HYPOTHESIS only (no accepted quote, no buyer).** Two unvalidated models: usage/seat SaaS or evidence-per-engagement. Demand ≠ willingness-to-pay.

## N. Proposal & SOW templates
A fixed-scope SOW: inputs (client artifacts + schema/spec + label provenance), the four catalogue deliverables, explicit exclusions (no certification/automation-product), acceptance = the integrity metrics in §H, and the honesty disclaimers. Reuses `proposal-pipeline` stage discipline (prepared≠sent≠signed≠cashed). **Not sent to any buyer.**

## O. Technical documentation & handover
Handover = the evidence-graded report + the sealed charter-records + SARIF + a reproduction recipe (sealed corpus + versions). All modules documented in-repo.

## P. Website/service-page spec & SEO strategy
Spec only (no public deployment this phase): a service page describing evaluation-integrity, honestly leading with "we report NO_DATA rather than a fake green". SEO: target "independent AI evaluation", "false-success testing", "eval contamination check". **Not published.**

## Q. Demonstration & reproducible test scenarios
Reproducible demos (all in-repo, deterministic): the G-07 corpus + scorer (false-success resistance); k-eval before/after on a sealed synthetic corpus; a false-green trap (green CI + seeded defect → reality-gate refuses ACCEPTANCE). **Synthetic data only.**

## R. Risks, limitations & human responsibilities
`NO_DATA` headline is a hard commercial sell; no UI/e2e automation (can't serve that demand); internal-only, no SaaS/cert; broad-IT capability unmeasured until an independent corpus (OG-03, owner-gated). A human must bless any intended behavior change (characterization baselines pin behavior, not correctness). No false success is ever asserted.

## S. Readiness assessment & remaining gaps
**Overall R2 (implemented-internal).** Per component: evaluation-integrity harness (reality-gate/mechanical-acceptance/independent-label-policy/k-eval) — **R3** (independently validated by separate-context agents across the campaign + G-01/G-02/G-03/G-07 each independent-validator-ACCEPTed); market evidence — R1 (researched, primary-source confirmation pending per D05 dossier §C); client delivery — **R0–R1** (no authorized external case). **To reach R3 overall:** an independently-labelled broad-IT eval dataset (OG-03, owner-gated). **To reach R4/R5:** an authorized realistic external case + client-operational controls — NOT attempted this phase. **€0 clients; no R4+ claimed.**

---
*Reusable template note:* sections A–S above are the Wave-5 structure for all eleven domains. Each domain's dossier instantiates them from its own `MARKET_DOSSIER_D0x` + `EXPERT_SYNTHESIS_D0x` + real modules, at its own honest R-level. Remaining: D01,D02,D03,D04,D06,D07,D08,D09,D10,D11. No domain advances to R4/R5 without the evidence R4/R5 require.
