/**
 * autonomous-execution-policy — ODG_AUTONOMOUS_EXECUTION_GOVERNANCE_V1 (LOT A). The PERMANENT, EXECUTABLE rule
 * that ODG executes end-to-end everything it technically + legally can in scope, and the CTO's time is imputed
 * ONLY to genuinely-human steps (authorization, approval, reserved decision, signature, legal responsibility).
 * It is applied automatically by the economic tools (unit-economics), not merely stored in a document.
 *
 * REUSES the governance classifier `nl-objective-gateway.classifyObjective` — creates NO second classifier.
 * Rules enforced:
 *   (1) ODG-automatable work ⇒ actor ODG (not billed as human).
 *   (2)/(3) a step is HUMAN only when genuinely human: explicit mandatory (signature/authorization/legal) OR the
 *       classifier says requiresHuman.
 *   (4) a step imputed to a human but classified ODG-automatable is FLAGGED (needlessly left to the human).
 *   (5) a mandatory human/security control is NEVER downgraded to ODG by this rule (fail-safe: when in doubt on a
 *       mandatory flag, it stays HUMAN). This rule never authorises bypassing an obligation.
 */
const gw = require("./nl-objective-gateway.js");

const ACTOR = Object.freeze({ ODG: "ODG", HUMAN: "HUMAN", EXTERNAL_GATED: "EXTERNAL_GATED" });

// Explicit mandatory-human kinds (legal/authority) — these are rule (3)/(5): always HUMAN, never auto-downgraded.
const MANDATORY_HUMAN = new Set(["signature", "authorization", "approval", "reserved-decision", "legal", "human"]);

/**
 * step: { label|goal: string, minutes?: number, imputedTo?: "ODG"|"HUMAN", mandatory?: string }
 * Returns { actor, reason, mandatoryControl, classification }.
 */
function classifyStep(step: any): any {
  const s = step && typeof step === "object" ? step : {};
  const goal = typeof s.goal === "string" && s.goal ? s.goal : (typeof s.label === "string" ? s.label : "");
  // (5) explicit mandatory human/legal control wins unconditionally — never downgraded.
  if (typeof s.mandatory === "string" && MANDATORY_HUMAN.has(s.mandatory.toLowerCase())) {
    return { actor: ACTOR.HUMAN, reason: `mandatory human control (${s.mandatory}) — never auto-downgraded`, mandatoryControl: true, classification: null };
  }
  // Fail-safe: an empty/absent goal cannot be proven ODG-automatable ⇒ leave to human review (never auto-claimed).
  if (goal.trim() === "") {
    return { actor: ACTOR.HUMAN, reason: "empty/absent step goal — fail-safe to human review (not auto-automated)", mandatoryControl: false, classification: null };
  }
  let c = null;
  try { c = gw.classifyObjective(goal); } catch { c = null; }
  if (!c || typeof c !== "object") {
    // Fail-safe: unclassifiable ⇒ do NOT assume ODG can do it; leave to human review (never bypass).
    return { actor: ACTOR.HUMAN, reason: "unclassifiable step — fail-safe to human review (not auto-automated)", mandatoryControl: false, classification: null };
  }
  if (c.requiresHuman === true) {
    return { actor: ACTOR.HUMAN, reason: `genuinely human (externalEffect=${c.externalEffect}, requiresHuman)`, mandatoryControl: true, classification: c };
  }
  if (c.requiresExternal === true) {
    return { actor: ACTOR.EXTERNAL_GATED, reason: `needs an external system/authorization (externalEffect=${c.externalEffect}) — neither ODG-alone nor human-residual`, mandatoryControl: false, classification: c };
  }
  // (1) internal technical ⇒ ODG executes it.
  return { actor: ACTOR.ODG, reason: `ODG-automatable internal step (externalEffect=NONE, actionClass=${c.actionClass})`, mandatoryControl: false, classification: c };
}

/**
 * auditImputation(steps) — apply the rule across a work breakdown. Returns the policy-derived time split and the
 * flags (rule 4: automatable work left to a human). minutes default 0. A step with no minutes still classifies.
 */
function auditImputation(steps: any): any {
  const list = Array.isArray(steps) ? steps : [];
  let odgMinutes = 0, humanMinutes = 0, externalGatedMinutes = 0, misimputedHumanMinutes = 0;
  const flags: any[] = [], perStep: any[] = [];
  for (const step of list) {
    const r = classifyStep(step);
    const min = Number(step && step.minutes) || 0;
    if (r.actor === ACTOR.ODG) odgMinutes += min;
    else if (r.actor === ACTOR.HUMAN) humanMinutes += min;
    else externalGatedMinutes += min;
    // (4) detect automatable work needlessly imputed to a human.
    const imputed = step && typeof step.imputedTo === "string" ? step.imputedTo.toUpperCase() : null;
    if (imputed === "HUMAN" && r.actor === ACTOR.ODG) {
      misimputedHumanMinutes += min;
      flags.push({ code: "AUTOMATABLE_LEFT_TO_HUMAN", label: step.label || step.goal || "(step)", minutes: min, detail: "ODG-automatable step imputed to a human — ODG should execute it; do NOT charge it as CTO time." });
    }
    perStep.push({ label: step.label || step.goal || "(step)", actor: r.actor, minutes: min, mandatoryControl: r.mandatoryControl, reason: r.reason });
  }
  return {
    odgMinutes, residualHumanMinutes: humanMinutes, externalGatedMinutes, misimputedHumanMinutes,
    flags, perStep,
    note: "residualHumanMinutes counts ONLY genuinely-human steps (mandatory/legal/requiresHuman). ODG-automatable work is ODG's, never the CTO's. EXTERNAL_GATED is a dependency, neither ODG-billable nor human-residual.",
  };
}

module.exports = { ACTOR, MANDATORY_HUMAN, classifyStep, auditImputation };
export {};
