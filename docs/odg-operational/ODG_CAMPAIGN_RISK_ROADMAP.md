# ODG Three-Domain Campaign — Autonomy, Risks, Learnings, Blockers & Roadmap

**As of:** 2026-10-25 · Companion to the capability matrix, architecture, offers and benchmark register.

---

## 1. Autonomy matrix (per domain × action type) — §10

| Action type | A (agents) | B (eval/gov) | C (reconciliation) |
|-------------|-----------|--------------|--------------------|
| Read/inspect code | autonomous+verified | autonomous+verified | autonomous+verified |
| Build pure/deterministic module | autonomous+verified | autonomous+verified | autonomous+verified |
| Run tests / demonstrator | autonomous+verified | autonomous+verified | autonomous+verified |
| Independent verification of result | autonomous+verified | autonomous+verified | autonomous+verified |
| Public web research | autonomous+verified (this session) | autonomous+verified | autonomous+verified |
| Modify governed `runtime/core` | needs human/ODG authority | needs human/ODG authority | needs human/ODG authority |
| Commit/push | needs authorization (clean+tested+verified) | same | same |
| Paid OCR/LLM/provider call | BLOCKED (no authorization) | BLOCKED | BLOCKED |
| Contact a buyer / send outreach | BLOCKED (human/CTO) | BLOCKED | BLOCKED |
| Create legal entity / sign / insure | BLOCKED (human/CTO) | BLOCKED | BLOCKED |
| Deploy / public exposure | BLOCKED (human/CTO) | BLOCKED | BLOCKED |

**Rule preserved:** high-risk/legal/financial/irreversible actions are never self-authorized, regardless of
autonomy level. 100% autonomy ≠ self-granting consequential actions.

## 2. Risk register

| ID | Risk | Domain | Likelihood | Impact | Mitigation |
|----|------|--------|-----------|--------|------------|
| R1 | Over-claim extraction (OCR/LLM) works | C | — | high (credibility) | interface+stub only; explicit "NOT implemented" everywhere |
| R2 | A/B demos mistaken for client products | A/B | med | med | labelled INTERNAL DEMONSTRATOR; not priced; GATE 5 bar stated |
| R3 | ELv2 code copied into a hosted offer | B | low | high (licence) | benchmark register red line; reimplement against MIT |
| R4 | No real buyers → revenue stays €0 | all | high | high | buyer-research framework ready; next action = sourced pass |
| R5 | Shared-core edit breaks a domain | all | med | med | `integration-test.mjs` non-regression gate (6/6) |
| R6 | Superiority claim without benchmark | all | med | med | no parity claim; §5 of benchmark register lists what must be proven |
| R7 | Promoting demo code into `runtime/core` trips TS/migration gates | A/B | med | med | kept as separate authorized lot; not done unilaterally |

## 3. Learnings captured

- **Inventory before build** (reuse-first): the real `runtime/core` already implements 9/12 (A) and 11/13 (B) of
  the capabilities — most "new" work would have been duplication. Only 2 genuine gaps existed.
- **Report filenames ≠ existence**: verified every capability by reading real code via parallel read-only agents.
- **Cross-domain reuse is cheap and real**: a Domain-B metric (`confusionMatrix`) dropped straight into the
  Domain-C verifier and the Domain-A/B demos — one implementation, three consumers.
- **No-false-success generalises**: the same fact-based-verdict pattern gates all three demonstrators (C pipeline,
  A orchestration PARTIAL-not-SUCCESS, B threshold gate).

## 4. Blockers (precise, with the decision needed)

| Blocker | Needs | Owner |
|---------|-------|-------|
| Unstructured extraction (C) | explicit paid authorization to buy/call an OCR/LLM provider + build+verify | CTO |
| Real buyer pipeline (all) | authorization to run a sourced web pass and later to CONTACT | CTO |
| Billing/DPA/insurance (all) | legal entity decision + professional advice (see FR checklist) | CTO/counsel |
| Promote `dep-planner`/`eval-metrics` into `runtime/core` | ODG contract authorization for a governed TS-port lot | ODG/CTO |
| Commit/push this campaign's work | authorization (work is in-scope, tested, verified, tree otherwise clean) | CTO |

## 5. Remaining-work roadmap (dependency-ordered)

| # | Work item | Domain | Deps | Gate reached |
|---|-----------|--------|------|--------------|
| W1 | Confusion-matrix + calibration metric | B | — | GATE 4 ✅ (done) |
| W2 | Topological work-item scheduler | A | — | GATE 4 ✅ (done) |
| W3 | Reconciliation product + demonstrator | C | W1 | GATE 5 ✅ (done) |
| W4 | A & B internal demonstrators | A/B | W1,W2 | GATE 5 (internal) ✅ (done) |
| W5 | Executed regression comparator (green→red) | B | improvement-baseline.ts | GATE 1 (specified) |
| W6 | Auto lesson→regression-test generation | B | patch-memory.ts | GATE 1 (specified) |
| W7 | OpenTelemetry/OpenInference trace export | A/B | — | GATE 1 (decided, not built) |
| W8 | Promote dep-planner/eval-metrics → runtime/core (TS) | shared | authorization | BLOCKED (auth) |
| W9 | Unstructured extraction (OCR/LLM) real impl | C | paid auth | BLOCKED (auth) |
| W10 | Client-ready A/B product packaging + pricing | A/B | W4 | GATE 7 pending |
| W11 | Sourced private-buyer pass → qualification | all | web (available) + CTO | not started |
| W12 | Comparable-task benchmark vs named tools | all | W3,W4 | not started |

## 6. GATE status snapshot (§8)

| | A | B | C |
|-|---|---|---|
| G1 need/scope | ✅ | ✅ | ✅ |
| G2 feasibility | ✅ | ✅ | ✅ |
| G3 build (bounded) | ✅ | ✅ | ✅ |
| G4 independent verification | ✅ | ✅ | ✅ |
| G5 demonstrator (documented env) | ✅ internal | ✅ internal | ✅ client-relevant |
| G6 acceptance (no regression) | ✅ (integration 6/6) | ✅ | ✅ |
| G7 commercial readiness | partial (not priced) | partial (not priced) | ✅ (dossier complete) |
| G8 closure/learning | ✅ (compass+artifacts) | ✅ | ✅ |
