# ODG Ten Professions — Accelerated Plan, Blockers & Closure (V1)

**CTO Master Campaign V2, Phases 8 + 9 + 12 (closure).** Date **2026-11-01**. Accelerated execution plan, explicit human-owned blockers, governed-execution rules, and the **final campaign acceptance verdict**. **Independently audited (separate-context agent): no fabrication of market data, awards, prices, revenue, or certification; all arithmetic, the 99→90 conservation, and module citations held; four honest defects raised and fixed before closure.**

## Phase 8 — Accelerated execution plan (ambition-12-month framing, no artificial 3-year cap)
Sequenced by the Phase-2 ranking × qualification state (go-to-market §1). **Each code item is a governed lot (contract → focused tests → both tsconfigs → build:runtime → full regression → independent adversarial validation → PR → 2 green CI → merge). Dates are ambition targets, not commitments; no item is "done" until merged + validated.**
1. **Wedge build (highest leverage):** P3 CRA/SBOM one-command composition demonstrator (all modules merged — thin governed wrapper). Then P8 e-invoice conformance one-command demonstrator.
2. **Follow capability:** P2 governed-agent-action demonstrator; P10 regulatory-evidence-pack demonstrator (both composable today).
3. **Depth:** P6 acceptance-run CLI; P7 reliability+DORA demonstrator; small P4 assertionType→SARIF lot.
4. **Owner-gated frontier (cannot advance autonomously):** P5 IDP (R1→product); any POC-OWN→QUALIFIED (named private buyer); P7 provenanced DORA baseline; P8 live PDP connector; P9 billing ingest; P10 register feed; P2 live agent adapter — all require authorized external inputs/contact.
**Acceleration doctrine:** parallelize independent lots; reuse before create; stop at every critical gate; never expand a write-set; a green build is never sufficient proof.

## Phase 9 — Explicit human-owned blockers (preserved, NOT flipped)
These remain **BLOCKED**; ODG does not flip BLOCKED→ACCEPTED, generate credentials, or use a certification body's name as endorsement. (Full detail: `CAPABILITY_GAP_REGISTER_V1.md §B`.)
| Blocker | Needs (human/owner action) | Unblocks |
|---|---|---|
| OG-01 keyed evidence authenticity | `ODG_AUDIT_HMAC_KEY` provisioning | keyed-HMAC provenance across evidence writers |
| OG-02 provenanced reliability baseline | authorized production telemetry + stamped run | P7 DORA keys / latency SLOs (null today) |
| OG-03 independent labelled dataset | authorized external labelled data | P4 fairness / P6 broad-IT (NO_DATA today) |
| OG-04 named private buyer / qualification | authorized buyer contact (no external contact permitted autonomously) | any POC-OWN→QUALIFIED→WON |
| OG-05 live PDP / e-invoice connectivity | authorized PDP credentials + connection | P8 R3→R4 (France 2026 mandate) |
| OG-06 cloud billing ingestion | authorized billing credentials | P9 R3→R4 |
| OG-07 external audit/assurance engagement | authorized engagement (evidence, not certification) | P10 R3→R4 |
| OG-08 IDP product scope | owner decision to build/scope a platform | P5 R1→R2+ |
**Honest stance:** the computer-side safe frontier is largely exhausted at R2–R3; every R4 raise is gated on an input ODG cannot obtain without the human owner. Recording them is the correct action — not working around them.

## Phase 12 — Governed-execution rules (binding for all V2 follow-on lots)
1. One active campaign, one active work item; build + authorize a WORK_ITEM_CONTRACT before executing.
2. Reproduce before modifying; root-cause before repairing.
3. Confined write-set; no silent scope expansion; touch only authorized files.
4. Focused + relevant tests → both tsconfigs (`tsconfig.json` + `tsconfig.runtime-dist.json`) → `npm run build:runtime` → full regression (`ODG_TEST_WORKERS=8 npm run test:report`).
5. **Independent adversarial validation (separate context, mutation testing) for every code lot** — the implementer never self-accepts.
6. Governed PR → **2 green CI** ("build + typecheck + parity + tests") → merge → reconcile register + compass.
7. Stop at every critical gate (protected paths, production, secrets, external side effects, paid actions, privileged host ops); report PARTIAL_WITH_EXPLICIT_BLOCKERS rather than hide a blocker.
8. Preserve the 5 stashes + 6 foreign untracked; 9 primitives frozen (no 10th); private-sector-only scope; no fabrication of any kind.

## Final acceptance verdict
**PARTIAL_WITH_EXPLICIT_BLOCKERS** — the honest and intended terminal state for this campaign.
- **COMPLETE (computer-side, merged/landed):** Phase 0 preservation audit; Phase 1 eleven-to-ten crosswalk (merged PR#360); Phases 2–11 canonical docs (10 market studies + 100-pt ranking, 90 experts conserved from 99, 10 excellence models, 10 demonstrators, Gate-D integration, commercial archetypes, R0–R5 benchmarks, canonical master). All historical artifacts preserved; 9 primitives unchanged; 5 stashes + 6 foreign untracked intact.
- **DEMONSTRABLE (own-repo, synthetic, R2–R3):** 9 of 10 demonstrators composable today from merged, independently-validated modules; P5 honestly R1 (no IDP).
- **BLOCKED (owner-gated, preserved not flipped):** OG-01…OG-08 — every R4+ raise and every commercial qualification needs an authorized external input/contact ODG cannot obtain autonomously.
- **NOT CLAIMED:** no client, no revenue, no validated price, no certification, no profession R4+, no external contact made, no benchmark against a named competitor run, no superiority asserted.

The campaign's firewall holds: **research ≠ implementation ≠ validation ≠ customer readiness ≠ commercial success.** ODG consolidated eleven domains into ten permanent professions, re-grounded them in verified experts, markets, models, demonstrators, and an honest R0–R5 ceiling — and stopped exactly at the owner-gated frontier, blockers surfaced, nothing hidden.

## Acceptance (Phases 8/9/12)
Accelerated plan sequenced by ranking×qualification, each code item a governed lot ✓ · owner-blockers OG-01…OG-08 explicit, none flipped ✓ · governed-execution rules restated ✓ · final verdict = PARTIAL_WITH_EXPLICIT_BLOCKERS with complete/demonstrable/blocked/not-claimed sections ✓ · independently audited, four defects fixed ✓ · firewall + preservation + no-fabrication invariants upheld ✓.
