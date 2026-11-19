# V320 — multi-module e2e autonomy with router-driven model selection (inside certified C6)

**Verdict: PASS for the measured scope.** ODG's own engine resolved **multi-module / cross-file** defects inside the
certified C6 sandbox, with the §11.6 `odg-model-router` **driving model selection by difficulty** and **honestly
escalating** when no local model covered the task. Claude Code wrote only the harness + buggy fixtures + acceptance
tests — never a fix. C6 re-verified 8/8 before the run.

## Router-driven routing (the §11.6 capability, now LIVE)
| case | difficulty | router decision | model | outcome |
|---|---|---|---|---|
| mm-add (2 files; bug in helper `util.js`) | easy | LOCAL | **qwen2.5-coder:3b** | ACCEPTED — edited `util.js` → `a+b` |
| cross-config (2 files; bug in `config.js` MAX) | moderate | LOCAL | **qwen2.5-coder:7b** | ACCEPTED — edited `config.js` → `MAX=10` |
| mm-tax (2 files; bug in `tax.js` rate) | moderate | LOCAL | **qwen2.5-coder:7b** | ACCEPTED — edited `tax.js` → `ratePct()=>20` |
| hard-expr (full expression evaluator) | hard | **ESCALATE_TO_PROVIDER** | — | **no local model covers ⇒ flagged, NOT auto-run/paid** |

- **routingByModel:** 3b×1 (easy), 7b×2 (moderate) — cheapest-sufficient, never the largest; **1 honest escalation** (hard).
- **accepted 3/3 local; acceptedGeneralised 3/3** (adversarial edge re-tests); **multiModuleEditedBugFile 3/3**; **eval3bAgreed 3/3** (distinct 3b model independently judged CORRECT).

## What this demonstrates (beyond V317–V319b)
1. **Multi-module / cross-file localization:** in every 2-file workspace the model edited the **correct bug file** (helper / config / rate), never the orchestrator (`main.js`/`clamp.js`/`price.js`) — genuine cross-file reasoning, not single-file patching.
2. **Router-driven, cost-aware model selection is LIVE:** the §11.6 `odg-model-router` chose 3b for the easy case and 7b for the moderate cases (not a hardcoded model), and the easy case **succeeded on the cheaper 3b** — validating the cheapest-sufficient policy with real outcomes.
3. **Honest escalation:** the genuinely hard task (arithmetic expression evaluator with precedence/parens) routed to **ESCALATE_TO_PROVIDER** — the router refused to run a local model it had no measured capability for, flagging it for authorization rather than forcing a weak attempt or auto-paying.

## Separation / safety
Generator = routed local model; independent evaluators = deterministic `node --test` (primary) + adversarial edge re-tests + distinct `qwen2.5-coder:3b`; the router/escalation performs **no network/model call itself** and **no auto-spend**; exact rollback on any non-accept; zero Claude-Code execution in the cycle (harness only). C6 isolation certified; evidence written in-sandbox, host-recoverable.

## Honest boundary
Narrow, measured battery (4 cases). "moderate" cross-file defects are localization/constant/rate fixes, not large feature builds; "hard" (a full evaluator) was escalated, not solved locally — honestly. Reliability remains model- and difficulty-dependent; this is not a general-autonomy guarantee.

## Autonomy ladder
V317 bounded-deterministic → V318 novel synthesis → V319 multi-module+stack-trace → V319b accept/abstain curve (n=14) → **V320 multi-module cross-file localization with router-driven model selection + honest escalation.**

Evidence: `docs/odg/autonomy/V320_MULTIMODULE_ROUTED_EVIDENCE.json`. No canonical/production change; no secrets; no spend.
