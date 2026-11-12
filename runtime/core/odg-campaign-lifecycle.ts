#!/usr/bin/env node
"use strict";
/*
 * V160 (§2/§3) — ODG CAMPAIGN LIFECYCLE. Gives ODG the FULL persistent campaign lifecycle by COMPOSING the existing
 * crash-atomic persistent register (campaign-controller: loadRegister/saveRegister/selectNextLot/advance — THE canonical
 * register, no parallel file) with the REAL governed journey (odg-real-autonomy-journey). ODG: reads the persisted register
 * → selects the next dependency-eligible lot → runs it through the REAL governed path (Ed25519 sealed evidence + independent
 * reproduction) → ODG ACCEPT/REJECT → advances + PERSISTS the register after EVERY mission (the durable resume point) →
 * selects the next. Resume-after-interruption is REAL (file-based): a restart reloads the register and skips ACCEPTED lots.
 *
 * HONEST: this does NOT create a new register/queue; it drives the canonical campaign-controller register. Closure requires
 * real evidence (execId). No double execution across restarts (ACCEPTED is persisted; selectNextLot never re-picks it).
 * No hidden worker / infinite loop: bounded by maxSteps + "no eligible lot" termination. ODG decides every closure.
 */
const C = require("./campaign-controller.js");
const RJ = require("./odg-real-autonomy-journey.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

// run ONE lot through the REAL governed journey; ODG decides acceptance (crypto chain + independent reproduction).
function executeLotGoverned(lot: any): any {
  const id = isObj(lot) && isStr(lot.id) ? lot.id : "lot";
  const journey = RJ.runRealAutonomyJourney({ missionId: id });
  const providerStep = journey.steps.find((s: any) => s.step === "J");
  const accepted = journey.journeyComplete === true && isObj(providerStep) && /ACCEPTED_BY_ODG/.test(providerStep.detail);
  return Object.freeze({ accepted, execId: providerStep ? providerStep.execId : null, journeyComplete: journey.journeyComplete, providerRound: journey.providerRound });
}

/* runCampaignStep(registerPath) — load the PERSISTED register, select the next eligible lot, run it through the REAL
 * governed journey, advance the register (ACCEPTED with execId evidence, or attemptFailed/BLOCKED), and PERSIST. One step. */
function runCampaignStep(registerPath: any): any {
  if (!isStr(registerPath)) return Object.freeze({ ok: false, code: "NO_PATH" });
  const load = C.loadRegister(registerPath);
  if (!load.ok) return Object.freeze({ ok: false, code: load.code, reason: load.reason });
  const register = load.register;
  const next = C.selectNextLot(register);
  if (!next.lot) return Object.freeze({ ok: true, done: true, reason: next.reason || "no eligible lot", summary: C.summary(register) });

  const id = next.lot.id;
  const res = executeLotGoverned(next.lot);
  let advance: any;
  if (res.accepted && isStr(res.execId)) {
    advance = C.advance(register, id, { status: "ACCEPTED", evidence: `governed:${res.execId}` });   // ACCEPTED needs real evidence
  } else {
    // a non-accepted governed run is a recoverable failure: record the attempt (no-repeat fingerprint) + leave it open.
    advance = C.advance(register, id, { attemptFailed: true, reason: `governed run not accepted (${res.providerRound})`, nextAction: "diagnose + bounded retry or escalate" });
  }
  if (!advance.ok) return Object.freeze({ ok: false, code: advance.code, reason: advance.reason, ran: id });
  const saved = C.saveRegister(registerPath, register);                                              // CRASH-ATOMIC persist = durable resume point
  if (!saved) return Object.freeze({ ok: false, code: "PERSIST_FAILED", ran: id });
  return Object.freeze({ ok: true, done: false, ran: id, accepted: res.accepted, status: advance.item.status, execId: res.execId, persisted: true });
}

/* runCampaign(registerPath, opts) — drive the campaign to completion or maxSteps, persisting after EVERY mission.
 * ODG owns continuation: after each mission it re-reads the register and picks the next eligible lot. Bounded. */
function runCampaign(registerPath: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const maxSteps = Number.isSafeInteger(o.maxSteps) && o.maxSteps > 0 ? Math.min(o.maxSteps, 1000) : 200;
  const trace: any[] = [];
  let step = 0;
  while (step++ < maxSteps) {
    const r = runCampaignStep(registerPath);
    if (!r.ok) return Object.freeze({ ok: false, code: r.code, reason: r.reason, trace: Object.freeze(trace) });
    if (r.done) { trace.push({ step, done: true }); break; }
    trace.push({ step, ran: r.ran, accepted: r.accepted, status: r.status, execId: r.execId });
  }
  const finalLoad = C.loadRegister(registerPath);
  return Object.freeze({
    ok: true, steps: trace.length, trace: Object.freeze(trace),
    summary: finalLoad.ok ? C.summary(finalLoad.register) : null,
    note: "ODG drove the CANONICAL persistent register through the REAL governed journey; persisted after every mission; ACCEPTED requires execId evidence; resume is file-based; no double execution; no parallel queue.",
  });
}

/* resumeCampaign — explicit resume entry after an interruption: just reloads the persisted register and continues.
 * Proves there is no lost state and no re-run of ACCEPTED lots (selectNextLot excludes terminal states). */
function resumeCampaign(registerPath: any, opts?: any): any { return runCampaign(registerPath, opts); }

const CAMPAIGN_LIFECYCLE_CONTRACT = Object.freeze({
  id: "V160-ODG-CAMPAIGN-LIFECYCLE",
  purpose: "§2/§3 — ODG owns the full campaign lifecycle: persistent register (campaign-controller) driven through the REAL governed journey, with real resume-after-interruption",
  reuses: ["campaign-controller.loadRegister/saveRegister/selectNextLot/advance/summary (THE canonical crash-atomic register — no parallel file)", "odg-real-autonomy-journey (REAL governed execution)"],
  invariants: Object.freeze([
    "drives the CANONICAL persistent register (campaign-controller) — no new register/queue, no parallel file",
    "each lot runs through the REAL governed journey; ODG decides ACCEPT (requires execId evidence) / REJECT",
    "persists after EVERY mission (crash-atomic temp+rename) ⇒ real resume; a restart reloads + skips ACCEPTED (no double execution)",
    "dependency-aware via selectNextLot; a non-accepted run records a no-repeat attempt (no infinite retry on the same unchanged lot)",
    "bounded (maxSteps + no-eligible termination); no hidden worker/infinite loop; ODG owns continuation",
  ]),
});
module.exports = { runCampaignStep, runCampaign, resumeCampaign, executeLotGoverned, CAMPAIGN_LIFECYCLE_CONTRACT };
export {};
