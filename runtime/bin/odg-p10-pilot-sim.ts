#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V54 — P10 AI-GOVERNANCE SECOND-PILOT INTERNAL SIMULATION (READINESS ONLY). Runs ONE complete synthetic
 * AI-governance audit parcours over a SYNTHETIC portfolio of AI systems (clearly labelled; no client data) by composing
 * ODG's EXISTING P10 guard (ai-assurance-assessment.assessAISystem — AI-Act role classification + fail-closed control
 * assessment, INSUFFICIENT_EVIDENCE never PASS, NOT a certification), the AI-Act in-force date mapper (ai-act-in-force —
 * dates are INJECTED DATA, register-silent ⇒ UNKNOWN_DATE, fail-closed), and the shared O1 report + O2 evidence layers.
 * Every finding/classification/date is SIMULATED on synthetic input — NEVER an observed fact, NEVER a certification, NEVER
 * legal advice. E4 rehearsal; E5 = NOT_STARTED. No new engine, no parallel registry. Run: `odg-p10-pilot-sim.ts [out]`.
 */

const ASSURE = require("../core/ai-assurance-assessment.js");
const INFORCE = require("../core/ai-act-in-force.js");
const O1 = require("../core/shared-report-generator.js");
const O2 = require("../core/shared-evidence-wrapper.js");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "..", "..", "docs", "odg", "demonstrators", "P10_AI_GOVERNANCE_PILOT_SIM.json");
function nowIso(): string { return new Date().toISOString(); }
const AS_OF = "2026-11-10";   // injected assessment date (no live clock used in the regulatory logic)

// ── Requirement-type taxonomy (the directive's mandatory distinction). Deterministic classification; never "certified". ──
const REQ = Object.freeze({ LEGAL: "LEGAL_OBLIGATION", COND: "CONDITIONAL_REQUIREMENT", GOOD: "GOOD_PRACTICE", RECO: "RECOMMENDATION", HYP: "HYPOTHESIS", LEGAL_EXPERTISE: "NEEDS_LEGAL_EXPERTISE" });

// ── STEP 1 — SYNTHETIC portfolio (clearly labelled). 3 AI systems with DECLARED (not verified) activities. ──
const SYNTHETIC = true;
const portfolio = [
  { id: "sys-cv-screener", name: "CV screening assistant", intendedUse: "rank job applicants",
    profile: { tenantId: "demo-tenant", targetFrameworks: ["EU-AI-ACT", "ISO-42001"], aiSystems: ["sys-cv-screener"] },
    activities: { usesAiSystemUnderOwnAuthority: true, employmentScreening: true } },
  { id: "sys-support-chatbot", name: "Customer-support chatbot", intendedUse: "answer customer questions",
    profile: { tenantId: "demo-tenant", targetFrameworks: ["EU-AI-ACT", "GDPR"], aiSystems: ["sys-support-chatbot"] },
    activities: { usesAiSystemUnderOwnAuthority: true, systemInteractsWithHumans: true } },
  { id: "sys-marketing-gen", name: "Marketing content generator", intendedUse: "draft marketing copy & images",
    profile: { tenantId: "demo-tenant", targetFrameworks: ["EU-AI-ACT"], aiSystems: ["sys-marketing-gen"] },
    activities: { developsOrPlacesAiSystemUnderOwnName: true, generatesSyntheticContent: true } },
];

// injected AI-Act in-force register — DATES ARE DATA (repo-documented milestones; see ai-act-in-force header). A
// register-silent obligation stays UNKNOWN_DATE (fail-closed), demonstrating the honest timeline distinction.
function buildRegisterFor(activities: any): any {
  const cls = INFORCE.assessInForce({ activities, asOf: AS_OF, register: {} });   // first pass: discover obligation keys
  const reg: any = {};
  for (const row of cls.obligations) {
    const k = row.obligation;
    if (/Art\.50/i.test(k)) reg[k] = { applicableFrom: "2026-08-02", amendingRegulation: "AI-Act Art.50 (general application 2 Aug 2026)", access: "public-principle" };
    else if (/high-risk|risk tier|registration/i.test(k)) reg[k] = { applicableFrom: "2027-12-02", amendingRegulation: "Annex III high-risk, Omnibus-shifted 2 Dec 2027", access: "public-principle" };
    // else: deliberately silent ⇒ UNKNOWN_DATE (fail-closed, requires qualified legal confirmation)
  }
  return reg;
}

function classifyReq(group: string, status: string, inForceStatus: string | null): string {
  if (group === "ai-act") {
    if (inForceStatus === "IN_FORCE") return REQ.LEGAL;
    if (inForceStatus === "NOT_YET_IN_FORCE") return REQ.COND;
    return REQ.LEGAL_EXPERTISE;            // UNKNOWN_DATE / no automated test ⇒ qualified legal assessment required
  }
  if (group === "framework") return status === "FAIL" ? REQ.LEGAL : REQ.LEGAL_EXPERTISE;
  if (group === "supply-chain") return REQ.GOOD;
  return REQ.HYP;
}

// ── STEPS 2–6 per system: inventory → role classification → risk/controls → in-force mapping → gaps → remediation. ──
const assessed: any[] = [];
for (const system of portfolio) {
  const r = ASSURE.assessAISystem({ system, now: AS_OF });
  if (!r.ok) { assessed.push({ id: system.id, ok: false, code: r.code, reason: r.reason }); continue; }
  const a = r.assessment;
  const register = buildRegisterFor(system.activities);
  const inforce = INFORCE.assessInForce({ activities: system.activities, asOf: AS_OF, register });
  // link each ai-act control to its in-force status by matching the obligation key family (Art.50 / high-risk / family slice).
  function inForceFor(ctrl: any): string | null {
    if (ctrl.group !== "ai-act") return null;
    const rows = inforce.obligations;
    if (/:art50/i.test(ctrl.id)) { const r = rows.find((x: any) => /Art\.50/i.test(x.obligation)); return r ? r.status : null; }
    // control id is `ai-act:<ROLE>:<family-slice>`; match the family slice against the obligation keys.
    const slice = String(ctrl.id).split(":").slice(2).join(":").toLowerCase();
    if (slice) { const r = rows.find((x: any) => x.obligation.toLowerCase().startsWith(slice.slice(0, 16))); if (r) return r.status; }
    const hr = rows.find((x: any) => /high-risk|risk tier|registration/i.test(x.obligation));
    return hr ? hr.status : null;
  }
  const controls = (a.controls || []).map((c: any) => {
    const ifs = inForceFor(c);
    return { id: c.id, group: c.group, status: c.status, detail: c.detail, inForce: ifs, requirementType: classifyReq(c.group, c.status, ifs) };
  });
  const gaps = controls.filter((c: any) => c.status === "INSUFFICIENT_EVIDENCE" || c.status === "FAIL");
  assessed.push({ id: system.id, name: system.name, ok: true,
    roles: a.aiAct.roles, overall: a.overall, certificationStatus: a.certificationStatus,
    controlCount: controls.length, controls, tally: a.tally,
    inForce: inforce.summary, inForceRows: inforce.obligations,
    gaps: gaps.map((g: any) => ({ id: g.id, requirementType: g.requirementType, detail: g.detail })) });
}

// ── STEP: REFUSAL on insufficient data (missing tenantId) — the guard must NOT assess, never fake a PASS. ──
const refusal = ASSURE.assessAISystem({ system: { id: "sys-missing-profile", name: "undocumented system", activities: { usesAiSystemUnderOwnAuthority: true } }, now: AS_OF });
const refusedCorrectly = refusal.ok === false && typeof refusal.code === "string";

// ── Consolidate portfolio-level counts (SIMULATED — on synthetic declared activities). ──
const okSystems = assessed.filter((s) => s.ok);
const totalGaps = okSystems.reduce((n, s) => n + (s.gaps ? s.gaps.length : 0), 0);
const byReqType: any = {}; for (const s of okSystems) for (const c of s.controls) byReqType[c.requirementType] = (byReqType[c.requirementType] || 0) + 1;

// prioritized remediation plan (deterministic: LEGAL first, then CONDITIONAL, then NEEDS_LEGAL_EXPERTISE, then rest).
const order = [REQ.LEGAL, REQ.COND, REQ.LEGAL_EXPERTISE, REQ.GOOD, REQ.RECO, REQ.HYP];
const remediation: any[] = [];
for (const s of okSystems) for (const g of s.gaps) remediation.push({ system: s.id, requirementType: g.requirementType, action: `resolve: ${g.detail}` });
remediation.sort((x, y) => order.indexOf(x.requirementType) - order.indexOf(y.requirementType));
remediation.forEach((x, i) => { x.priority = i + 1; });

// ── STEP 8 — deliverable via shared O1 report (+O2 evidence). ──
const rep = O1.generateReport({
  metier: "P10", title: "AI Governance Audit — PILOT SIMULATION (synthetic portfolio)",
  status: `SIMULATION — ${okSystems.length} AI systems assessed, ${totalGaps} open control gaps; NOT_CERTIFIED, NOT legal advice`,
  summary: `Synthetic portfolio of ${portfolio.length} AI systems. Roles classified deny-by-default from DECLARED activities; ${totalGaps} controls are INSUFFICIENT_EVIDENCE/FAIL (open gaps). AI-Act obligations mapped to an INJECTED in-force register (dates = data; register-silent ⇒ UNKNOWN_DATE, fail-closed). Requirement types: ${Object.keys(byReqType).sort().map((k) => `${k}:${byReqType[k]}`).join(", ")}. Every result is SIMULATED on synthetic input — NOT observed, NOT a certification, NOT legal advice.`,
  controls: okSystems.flatMap((s) => s.controls.slice(0, 4).map((c: any) => ({ name: `${s.id}:${c.id}`, status: c.status, detail: `[${c.requirementType}] ${c.detail}` }))).slice(0, 16),
  findings: [
    ...okSystems.flatMap((s) => s.gaps.map((g: any) => ({ severity: g.requirementType === REQ.LEGAL ? "HIGH" : "MEDIUM", detail: `${s.id}: ${g.detail}`, basis: "SIMULATED" }))).slice(0, 10),
    { severity: refusedCorrectly ? "INFO" : "HIGH", detail: `insufficient-data case ⇒ ${refusedCorrectly ? `correctly REFUSED (${refusal.code}) — not assessed, no fake PASS` : "NOT refused (DEFECT)"}`, basis: "PROVEN" },
  ],
  recommendations: [
    "complete a manual/qualified legal assessment for every NEEDS_LEGAL_EXPERTISE obligation",
    "prepare Annex IV technical documentation for provider-role systems (reuse ai-act-annex-iv-completeness)",
    "confirm each AI-Act date against the authoritative text with qualified counsel (dates here are injected data)",
    "do NOT present this report as a certification, a legal opinion, or a compliance guarantee",
  ],
  limits: [
    "ALL inputs are SYNTHETIC — no client data; roles from DECLARED (declared-not-verified) activities",
    "INSUFFICIENT_EVIDENCE ≠ non-compliant and ≠ PASS — manual/qualified assessment required",
    "in-force dates are INJECTED DATA (repo-documented milestones); a register-silent obligation is UNKNOWN_DATE, never asserted in force",
    "NOT a certification, NOT legal advice, NOT a conformity guarantee; ODG prepares, an accredited body/qualified counsel decides",
    "ODG maturity L2 for P10; 0 paying clients; E5 (client-validated) = NOT_STARTED",
  ],
  evidence: [
    { claim: `${okSystems.length}/${portfolio.length} systems assessed; roles classified deny-by-default`, basis: "SIMULATED", sourceRef: path.basename(OUT) },
    { claim: `${totalGaps} open control gaps classified by requirement type`, basis: "SIMULATED", sourceRef: path.basename(OUT) },
    { claim: `insufficient-data input REFUSED (fail-closed, no fake PASS)`, basis: "PROVEN", sourceRef: path.basename(OUT) },
    { claim: `AI-Act in-force status from injected register; register-silent ⇒ UNKNOWN_DATE`, basis: "SIMULATED", sourceRef: path.basename(OUT) },
  ],
  validationConditions: [
    "re-run reproduces identical classifications/gaps from identical synthetic inputs (digest stable)",
    "evidence digest independently verifiable via O2.verifyEvidence",
    "before E5: real authorized client + real documented systems + qualified legal confirmation + documented client validation",
  ],
});

const verify = O2.verifyEvidence(rep.json.evidence);

const artifact = {
  "//": "CTO V54 — P10 AI-governance SECOND-PILOT internal simulation. SYNTHETIC portfolio. Classifications/gaps/dates SIMULATED — never observed, never a certification, never legal advice. E4 rehearsal; E5=NOT_STARTED. Reuses assessAISystem + ai-act-in-force + O1/O2; no new engine, no parallel registry.",
  demonstrator: "P10 AI Governance — second-pilot internal simulation (readiness only)",
  generatedAt: nowIso(), asOf: AS_OF, synthetic: SYNTHETIC,
  parcours: ["1 scope", "2 AI-system inventory", "3 use & responsibility classification", "4 risk analysis", "5 existing-control evaluation", "6 gap identification", "7 remediation plan", "8 O1 deliverable + O2 evidence", "9 independent controller review (external, owner-gated)"],
  requirementTaxonomy: REQ,
  systems: assessed,
  insufficientDataCase: { input: "system without profile.tenantId", refused: refusedCorrectly, code: refusal.code, reason: refusal.reason },
  portfolioSummary: { systems: portfolio.length, assessed: okSystems.length, openGaps: totalGaps, byRequirementType: byReqType },
  remediationPlan: remediation,
  independentEvidenceVerification: verify,
  regulatoryPosture: "NOT_CERTIFIED — ODG prepares readiness evidence; dates are injected data; a register-silent obligation is UNKNOWN_DATE; qualified legal expertise required for legal conclusions",
  e5Status: "NOT_STARTED — simulation only; no real client, no real systems, no client validation",
  report: rep.json,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");
fs.writeFileSync(OUT.replace(/\.json$/, ".md"), rep.markdown);
process.stdout.write(`=== P10 AI-governance PILOT SIMULATION written: ${OUT} (+ ${OUT.replace(/\.json$/, ".md")}) ===\n`);
process.stdout.write(JSON.stringify({ systems: portfolio.length, assessed: okSystems.length, openGaps: totalGaps, refusedInsufficientData: refusedCorrectly, byRequirementType: byReqType, reportOk: rep.ok, evidenceVerified: verify.ok, evidenceDigest: rep.json.evidence.integrity.digest, certified: false, e5: "NOT_STARTED" }, null, 2) + "\n");

export {};
