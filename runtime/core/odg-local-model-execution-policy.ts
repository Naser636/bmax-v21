#!/usr/bin/env node
"use strict";
/*
 * V327 §3 — LOCAL-MODEL EXECUTION POLICY. PURE, deterministic, fail-closed. Turns the MEASURED §3 findings into an
 * operational resource-adaptation policy: given a mission-type's REAL calibrated-P verdict, choose {model, maxRepair}
 * proportionate to the measured need — so cheap-reliable types stay cheap and hard types get more resource, without
 * wasting compute or over-claiming. It AUTHORIZES NOTHING and promises no fix (the measured data shows some tasks —
 * e.g. cycle-detecting topological sort — are unsolved by BOTH a bigger model AND more repair; those are flagged ESCALATE).
 *
 * The thresholds ENCODE the measured evidence (docs/odg/autonomy/ODG_LOCAL_MODEL_{MODEL_CHOICE,REPAIR_DEPTH}_2026-11-20.json):
 *   - borderline failures were fixed by MODEL SIZE (3b->7b);
 *   - medium-hard failures (infix/lru) were fixed by REPAIR DEPTH (maxRepair 1->3, independent-test-guided);
 *   - the hardest (topo) was fixed by NEITHER -> ESCALATE to the frontier provider / decomposition.
 * It composes odg-calibrated-psuccess (no re-implementation); it chooses resources, it does not execute.
 */

const CP = require("./odg-calibrated-psuccess.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const MODEL = Object.freeze({ SMALL: "qwen2.5-coder:3b", LARGE: "qwen2.5-coder:7b" });
// Measured calibrated-P bands → resource policy (see dossiers). HIGH: reliable, cheap suffices. MEDIUM: repair depth
// helps. LOW: throw the large model + repair depth, and FLAG escalate (some low-P types are unsolved by local compute).
const HIGH = 0.7;   // ≥ HIGH ⇒ cheap/fast is measured-sufficient
const LOW = 0.3;    // < LOW  ⇒ local compute is measured-unreliable ⇒ escalate-flagged

/**
 * chooseExecutionPolicy(missionType, history, opts?) -> { model, maxRepair, escalateIfStillFails, tier, quality,
 * pForPlanner, reason }. Thin/biased/unknown history ⇒ a cheap PROBE policy (gather data; never over-commit resource on
 * no evidence). Deterministic; AUTHORIZES NOTHING.
 */
function chooseExecutionPolicy(missionType: any, history: any, opts: any = {}): any {
  const d = CP.derivePsuccess(missionType, Array.isArray(history) ? history : [], isObj(opts) ? opts : {});
  const p = d.pForPlanner;
  let model = MODEL.SMALL, maxRepair = 1, tier = "PROBE", escalate = false, why: string;

  if (d.quality !== "CALIBRATED") {
    // No calibrated evidence ⇒ cheap probe (3b, 1 repair) to GATHER data — never spend the large model on a hunch.
    model = MODEL.SMALL; maxRepair = 1; tier = "PROBE";
    why = `no CALIBRATED evidence (${d.quality}) ⇒ cheap probe (3b, maxRepair 1) to gather outcomes; escalate resource only on measured need`;
  } else if (p >= HIGH) {
    model = MODEL.SMALL; maxRepair = 1; tier = "NATIVE_CHEAP";
    why = `calibrated P=${p} ≥ ${HIGH} ⇒ reliable ⇒ cheap/fast is measured-sufficient (3b, maxRepair 1)`;
  } else if (p >= LOW) {
    model = MODEL.SMALL; maxRepair = 3; tier = "NATIVE_REPAIR";
    why = `calibrated P=${p} in [${LOW},${HIGH}) ⇒ medium-hard ⇒ apply measured lever REPAIR DEPTH (3b, maxRepair 3)`;
  } else {
    model = MODEL.LARGE; maxRepair = 3; tier = "NATIVE_MAX_THEN_ESCALATE"; escalate = true;
    why = `calibrated P=${p} < ${LOW} ⇒ measured-unreliable ⇒ max local resource (7b, maxRepair 3) AND flag ESCALATE to provider/decomposition if still failing (some low-P types are unsolved by local compute)`;
  }
  return freeze({
    model, maxRepair, escalateIfStillFails: escalate, tier,
    quality: d.quality, pForPlanner: p, observations: d.observations,
    authorizes: false,
    reason: why,
  });
}

const EXECUTION_POLICY_CONTRACT = Object.freeze({
  id: "V327-LOCAL-MODEL-EXECUTION-POLICY",
  purpose: "§3 — operationalize the MEASURED model-size/repair-depth findings into a calibrated resource-adaptation policy ({model, maxRepair}) proportionate to real need; cheap-reliable stays cheap, hard gets more resource, hardest is escalate-flagged",
  reuses: Object.freeze(["odg-calibrated-psuccess.derivePsuccess (CALIBRATED verdict — not reimplemented)", "ENCODES docs/odg/autonomy/ODG_LOCAL_MODEL_{MODEL_CHOICE,REPAIR_DEPTH}_2026-11-20.json measured evidence"]),
  invariants: Object.freeze([
    "no CALIBRATED evidence ⇒ cheap PROBE (3b, maxRepair 1) to gather data — never spend the large model on a hunch",
    "resource escalates ONLY with calibrated evidence of lower success (P<HIGH ⇒ repair depth; P<LOW ⇒ large model + repair + ESCALATE flag)",
    "promises NO fix: a low-P type is flagged escalate (measured: topo unsolved by bigger model AND more repair) — honesty over optimism",
    "chooses resources only; AUTHORIZES NOTHING and executes nothing; composes calibrated-P, builds no estimator",
    "PURE/deterministic/frozen; fail-closed",
  ]),
});

module.exports = { chooseExecutionPolicy, MODEL, EXECUTION_POLICY_CONTRACT };
export {};
