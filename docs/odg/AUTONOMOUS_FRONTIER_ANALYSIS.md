# ODG — Autonomous Admissible-Work Frontier Analysis (2026-10-30)

Produced per the CTO mandate §6 ("Si la frontière des travaux autonomes admissibles est réellement
atteinte, établir une analyse documentée"). Truth Lock at authoring: `main @ 24098bd` == origin/main,
div 0/0, clean; 4 branches / 1 worktree / 5 stashes preserved; register 77 ACCEPTED / 7 BLOCKED /
1 IN_PROGRESS / 2 DEFERRED, 0 stale. This is a resumable frontier, NOT a campaign closure.

## 1. Verified completed work (this continuous session — 7 lots, each independently audited)
| PR | Lot | Verdict path | Evidence |
|----|-----|--------------|----------|
| 239 | §8 seo-crawl-directives (robots.txt + sitemap.xml, Google-spec precedence) | REJECT→2 HIGH fixed→re-verify | tsc0/build0/206 |
| 240 | §8 seo-crawl-consistency (robots×sitemap×signals, GSC conflicts) | REJECT→2H+2L fixed | 207 |
| 241 | §8 seo-hreflang-reciprocity (multi-page bidirectional) | REJECT→1H+1M+min fixed | 208 |
| 242 | §8 seo-structured-data-validator (JSON-LD required props; closes KNOWN_GAP) | REJECT→1H+3 fixed | 209 |
| 243 | **capability-executors: close fail-OPEN in implementViaLocalProvider verification (NO_VERIFIER)** | ACCEPT (reproduced) | 210 |
| 244 | **CI hardening: gate 11 governance/safety tests + hazard-classifier allowlist** | verify 11/12→1 CI-corrected | 221 |
| 245 | **nl-objective-gateway: close weak-negator fail-OPEN (adverbial no/without/sans/sauf)** | ACCEPT core; a 2nd over-reach fix REJECTED→reverted | 222 |

2 safety/governance improvements beyond the SEO workstream (a fail-OPEN on the LLM code-apply path; a
governance-classifier under-classification fail-OPEN), plus CI now enforces 11 governance invariants
that previously guarded nothing. The verification layer demonstrably caught two real errors before merge
(a CI env-divergence on #244; a self-introduced over-reach on #245).

## 2. Remaining defects (REAL, but NOT safely auto-fixable by a deterministic heuristic)
All in `runtime/core/nl-objective-gateway.ts`, surfaced by the independent audit of PR #245:

- **F1/F6 — strong-negator SCOPE across an interjection (HIGHEST remaining value, but owner-gated by policy).**
  - UNDER-classification (dangerous) example: `we have not backed up so delete the production database` ⇒ NONE.
  - OVER-classification (safe, but violates the prohibition⇒NONE design locked by tests 27/28) example:
    `do not, under any circumstances, delete the production database` ⇒ DESTRUCTIVE (pre-existing; commas were
    always clause boundaries).
  - WHY NOT AUTO-FIXED: these share the exact syntactic shape of a genuine run-on instruction
    (`do not worry, delete the cache` — a REAL delete). Any flat boundary/window heuristic that fixes one
    direction creates the other (PROVEN: PR #245's reverted Change-1 added so/because/please boundaries,
    fixed the under-classification, and CREATED new over-classifications). Correctly resolving it is a
    GOVERNANCE-POLICY tradeoff (over-escalate prohibitions vs. under-classify run-ons) or needs a semantic
    (LLM) classifier — the deterministic requirement + §4 ("ne pas modifier les règles de gouvernance pour
    faciliter l'exécution") put the DECISION with the owner, not the autonomous loop.
- **F2 — bare `pas` FR-negation token collided with EN text** (`the PAS system should delete …` ⇒ NONE) — **FIXED
  this cycle** (dropped bare `pas`; `ne` retained catches genuine `ne … pas`; independent audit ACCEPT, suite 236).
  Residual `ne` collision (standalone "NE" region abbreviation) is far rarer and left as a minor note.
- **F3 — Arabic `لا` negation reaches across the unrecognised Arabic connector `لكن`** (`لا تحذف لكن delete …`).
  Needs an Arabic clause-boundary model. Low frequency.
- **F4 — O(n²) in `signalPresentUnnegated`/`isNegatedBefore`** when every signal occurrence is adjacently
  negated (pathological ~200KB input ⇒ ~19s). The gateway is an INTERNAL NL parser (not a public endpoint),
  so blast radius is low; the clean fix (precompute clause-boundary offsets + binary-search per signal, O(n log n))
  is a behavior-preserving refactor of a just-audited safety function — deferred to avoid risking the safety
  logic for a low-likelihood availability issue. A length-cap fail-closed guard is a possible minimal mitigation.

## 3. External blockers (unchanged — 7 BLOCKED register lots, each with a resumeTest)
broad-it-independent-eval-set (third-party labelled eval data) · campaign-runner-systemd-activation (sudo/systemd) ·
dashboard-tls-exposure (owner exposure decision + cert) · new-language-families (hadolint 3rd-party binary + sudo) ·
structured-roadmap-deps (amend PROTECTED ROADMAP.json) · p01-demand-validation (lawful consented outreach) ·
p01-billing-sandbox (real sandbox provider account). IN_PROGRESS broad-it-corpus-grow is blocked in practice on
hadolint + the independent eval set.

## 4. Human/owner dependencies (the real chokepoints)
1. **Negation-scope policy decision** (F1/F6): choose the deterministic resolution of the ambiguous
   strong-negator-across-aside case (prefer over-escalation? capture-as-constraint-and-NONE? require a
   semantic classifier?), OR authorize an LLM-backed classifier. This is the single highest-value unblock.
2. Clear any one external blocker in §3 (each has a documented resumeTest in the register).
3. engineering-executor slice-2 authorization (a live-modification executor — deny-by-default; owner-gated).

## 5. Marginal items considered and dismissed (NOT inflated into lots)
- `prefer-dist-bin.ts` zero-coverage (trivial pure selector; low defect probability).
- `patch-proposal-apply.ts` "zero coverage" — actually covered by `src/tests/propose-apply-boundary.test.ts`
  (now gated via PR #244).
- `bash-command-governor.ts` `~username` tilde nit — not a live bypass (argv-only spawn, no shell).
- Further §8 SEO modules — the workstream (7 modules) is comprehensive; more would be diminishing returns.

## 6. Next genuinely useful work (in priority order)
1. **F4 availability hardening** — the remaining clearly-SAFE deterministic self-clearable fix (length-cap
   fail-closed guard OR the O(n log n) boundary-offset refactor, with a before/after classification-equivalence
   battery + perf test + independent audit). Low value (internal parser, pathological input only) but real.
2. Then the frontier is owner-gated: the negation-scope policy (F1/F6) and the external blockers (§3) are
   the substantive remaining roadmap advancement, and they require human/owner action by design.
   (F2 FR-`pas` collision — DONE this cycle.)

## 7. Honest status
The continuous loop ran end-to-end with verified quality and real failure recovery; it is NOT closed by this
analysis. The SAFE, high-value, deterministic self-clearable frontier in the governance/execution core is
reached: what remains is either owner-policy/external-blocked, or marginal (F4/F2). No lot or success has
been fabricated. Resume any time with:
`git checkout main && git pull --ff-only && npx tsx runtime/bin/odg-resume.ts docs/odg/closure-register.json`.
