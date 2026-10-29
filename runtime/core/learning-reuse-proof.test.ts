#!/usr/bin/env node
// @ts-nocheck — runs under tsx. The Mandate-§2 reproducible learning-reuse PROOF: a fair A/B distinguishing recorded
// vs retrieved vs reused vs EFFECTIVE, with controls for out-of-domain, stale, and tampered learnings, cross-process
// reproducibility (a FRESH spawned process resumes from the persisted store), and an honest-negative (equal
// before/after ⇒ NOT effective — no fabricated gain). Built from existing mechanisms only (no new primitive).
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const P = require("./learning-reuse-proof.js");
const CHAIN = require("./learning-chain.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) the full experiment ⇒ PROVEN with every check true.
{
  const r = P.runExperiment({ now: "2026-10-29" });
  const c = r.proof.checks;
  ok("verdict PROVEN; all 8 lifecycle/control checks true", r.proof.verdict === "PROVEN" && Object.values(c).every(Boolean));
}
// (2) recorded vs retrieved vs reused: baseline MISS, learned HIT, decision INFLUENCED, measured improvement.
{
  const r = P.runExperiment({ now: "2026-10-29" }).proof;
  ok("baseline MISS (no learning) vs learned HIT + influenced decision; improvement 1",
     r.arms.baseline.hit === false && r.arms.learned.hit === true && r.arms.learned.influenced === true && r.improvement === 1);
}
// (3) EFFECTIVE is graded by learning-chain on a MEASURED, DIFFERING before/after.
{
  const r = P.runExperiment({ now: "2026-10-29" }).proof;
  ok("chain state EFFECTIVE (measured before/after differ)", r.chainState.state === "EFFECTIVE" && r.chainState.complete === true);
}
// (4) OUT-OF-DOMAIN control: the learning is not applied to a different goal/domain.
{
  const r = P.runExperiment({ now: "2026-10-29" }).proof;
  ok("out-of-domain ⇒ not applied (MISS)", r.controls.outOfDomain.hit === false);
}
// (5) STALE control: a learning marked stale is not applied.
{
  const r = P.runExperiment({ now: "2026-10-29" }).proof;
  ok("stale learning ⇒ not applied", r.controls.stale.hit === false && /STALE|stale/.test(r.controls.stale.reason));
}
// (6) TAMPERED/contradictory control: a sealed learning mutated after sealing is REFUSED by the real gate.
{
  const r = P.runExperiment({ now: "2026-10-29" }).proof;
  ok("tampered sealed learning ⇒ refused (content digest mismatch)", r.controls.tampered.hit === false && /digest mismatch|altered/.test(r.controls.tampered.reason));
}
// (7) HONEST-NEGATIVE: equal before/after ⇒ learning-chain does NOT grade EFFECTIVE (no fabricated gain).
{
  const eq = CHAIN.classifyLearningState({ captured: { fact: "x" }, persisted: { id: "x" }, discoverable: { index: "x" }, reused: { count: 1 }, effective: { baseline: { cost: 1 }, after: { cost: 1 } } });
  ok("equal before/after ⇒ NOT EFFECTIVE (honest, no fabricated improvement)", eq.complete === false && eq.state === "REUSED");
}
// (8) CROSS-PROCESS reproducibility (step 9): one process persists the store, a FRESH --resume process reuses it.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-lrp-")); const store = path.join(dir, "store.json");
  const CLI = path.join(process.cwd(), "runtime", "core", "learning-reuse-proof.ts");
  const run1 = cp.spawnSync("npx", ["tsx", CLI, store], { cwd: process.cwd(), encoding: "utf8", timeout: 120000 });
  const p1 = JSON.parse(run1.stdout);
  const persisted = fs.existsSync(store) && JSON.parse(fs.readFileSync(store, "utf8")).learnings.some((l) => l.id === "L-csv");
  const run2 = cp.spawnSync("npx", ["tsx", CLI, store, "--resume"], { cwd: process.cwd(), encoding: "utf8", timeout: 120000 });
  const p2 = JSON.parse(run2.stdout);
  ok("fresh process resumes from persisted store ⇒ learning reused (HIT), verdict PROVEN both runs",
     run1.status === 0 && p1.verdict === "PROVEN" && persisted === true && run2.status === 0 && p2.resume === true && p2.arms.learned.hit === true && p2.verdict === "PROVEN");
  fs.rmSync(dir, { recursive: true, force: true });
}

// (9) consistency (audit caveat): a HIT always implies the decision was influenced — never hit:true + influenced:false.
{
  const store = { version: 1, learnings: [] };
  P.persistLearning(store, { id: "L", goal: "g", domain: "d", capability: "cap", claims: [] });
  const r = P.resolve(store, "g", "d", { now: "2026-10-29" });
  ok("resolve HIT ⇒ influenced true (hit⇔influenced consistent; no bare-hit reuse)", (r.hit === true && r.influenced === true) || (r.hit === false && r.influenced === false));
}

console.log(`\nLEARNING-REUSE-PROOF suite — ${pass} assertions passed. (recorded≠retrieved≠reused≠EFFECTIVE; out-of-domain/stale/tampered refused; honest-negative; cross-process reproducible; no new primitive)`);
