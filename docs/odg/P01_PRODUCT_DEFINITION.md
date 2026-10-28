# P-01 — Product Definition (canonical) · Code Health Check

> **Status honesty.** This defines **P-01**, built strictly from capabilities ODG has **live-verified** this program.
> It is a **working deliverable engine, NOT a production/commercial product**: go-to-market parts (onboarding, client
> isolation, billing, hosting, support) are `NOT_IMPLEMENTED`, and **demand is `DEMAND_NOT_VALIDATED`**. Every promise
> below is linked to a capability, its evidence, its limits, and the closure mission required if not yet verified.
> No promise exceeds a proven capability. Single source of truth: `main`. Collected cash €0; €500k target unachieved.
> Companion docs (not duplicated here): `docs/odg-operational/ODG_PRODUCT_READINESS.md`,
> `PRODUCTION_READINESS_GAPS_V1.md`, `PRODUCTIZED_UNIT_ECONOMICS_V1.md`; register `docs/odg/V46_MASTER_COMPLETION_REGISTER.md` (P-01, C3).

## 1. Identity & value proposition
**Code Health Check** — fast, objective, **evidence-backed** syntax/type verification of JS/TS/Python files or a TS
project, returning a reproducible per-file PASS/FAIL report with the real tool used and honest limits. Value: an
objective, reproducible pre-merge/CI gate with proof — vs an opinion or an opaque pass.

## 2. Problems solved / users
Broken or non-compiling code reaching review/CI; teams wanting a reproducible pass/fail **with evidence**. Users:
small-to-mid dev teams using JS/TS/Python that run CI. (Problem evidence: Zhang FSE'19 — compiler errors in 11% of
broken CI builds across 75% of projects; adoption: SO Dev Survey 2024. See C3 dossier — provenance + limits.)

## 3. Architecture & components (all present in `main`)
`code-health-service.ts` (offer + `runHealthCheck` files, `runProjectHealthCheck` TS project) → `code-execution.ts`
(real `node --check`/`tsc --noEmit`/`py_compile`, isolated mkdtemp, argv-array, timeout, no-net, no-secret) +
`ts-project-check.ts` (import-aware `tsc -p`). Repair families (edit/test-gen/missing-export/broken-require/json/
unused-import) via `repair-workflow.ts`; confined local generative repair via `ollama-provider` + `generative-repair-adapter`.

## 4. Capabilities — classified by proof level
- **Operationally live-verified:** JS/TS/Python syntax/type **check** (real toolchain); import-aware **TS project check**;
  6 deterministic **repair families**; confined **local-Ollama generative repair** (narrow). Evidence: suites +
  live runs recorded in the register (C-01/C-03/C-05/C-07/C-10/C-12/C-14/C-15/C-16/C-04) and `ODG_PROJECT_STATE.md`.
- **Integrated + gated:** Reality-Gate, objective-fidelity VE hard-gate, coding-mission resolver + loader hook.

## 5. Partial / unavailable
- Go/Rust/Java/SQL/web checks — **UNSUPPORTED** (toolchains absent; declared, never faked).
- Arbitrary code **synthesis** — only confined local-Ollama repair (narrow); no broad synthesis.
- Full autonomous mission auto-dispatch — gated (owner one-shot allowlist; decision pack READY).

## 6. Limits / preconditions / dependencies / authorizations
Inputs must be self-contained files OR a TS project with a tsconfig (single-file TS with imports is unsound → project
mode required). A **check is not an audit/certification/guarantee**. BLOCKED/timeout/absent-tool/invalid-config **never**
become PASS. No network, no secrets, €0. Local `node`/`python3`/`typescript` toolchain required (present here).

## 7. User / client journey
offer presentation (OFFER record) → input validation → **mission execution (real check)** → evidence report →
limits disclosure. IMPLEMENTED: offer/validate/execute/deliverable/evidence. NOT_IMPLEMENTED (owner-gated): onboarding,
client isolation, hosting, billing, support/escalation, delivery confirmation.

## 8. Deliverables & acceptance criteria
Deliverable: a Code Health Report (per-file PASS/FAIL/UNSUPPORTED/BLOCKED + real tool + counts + `healthy` + limits +
no-retention note). Acceptance: 0 false PASS on broken inputs; every PASS reproducible by the named tool; UNSUPPORTED/
limits explicit. (Met in tests + live runs.)

## 9. Security / privacy / observability / support
Isolated workspace, argv-array (no shell), timeout + output cap, minimal env (no secrets), no network, temp cleanup,
no content retention. Observability: structured per-file results. Support/SLA: NOT_IMPLEMENTED (owner-gated).

## 10. Onboarding / hosting / billing / delivery
All **NOT_IMPLEMENTED** and owner-gated. Billing to be tested in a sandbox only before any real use. No public exposure.

## 11. Cost / price / margin (hypotheses vs data)
HYPOTHESIS ONLY (unvalidated): a low per-run/per-seat price. Direct infra cost ≈ €0 (local toolchain). **No price
committed, no margin measured, no revenue.** Strong **free DIY** alternative (`tsc`/`node --check` in CI) disclosed.
Separate assumptions from data (`PRODUCTIZED_UNIT_ECONOMICS_V1.md`).

## 12. Demand-validation evidence needed
≥5 **verified** willingness-to-pay / transactional signals (pre-registered threshold, C3 dossier). Current: **0** ⇒
`DEMAND_NOT_VALIDATED`. Documentary research ≠ demand. Next test is owner-gated (lawful outreach/landing), not executed.

## 13. First priority offer & commercial-readiness criteria
Priority offer = this Code Health Check (CI/pre-merge verification + evidence report). Commercial-readiness criteria
(open): onboarding + client isolation + billing (sandbox-tested) + hosting + support + a validated-demand signal.

## 14. Gap backlog → closure missions (traceable)
- P-GAP-1 onboarding/client-isolation — needs design + impl (owner-gated infra). ACCEPT = isolated multi-input run + access controls tested.
- P-GAP-2 billing (sandbox) — test-env integration; no prod/charges. ACCEPT = sandbox invoice→payment→reconcile, idempotent.
- P-GAP-3 hosting/exposure — owner-gated (public VPS = reserved human gate). ACCEPT = authorized deploy + observed runtime.
- P-GAP-4 demand validation — owner-gated outreach experiment; ACCEPT = ≥5 verified WTP signals vs threshold.
- P-GAP-5 broaden checks to more stacks — BLOCKED on toolchains; ACCEPT = executable check + independent eval per added stack.
All go-to-market gaps are owner-gated; internal engineering gaps (tests/contracts/eval) are dependency-ready and tracked in the register.
