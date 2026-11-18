#!/usr/bin/env node
"use strict";
/*
 * V287 Lot 1 — CAPABILITY REUSE PATH (E2E DEMONSTRATOR, read-only composition). The CTO decision: ODG must know,
 * select and EXPLOIT its existing capabilities for every mission. The mechanism ALREADY EXISTS, split across canonical
 * components; this module does NOT rebuild any of it — it COMPOSES them into one verifiable end-to-end trace and proves
 * a capability is actually USED (evidence produced), not merely named by a router. It is NOT a 2nd capability-map /
 * router / registry / scheduler / orchestrator: it owns no state, no catalog and no routing table — it only calls:
 *
 *   mission-priority-selector.selectNext   — ODG SELECTS the mission (not hand-picked)
 *   capability-map.buildCapabilityMap/queryCapability — ODG DISCOVERS what it already has (+ honest L0-L5 maturity)
 *   capability-router.route                — ODG SELECTS the execution tier (Memory→Rules→Local-LLM→External last-resort)
 *   capability-executors.effectRegistryVerdict — AUTHORIZATION (deny-by-default for unregistered/ungoverned caps)
 *   capability-executors.resolve(...).run()    — ODG USES the capability: real execution → evidence artifact
 *
 * Answers §2's mandatory question for a mission: "what do I already have, where, how do I use it, is it authorized,
 * and what evidence proves it works?" — with a verifiable result, or a SAFE REFUSAL when the capability is absent,
 * unauthorized or unresolved. Pure composition; fail-closed; no new primitive.
 *
 * NOTE on evidence: capability-executors writes evidence under the relative path "runtime/generated" (cwd-relative).
 * The caller controls cwd so the demonstration can run in an isolated workspace; this module reads back the evidence
 * pointer the executor returns and verifies it resolves to a real, parseable artifact for THIS objective.
 */

const fs = require("fs");
const SEL = require("./mission-priority-selector.js");   // ODG selects
const MAP = require("./capability-map.js");              // ODG discovers (self-capability graph)
const ROUTER = require("./capability-router.js");        // ODG selects the tier
const EXEC = require("./capability-executors.js");       // ODG uses (resolve → run → evidence) + authorization

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * demonstrateCapabilityReusePath(input): run the full MISSION → DISCOVER → SELECT → AUTHORIZE → USE → EVIDENCE chain.
 * input = { missions, acceptedIds, registerItems, manifestMissions, capabilityId, objectiveId, goal, localModelAvailable }.
 * Returns a frozen trace with a per-step record and an overall verdict. Never throws on a normal refusal.
 */
function demonstrateCapabilityReusePath(input?: any): any {
  const i = isObj(input) ? input : {};
  // 1. SELECT — ODG picks the mission via its own deterministic selector.
  const selection = SEL.selectNext(Array.isArray(i.missions) ? i.missions : [], Array.isArray(i.acceptedIds) ? i.acceptedIds : []);
  if (!selection.selected) return Object.freeze({ ok: false, code: "NO_MISSION", verdict: "NO_ELIGIBLE_MISSION", selection });

  // 2. DISCOVER — ODG consults its own capability map (built from the canonical register) and queries the capability.
  const map = MAP.buildCapabilityMap({ registerItems: Array.isArray(i.registerItems) ? i.registerItems : [], missions: Array.isArray(i.manifestMissions) ? i.manifestMissions : [] });
  const discovered = MAP.queryCapability(map, i.capabilityId);   // null ⇒ not a real (ACCEPTED+evidence / VALIDATED) capability

  // 3. ROUTE — ODG selects the execution tier; external AI is only ever the flagged last resort.
  const routed = ROUTER.route({ goal: i.goal }, { localModelAvailable: i.localModelAvailable === true });
  const routeSummary = Object.freeze({
    chosenTier: routed.chosen ? routed.chosen.tier : null,
    chosenSource: routed.chosen ? routed.chosen.source : null,
    usesExternalAI: routed.usesExternalAI === true,
    externalIsLastResort: Array.isArray(routed.plan) && routed.plan.length > 0 && routed.plan[routed.plan.length - 1].tier === "EXTERNAL_AI" && routed.plan[routed.plan.length - 1].lastResort === true,
  });

  // 4. AUTHORIZE + 5. USE — resolve the objective to a REAL executor, gate it, then actually RUN it (evidence).
  const resolver = EXEC.resolve({ objectiveId: i.objectiveId, goal: i.goal });
  let authorization: any = null, used = false, evidenceVerified = false, evidencePath: any = null, execSummary: any = null, verdict = "REFUSED_NO_CAPABILITY";
  if (!resolver) {
    verdict = "REFUSED_NO_CAPABILITY";   // safe refusal: no capability matched the objective — nothing executed
  } else {
    authorization = EXEC.effectRegistryVerdict(resolver.capability);
    if (!authorization.ok) {
      verdict = "REFUSED_UNAUTHORIZED";   // deny-by-default: unregistered/ungoverned ⇒ not run
    } else {
      let ran: any = null;
      try { ran = resolver.run(); } catch (e: any) { ran = { __error: (e && e.message) || "execution error" }; }
      if (ran && !ran.__error) {
        execSummary = Object.freeze({ capability: ran.capability, summary: ran.summary || null });
        evidencePath = ran.evidence || null;
        try { const ev = JSON.parse(fs.readFileSync(String(evidencePath), "utf8")); evidenceVerified = isObj(ev) && ev.objective === i.objectiveId; } catch { evidenceVerified = false; }
        used = evidenceVerified;
        verdict = used ? "CAPABILITY_USED_EVIDENCED" : "EXECUTED_EVIDENCE_UNVERIFIED";
      } else {
        verdict = "EXECUTION_FAILED";
      }
    }
  }

  return Object.freeze({
    ok: true,
    selection: Object.freeze({ selectedMissionId: selection.selected.id, justification: selection.selectionJustification }),
    discovery: Object.freeze({ capabilityId: i.capabilityId, found: !!discovered, maturity: discovered ? discovered.capability.maturity : null, absentReason: discovered ? null : "not an ACCEPTED+evidence / VALIDATED capability in the register" }),
    route: routeSummary,
    authorization: authorization ? Object.freeze({ ok: authorization.ok, effect: authorization.ok ? authorization.entry.effect : null, reason: authorization.reason || null }) : null,
    resolverCapability: resolver ? resolver.capability : null,
    used, evidenceVerified, evidencePath, execSummary,
    verdict,
    contributions: Object.freeze({ odgNative: "selection + discovery + routing + authorization + dispatch (deterministic canonical components)", localModel: "not invoked in this read-only observational demonstration", claudeCode: "authored THIS demonstrator (composition only) + the fixtures — no capability logic reimplemented" }),
    note: "composes EXISTING canonical components end-to-end; proves a capability is USED (evidence artifact for the objective), not merely named; a missing/unauthorized/unresolved capability yields a SAFE REFUSAL with nothing executed.",
  });
}

const CAPABILITY_REUSE_PATH_CONTRACT = Object.freeze({
  id: "V287-CAPABILITY-REUSE-PATH",
  source: "CTO V287 Lot 1 — prove the MISSION → discover → select → authorize → USE → evidence path over existing components",
  reuses: Object.freeze(["mission-priority-selector.selectNext", "capability-map.buildCapabilityMap/queryCapability", "capability-router.route", "capability-executors.resolve/effectRegistryVerdict (+ real executor run → evidence)"]),
  notAuthority: "a read-only E2E DEMONSTRATOR; it owns no catalog/routing-table/state; it builds no concurrent registry/router/scheduler and grants no authority",
  invariants: Object.freeze([
    "no 2nd capability-map/router/registry/resolver/scheduler/orchestrator — pure composition of the canonical ones",
    "a capability is counted USED only when a real executor ran AND its evidence artifact resolves for THIS objective (name-only ≠ used)",
    "deny-by-default: an unregistered/ungoverned capability ⇒ REFUSED_UNAUTHORIZED, nothing executed; an unmatched objective ⇒ REFUSED_NO_CAPABILITY",
    "external AI is only ever the flagged last resort in the route plan; local/deterministic tiers are preferred",
    "fail-closed + deterministic on the refusal paths; evidence timestamps are the only volatile field (execution path)",
    "THIS module was authored by Claude Code (composition only) — no capability logic is reimplemented or claimed as native",
  ]),
});

module.exports = { demonstrateCapabilityReusePath, CAPABILITY_REUSE_PATH_CONTRACT };
export {};
