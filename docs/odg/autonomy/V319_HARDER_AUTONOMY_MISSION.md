# V319 P0 — harder native-autonomy battery (inside certified C6)

**Verdict: PASS for the targeted capabilities (multi-module localization, stack-trace diagnosis, novel synthesis), with
an honestly-measured accept-rate of 0.667 on a harder 6-case corpus and fail-closed abstains.** ODG's own path authored
every accepted fix (generator `qwen2.5-coder:7b`); a **distinct** model (`qwen2.5-coder:3b`) independently reviewed; the
deterministic `node --test` was the primary gate; exact rollback proven. Claude Code wrote only the harness + buggy
fixtures + acceptance tests — never a fix. C6 re-verified 8/8 before the run.

## Results (6-case corpus)
| Case | mode | status | generalises (adversarial) | distinct-3b eval |
|---|---|---|---|---|
| multimodule | 2-file | **ACCEPTED** — edited the **correct helper** `src/util.js` (`(part/whole)*100`), main's contract preserved | ✅ | CORRECT |
| stacktrace | diagnose-from-failure | **ACCEPTED** — from the failing test output → `reduce((s,x)=>s+(x.value||0),0)` | ✅ | CORRECT |
| group-by | single | **ACCEPTED** | ✅ | CORRECT |
| roman-to-int | single | **ACCEPTED** — subtractive value-map | ✅ | CORRECT |
| parse-duration | single | **ABSTAINED** — fail-closed, exact rollback | — | — |
| balanced-parens | single | **ABSTAINED** — fail-closed, exact rollback | — | — |

- **acceptRate = 0.667** (4/6); **acceptedGeneralised = 4/4**; **rejected = 0**; **2 honest abstains** (7b could not pass acceptance ⇒ rolled back, no false success).
- **Multi-module:** `multimoduleEditedCorrectFile = true` — the model read both files and localized the bug to the helper, not `main.js`.
- **Stack-trace diagnosis:** the failing `node --test` output was fed into the instruction; the model diagnosed + fixed.
- **Independent distinct model (3b):** agreed CORRECT on all 4 accepted fixes — a second model as evaluator, genuinely distinct from the 7b generator.
- **Exact rollback:** a deterministically wrong edit ⇒ ABSTAINED with byte-identical workspace; all non-accepted cases `restoredExactly = true`.

## Separation (V319 §3) — real
- **Generator:** `qwen2.5-coder:7b` (local).
- **Independent evaluators:** deterministic `node --test` (primary gate, not a model) + adversarial edge re-tests + the **distinct** `qwen2.5-coder:3b` model.
- **ODG validator:** `evaluator-independence.auditIndependence` → **WEAK-not-COMPROMISED** (zero critical shared deps: 7b≠3b model, different data/evaluator/evidence; WEAK only = shared sandbox environment).
- **No Claude-Code execution in the ODG cycle.**

## Honest boundary
This measures a HARDER battery than V318: multi-module localization and stack-trace diagnosis both **succeed**, and the
accept-rate on genuinely novel, harder defects is **0.667** with the 7b model — the 2 abstains (parse-duration,
balanced-parens) are honest fail-closed outcomes, not hidden. Reliability is model- and difficulty-dependent; this is a
narrow battery, not a general-purpose guarantee.

## Progression
V317 bounded-deterministic → V318 narrow novel synthesis → **V319 multi-module + stack-trace diagnosis with a measured
accept/abstain curve and a second distinct evaluator model.** Next: widen to cross-repo / multi-step planning tasks,
larger sealed corpus for a stable accept-rate confidence interval, and failure-mode taxonomy of the abstains.

Evidence: `docs/odg/autonomy/V319_HARDER_AUTONOMY_EVIDENCE.json`. No canonical/production change; no secrets.
