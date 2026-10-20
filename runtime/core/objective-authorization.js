/**
 * objective-authorization — CM-5: PURE governance-mapped authorization stamper for mission-plan objectives
 * (ODG_TOOL_EXCELLENCE... Lot A / §X.9). Produces the `authorization` declaration that
 * `autonomy-measure.eligibilityFromObjectives` requires, so a LIVE autonomy score can become MEASURABLE when a
 * REAL mission's objectives carry it. REUSES the existing governance classifier `nl-objective-gateway.classifyObjective`
 * (externalEffect / requiresExternal / requiresHuman). Creates NO new primitive and NO second classifier.
 *
 * ANTI-INFLATION (hard rule, the whole point of CM-5): an objective that is reserved / external / human-gated is
 * NEVER declared eligible — it is `{excluded:true, reason}`, regardless of any caller wish. Only a purely-internal
 * technical objective within ODG's authorized scope (externalEffect NONE, no external, no human) ⇒
 * `{eligible:true, authorized:true}`. An unclassifiable objective fails CLOSED to excluded (never defaulted eligible).
 * This prevents gaming the autonomy score by mislabelling a reserved objective as autonomous.
 */
const gw = require("./nl-objective-gateway.js");

/** Map ONE objective {id, goal} to its governance-grounded authorization declaration. Pure; fail-closed. */
function declareAuthorization(objective) {
  const o = objective && typeof objective === "object" ? objective : {};
  const goal = typeof o.goal === "string" ? o.goal : "";
  // Fail CLOSED: an empty/absent goal cannot be classified ⇒ never auto-eligible.
  if (goal.trim() === "") return { excluded: true, reason: "empty/absent goal — not auto-eligible (fail-closed)" };
  let c = null;
  try { c = gw.classifyObjective(goal); } catch { c = null; }
  if (!c || typeof c !== "object") {
    return { excluded: true, reason: "unclassifiable objective — not auto-eligible (fail-closed)" };
  }
  const external = c.requiresExternal === true;
  const human = c.requiresHuman === true;
  const effect = typeof c.externalEffect === "string" ? c.externalEffect : "UNKNOWN";
  // RESERVED / external / human-gated / any non-NONE external effect ⇒ excluded (NEVER eligible).
  if (external || human || (effect !== "NONE")) {
    return { excluded: true, reason: `reserved/human-gated (externalEffect=${effect}, external=${external}, human=${human}) — not ODG-autonomous` };
  }
  // Purely internal technical, within ODG's authorized scope ⇒ eligible + authorized.
  return { eligible: true, authorized: true, basis: `internal technical (externalEffect=NONE, actionClass=${c.actionClass || "?"})` };
}

/**
 * Stamp `authorization` on each objective that lacks one (an EXISTING human/governance declaration is PRESERVED,
 * never overwritten). Returns new objects (no mutation). Ready to feed eligibilityFromObjectives.
 */
function stampObjectives(objectives) {
  return (Array.isArray(objectives) ? objectives : []).map((o) => {
    const has = o && o.authorization && typeof o.authorization === "object" && !Array.isArray(o.authorization);
    return has ? o : Object.assign({}, o, { authorization: declareAuthorization(o) });
  });
}

module.exports = { declareAuthorization, stampObjectives };
