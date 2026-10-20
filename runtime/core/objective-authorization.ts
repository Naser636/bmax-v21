/**
 * objective-authorization — CM-5: PURE governance-mapped authorization stamper for mission-plan objectives
 * (ODG_TOOL_EXCELLENCE... Lot A / §X.9). Produces the `authorization` declaration that
 * `autonomy-measure.eligibilityFromObjectives` requires, so a LIVE autonomy score can become MEASURABLE when a
 * REAL mission's objectives carry it. REUSES the governance classifier `nl-objective-gateway.classifyObjective`.
 * Creates NO new primitive and NO second classifier.
 *
 * ANTI-INFLATION (hard rule): a reserved / external / human-gated objective is NEVER declared eligible — it is
 * `{excluded:true, reason}`, regardless of any caller wish. Only a purely-internal technical objective
 * (externalEffect NONE, no external, no human) ⇒ `{eligible:true, authorized:true}`. Unclassifiable ⇒ excluded
 * (fail-closed, never defaulted eligible). Prevents gaming the autonomy score by mislabelling reserved objectives.
 */
const gw = require("./nl-objective-gateway.js");

function declareAuthorization(objective: any): any {
  const o = objective && typeof objective === "object" ? objective : {};
  const goal = typeof o.goal === "string" ? o.goal : "";
  // Fail CLOSED: an empty/absent goal cannot be classified ⇒ never auto-eligible.
  if (goal.trim() === "") return { excluded: true, reason: "empty/absent goal — not auto-eligible (fail-closed)" };
  let c: any = null;
  try { c = gw.classifyObjective(goal); } catch { c = null; }
  if (!c || typeof c !== "object") {
    return { excluded: true, reason: "unclassifiable objective — not auto-eligible (fail-closed)" };
  }
  const external = c.requiresExternal === true;
  const human = c.requiresHuman === true;
  const effect = typeof c.externalEffect === "string" ? c.externalEffect : "UNKNOWN";
  if (external || human || (effect !== "NONE")) {
    return { excluded: true, reason: `reserved/human-gated (externalEffect=${effect}, external=${external}, human=${human}) — not ODG-autonomous` };
  }
  return { eligible: true, authorized: true, basis: `internal technical (externalEffect=NONE, actionClass=${c.actionClass || "?"})` };
}

function stampObjectives(objectives: any): any[] {
  return (Array.isArray(objectives) ? objectives : []).map((o: any) => {
    const has = o && o.authorization && typeof o.authorization === "object" && !Array.isArray(o.authorization);
    return has ? o : Object.assign({}, o, { authorization: declareAuthorization(o) });
  });
}

module.exports = { declareAuthorization, stampObjectives };
export {};
