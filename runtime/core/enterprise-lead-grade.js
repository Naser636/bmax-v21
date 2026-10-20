/**
 * enterprise-lead-grade — PURE evidence-grader for high-ticket opportunities (§3 verification + §4 anti-scam of
 * HIGH_TICKET_ENTERPRISE_CONTRACT_ENGINE). Maps verifiable evidence about ONE opportunity to a grade. It invents
 * nothing: a grade reflects ONLY the evidence flags the caller supplies (each must come from a real source).
 *
 * Grades (mandate §3): A = explicit current need + strong sources; B = convergent clues, probable need;
 * C = theoretical fit only; REJECTED = unverifiable / fraud-suspected / contradictory (§4 anti-scam overrides all).
 * A budget that is merely estimated is NEVER treated as confirmed; a targeted company is NEVER an acquired buyer.
 */

const GRADES = { A: "A", B: "B", C: "C", REJECTED: "REJECTED" };

/**
 * ev: {
 *   existenceVerified:bool (official registry/site), needEvidence:"explicit"|"convergent"|"theoretical"|"none",
 *   budget:"published"|"qualified-estimate"|"unknown", decisionMakerIdentified:bool,
 *   contradictions:bool (registry vs site vs contact mismatch), scamFlags:string[] (prepay, guaranteed gains,
 *   impersonation, fake PO, pressure, illegal ask, unverifiable identity)
 * }
 */
function gradeLead(ev) {
  const e = ev && typeof ev === "object" ? ev : {};
  const scam = Array.isArray(e.scamFlags) ? e.scamFlags.filter(Boolean) : [];
  // §4 anti-scam overrides everything.
  if (scam.length > 0) return mk(GRADES.REJECTED, "scam/risk flag(s): " + scam.join(", "), scam);
  if (e.contradictions === true) return mk(GRADES.REJECTED, "contradictory evidence (registry/site/contact mismatch)", scam);
  if (e.existenceVerified !== true) return mk(GRADES.C, "existence not verified in an official source ⇒ cannot grade above C", scam);

  const need = e.needEvidence;
  const budgetKnown = e.budget === "published" || e.budget === "qualified-estimate";
  if (need === "explicit" && budgetKnown && e.decisionMakerIdentified === true) {
    return mk(GRADES.A, "explicit current need + budget (" + e.budget + ") + identifiable buyer", scam);
  }
  if (need === "explicit" || need === "convergent") {
    return mk(GRADES.B, "probable need (" + need + " signals)" + (budgetKnown ? ", budget " + e.budget : ", budget unknown"), scam);
  }
  if (need === "theoretical") return mk(GRADES.C, "theoretical fit only (no observed need)", scam);
  return mk(GRADES.C, "no need evidence ⇒ not actionable above C", scam);
}

function mk(grade, reason, scamFlags) {
  return {
    grade,
    reason,
    scamFlags,
    // Honest guards the caller must respect downstream.
    isAcquiredBuyer: false,            // a graded lead is NEVER a confirmed buyer
    budgetConfirmed: false,            // a published/estimated budget is NEVER a signed contract value
    actionable: grade === GRADES.A || grade === GRADES.B,
  };
}

module.exports = { gradeLead, GRADES };
