#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V27 §3 — COMPLEXITY-AWARE REPAIR ROUTING. PURE orchestration. Composes the EXISTING model-router (3B/7B
 * benchmark-grounded selection) with repair-retry (governed feedback loop) and adds the DISCOVERED-NEED escalation from
 * V26: a FAILED cheaper-model attempt auto-escalates to the higher-quality model within the governed loop, instead of
 * either always paying for 7B or giving up at 3B. Routing uses technical signals (recursion, control-structure depth,
 * dependency references, size) — not a guess. The INDEPENDENT verifier remains the sole arbiter of acceptance; 7B is not
 * chosen systematically (its cost/benefit is measured). Builds no model. Dual export.
 */

const MR = require("./model-router.js");
const RR = require("./repair-retry.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * assessComplexity({ code, instruction }) -> { complexity:"SIMPLE"|"COMPLEX", signals }. Technical heuristics over the
 * defect's own code + instruction (recursion / control depth / cross-function references / size). Deterministic.
 */
function assessComplexity(input: any): any {
  const o = isObj(input) ? input : {};
  const code = String(o.code || ""); const instr = String(o.instruction || "");
  // named-function self-reference or an explicit recursion ask.
  const fnNames = (code.match(/function\s+([A-Za-z_$][\w$]*)/g) || []).map((s) => s.replace(/function\s+/, ""));
  const recursion = /\brecursi/i.test(instr) || fnNames.some((n) => new RegExp("\\b" + n + "\\s*\\(").test(code.replace(new RegExp("function\\s+" + n), "")));
  const controlStructures = (code.match(/\b(if|for|while|switch|\?)\b|\?/g) || []).length;
  const depth = Math.max(0, ...code.split("\n").map((l) => (l.match(/^\s*/)![0].length)));
  const crossRefs = /\b[a-z_$][\w$]*\s*\([^)]*\)/gi.test(code) && /module\.exports\s*=\s*\(/.test(code) && /\b([a-z_$][\w$]*)\s*\(/.test(code) && !/function/.test(code) && /\b[a-z_$][\w$]*\s*\(/.test(code.replace(/module\.exports/, ""));
  const size = code.length;
  const edgeCase = /\bedge|\bempty|\bnull|\bNaN\b|base case/i.test(instr);
  const score = (recursion ? 2 : 0) + (controlStructures >= 2 ? 1 : 0) + (edgeCase ? 1 : 0) + (size > 160 ? 1 : 0);
  return Object.freeze({ complexity: score >= 2 ? "COMPLEX" : "SIMPLE", signals: Object.freeze({ recursion, controlStructures, depth, edgeCase, size, score }) });
}

/**
 * routeRepair(defect, deps) -> { accepted, model, escalated, attempts, complexity, history }. defect: { code,
 * instruction, writeSet, allowedPath }. deps: { generateFor(model) -> (prompt)->Promise<{ok,text}>, verify(content),
 * buildPrompt(defect)->string, maxAttempts?, models? }. Routing: assess complexity → model-router picks the first model;
 * run repair-retry; if it fails AND the model was the cheaper (3B/SIMPLE) one, ESCALATE to the quality model and retry.
 */
async function routeRepair(defect: any, deps: any = {}): Promise<any> {
  const d = isObj(defect) ? defect : {};
  const cx = assessComplexity({ code: d.code, instruction: d.instruction });
  const pick = MR.selectModel({ taskComplexity: cx.complexity });
  const quality = MR.selectModel({ taskComplexity: "COMPLEX" }).model;
  const maxAttempts = Number(deps.maxAttempts) || 2;
  const basePrompt = typeof deps.buildPrompt === "function" ? deps.buildPrompt(d) : String(d.instruction || "");
  const writeSet = Array.isArray(d.writeSet) ? d.writeSet : (d.allowedPath ? [d.allowedPath] : []);
  const history: any[] = [];

  async function attemptWith(model: string): Promise<any> {
    const gen = deps.generateFor(model);
    const r = await RR.repairWithRetry({ basePrompt, writeSet, allowedPath: d.allowedPath, maxAttempts, generate: gen, verify: deps.verify });
    history.push({ model, accepted: r.accepted, attempts: r.attempts });
    return r;
  }

  let r = await attemptWith(pick.model);
  let escalated = false;
  if (!r.accepted && pick.model !== quality) { escalated = true; r = await attemptWith(quality); }   // escalate on failure
  const finalModel = r.accepted ? history[history.length - 1].model : history[history.length - 1].model;
  return Object.freeze({
    accepted: r.accepted, model: finalModel, escalated, attempts: history.reduce((a, h) => a + h.attempts, 0),
    complexity: cx.complexity, signals: cx.signals, history: Object.freeze(history), finalEdit: r.finalEdit || null,
  });
}

const REPAIR_ROUTER_CONTRACT = Object.freeze({
  id: "V124-REPAIR-ROUTER",
  source: "CTO V27 §3 — complexity-aware repair routing with governed 3B→7B escalation",
  reuses: Object.freeze(["model-router.selectModel (benchmark-grounded 3B/7B)", "repair-retry.repairWithRetry (governed feedback loop)", "the INDEPENDENT verifier (sole acceptance arbiter)"]),
  notAuthority: "selects a model by technical complexity signals and escalates a FAILED cheaper attempt to the quality model; the independent verifier decides acceptance; builds no model",
  invariants: Object.freeze([
    "routing uses technical signals (recursion / control depth / edge-case / size), not a guess; 7B is not chosen systematically",
    "a SIMPLE defect starts on the fast model; a COMPLEX one starts on the quality model",
    "a FAILED cheaper-model attempt ESCALATES to the quality model within the governed loop (the V26 discovered need)",
    "the INDEPENDENT verifier is the sole acceptance arbiter; a fix is never accepted on the generator's claim",
    "escalation frequency + attempts + acceptance are measurable so cost/benefit is explicit",
  ]),
});

module.exports = { assessComplexity, routeRepair, REPAIR_ROUTER_CONTRACT };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ ...REPAIR_ROUTER_CONTRACT, demo: { simple: assessComplexity({ code: "module.exports=(a,b)=>a-b;", instruction: "fix add" }).complexity, recursive: assessComplexity({ code: "module.exports=(n)=>n*factorial(n-1);", instruction: "fix factorial with a base case and named recursion" }).complexity } }, null, 2) + "\n");
}

export {};
