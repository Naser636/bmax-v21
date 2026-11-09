# V12.4 — V27: Work Provenance (§2) + Complexity-Aware Repair Routing (§3) — 2026-11-09

The priority chantier (§2) is answered honestly with code evidence; §3 delivers a measured routing capability. §4/§5
(parse corpus, repair-knowledge) are prepared for V28 rather than done shallowly (§7: not five independent audits).

## B/C. §2 — Provenance of the work (honest, evidence-based)
**Audit of the real execution path (code, not docs):**
- **No automatic delegation to an external AI provider exists in ODG's runtime.** `capability-executors.ts` runs the
  LOCAL model/provider only ("No external/billable provider is ever [invoked]") via `local-model-manager` + a bwrap-
  isolated local generator. The `api.anthropic.com` / `ANTHROPIC_API_KEY` references are a **connectivity PROBE**
  (detection of external reachability), NOT an invocation — there is no code path that sends a mission to Claude Code /
  Anthropic to generate or apply code.
- **ODG's native engineering = the local-model repair loop** (repair-retry + model-router over the loopback Ollama 3B/7B),
  demonstrated measured in V26 and extended in §3 here.
- **Honest statement about THIS SESSION (V23–V27 framework modules):** the NEW framework code (metier-parcours,
  promotion-assurance, the V25 benchmarks, repair-retry, repair-router, this guard) was **authored by the technical
  provider (Claude Code)**, applied through the canonical PR chain. The Git author ("ODG Runtime") alone is NOT evidence
  of native authorship — and the provenance mechanism agrees: `actor-provenance` would classify provider-authored work as
  **TECHNICAL_PROVIDER, never ODG**. ODG's *governance* (selection, write-set, independent verification, closure) and its
  *native repair capability* (local models generating fix content under the loop) are real; the framework *authoring* this
  session was provider-done. Stated plainly, not hidden.

### §2B/D — Verifiable provenance + the autonomy-claim guard (built)
`actor-provenance.ts` already resolves a mission's EXECUTION-EVIDENCE to one honest actor (ODG | TECHNICAL_PROVIDER |
HUMAN | null), refusing ODG attribution without a CONCORDANT author+executor. V27 adds `autonomy-claim-guard.ts` (PURE,
gate suite) that code-enforces the §2D rule: a mission is **NATIVE_AUTONOMOUS only if the evidence-attributed actor is
ODG**; provider-authored ⇒ downgraded to PROVIDER_ASSISTED; absent ⇒ UNATTRIBUTED; a claim is never upgraded.
**Falsifications caught (tests):** provider-work claimed native ⇒ REFUSED+downgraded; no-confident-actor claimed native ⇒
REFUSED; a report whose execution evidence resolves to non-ODG cannot be declared native (Git author irrelevant).
**Result: ODG has a verifiable, falsification-tested control that a delegated realization can never be declared native
autonomy.** No ungated external auto-delegation existed to remove (§2C) — the fix is the claim-guard that prevents
over-stating whoever did the work.

## E. §3 — Complexity-aware repair routing (measured)
`repair-router.ts` composes `model-router` (benchmark-grounded 3B/7B) + `repair-retry` (governed feedback loop) and adds
the V26 escalation: `assessComplexity` reads technical signals (recursion / control depth / edge-case / size) → a SIMPLE
defect starts on 3B, a COMPLEX one on 7B upfront; a FAILED cheaper attempt ESCALATES to 7B. The INDEPENDENT verifier is
the sole acceptance arbiter; 7B is not chosen systematically (cost/benefit measured).
**Measured (deterministic corpus, 2 simple + 2 recursive defects):**
```
3B single-shot: 2/4   3B + retry: 2/4   7B + retry: 4/4   auto-route: 4/4 (COMPLEX routed to 7B upfront, 0 wasted 3B attempt)
```
Plus a dedicated escalation case: a SIMPLE-classified defect the 3B seam cannot fix ⇒ **escalates to 7B and is accepted**
(the V26 discovered need, now automatic). **Live corroboration (V26):** 3B failed recursion single-shot AND with retry;
7B fixed it attempt-1 — the same escalation the router now automates. 0 false successes throughout (independent arbiter).

## F/G. §4/§5 — prepared for V28 (not done shallowly)
- §4 advanced parse/semantic corpus: the parse-edge class both models missed in V26 is a real gap — V28 builds a
  substantial reference corpus + diagnoses the category + the capability (e.g. a test-driven prompt carrying the failing
  edge case). §5 repair-knowledge → reuse-ledger: record (defect-signature → fix, verification, model) into the EXISTING
  reuse-ledger (no parallel registry) and measure whether a recurring defect is solved from memory, with falsifications.

## H. Independent assurance & falsifications
§2 guard: provider/absent work refused native (3 falsifications). §3 router: the independent verifier is the arbiter; a
fix is never accepted on the generator's claim; escalation measured. Gate 411/411, tsc clean, CI.

## I. Integration & VPS
`autonomy-claim-guard.ts`, `repair-router.ts` + tests integrated canonically (gate 411/411). The V26 live-model runs
executed on the VPS loopback Ollama; VPS posture unchanged (only SSH:22 public, edg-core loopback). No service deployed.

## J. Still-missing capabilities
- Native FRAMEWORK authoring by ODG's local models (vs the provider) is not yet demonstrated — the local models are
  proven for bounded REPAIR, not for authoring multi-file framework modules; that is an honest capability frontier.
- parse-edge semantic class unsolved by both local models (V28 target).

## K/L. Boussole + V28
Register reconciled (new item `serie30-v27-provenance-routing`). Gate 411/411. HEAD=origin/main=`059dcd7`. §12
restrictions intact. **V28 prepared:** (1) advanced parse/semantic defect corpus + the missing capability; (2) repair-
knowledge capture into the reuse-ledger (measured memory reuse); (3) native-authoring frontier probe (can the local model
author a small multi-file capability under the governed loop?) — honest measurement of where ODG's native authoring stands.
