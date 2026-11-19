#!/usr/bin/env node
"use strict";
/* V319 Addendum §11.6 — tests for odg-model-router (cost-aware local-first routing by measured capability). PURE. */
const R = require("./odg-model-router.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // cheapest-sufficient, NOT largest
  check("trivial ⇒ cheapest (qwen2.5:0.5b)", R.selectModel({ difficulty: "trivial" }).model === "qwen2.5:0.5b");
  check("easy ⇒ 3b (cheapest that covers easy, NOT 7b)", R.selectModel({ difficulty: "easy" }).model === "qwen2.5-coder:3b" && R.selectModel({ difficulty: "easy" }).decision === "LOCAL");
  check("moderate ⇒ 7b", R.selectModel({ difficulty: "moderate" }).model === "qwen2.5-coder:7b");

  // hard ⇒ escalate (flagged, requires authorization, no auto paid call)
  const hard = R.selectModel({ difficulty: "hard" });
  check("hard ⇒ ESCALATE_TO_PROVIDER, model null, requiresAuthorization true", hard.decision === "ESCALATE_TO_PROVIDER" && hard.model === null && hard.requiresAuthorization === true);
  check("escalation rationale forbids auto paid call", /never an automatic paid-API call/.test(hard.rationale));

  // requireLocal forbids escalation ⇒ refuse (no overclaim)
  const forced = R.selectModel({ difficulty: "hard", requireLocal: true });
  check("hard + requireLocal ⇒ BLOCKED_LOCAL (refuse, don't overclaim)", forced.decision === "BLOCKED_LOCAL" && forced.model === null);

  // never picks the largest unnecessarily: easy must NOT route to 7b
  check("never-largest: easy does NOT pick 7b", R.selectModel({ difficulty: "easy" }).model !== "qwen2.5-coder:7b");

  // considered list shows cost-ordered coverage (evidence-based, not marketing)
  const sel = R.selectModel({ difficulty: "easy" });
  check("considered list is cost-ordered + shows coverage", Array.isArray(sel.considered) && sel.considered[0].costRank === 1 && sel.considered.find((c: any) => c.id === "qwen2.5-coder:3b").covers === true);

  // fail-closed
  check("bad difficulty ⇒ BAD_DIFFICULTY", R.selectModel({ difficulty: "impossible" }).code === "BAD_DIFFICULTY");

  // batch distribution
  const batch = R.routeBatch([{ id: "a", difficulty: "trivial" }, { id: "b", difficulty: "easy" }, { id: "c", difficulty: "moderate" }, { id: "d", difficulty: "hard" }]);
  check("batch routes 4, 1 escalation (the hard one)", batch.ok && batch.total === 4 && batch.escalations === 1);
  check("batch cost distribution: cheapest tiers used (0.5b + 3b + 7b each once), hard escalated", batch.byModel["qwen2.5:0.5b"] === 1 && batch.byModel["qwen2.5-coder:3b"] === 1 && batch.byModel["qwen2.5-coder:7b"] === 1 && batch.distribution.ESCALATE_TO_PROVIDER === 1);
  check("empty batch ⇒ NO_TASKS", R.routeBatch([]).code === "NO_TASKS");

  // determinism + frozen
  check("deterministic", R.selectModel({ difficulty: "moderate" }).model === R.selectModel({ difficulty: "moderate" }).model);
  check("frozen", Object.isFrozen(sel) && Object.isFrozen(batch) && Object.isFrozen(R.LOCAL_POOL));

  check("contract: cheapest-sufficient, measured evidence, escalation never auto-paid", R.MODEL_ROUTER_CONTRACT.invariants.some((s: string) => /never assume the largest/.test(s)) && R.MODEL_ROUTER_CONTRACT.invariants.some((s: string) => /NEVER an auto paid-API call/.test(s)) && R.MODEL_ROUTER_CONTRACT.invariants.some((s: string) => /measured/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-model-router (§11.6: cost-aware local-first routing by MEASURED capability [V318/V319b]; cheapest-sufficient not largest; hard⇒ESCALATE flagged/never-auto-paid; requireLocal refuses rather than overclaims; deterministic)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
