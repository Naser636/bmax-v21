#!/usr/bin/env node
"use strict";

/*
 * V16.6 §3–§4 — canonical SCOPED authorization + automatic, evidence-bound step validation.
 *
 * Owner (V166 §3): « Une autorisation préalable couvre automatiquement toutes les actions nécessaires et conformes à son
 * périmètre. » (§4): « Lorsqu'une étape satisfait ses critères objectifs : ODG la valide ; enregistre les preuves ; […]
 * met à jour les statuts ; sélectionne la prochaine étape. » — « Ne jamais déclarer PASS sans preuves suffisantes. »
 *
 * NOT a second authorization engine: it is a PURE derivation over (a) a contract's owner-declared `authorization` block
 * (docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json) and (b) committed evidence records. It never writes, never mints an
 * authorization, never rewrites the contract state: the derived scope is COMPUTED and reported (odg-go-cycle AUTHORIZE).
 * odg-go-cycle keeps the only execution path (intelligence-loop + mission-scheduler + isolation).
 *
 * Rules (each objective and evidence-bound):
 *   R0 owner first: `authorization.by` starts with "OWNER" AND `authorization.source` cites THE owner directive bound to
 *      that scenario (OWNER_SOURCES: G ⇒ V165, H ⇒ V168 / docs/odg/V168_OWNER_AUTHORIZATION_H.json, G2 ⇒ V170 /
 *      docs/odg/V170_OWNER_AUTHORIZATION_HG.json, J2 ⇒ V171 / docs/odg/V171_OWNER_AUTHORIZATION_PORTFOLIO.json, V175-NB1 and V175-NB2 ⇒
 *      V175 / docs/odg/V175_OWNER_AUTHORIZATION_NATIVE_BUILD.json, shared ONLY through the declared family V175-NATIVE-LOOP,
 *      J ⇒ V176 / docs/odg/V176_OWNER_AUTHORIZATION_J.json)
 *      and cites no other scenario's directive — else NOTHING is derived (ODG never self-authorizes; an authorization is never reused for
 *      another mission).
 *   R1 step sequence is fixed per scenario (G, H, G2, J2, V175-NB1, V175-NB2 and J: REVISE_CONTRACT → INSPECT_REVISED_CONTRACT → RUN_CONTROLLED_EXPERIMENTS →
 *      VALIDATE_CRITERIA). A step outside the sequence (provider spend, governance change, …) is NEVER derived.
 *   R2 REVISE_CONTRACT validated ⇔ the contract carries a revisionHistory entry with author, originalCriteria (non-empty),
 *      change, justification, and the WORK_ITEM_CONTRACT carries a preRegistration (metric, baseline, dataset,
 *      decisionRule, thresholds).
 *   R3 INSPECT_REVISED_CONTRACT validated ⇔ a committed inspection record with verdict ACCEPT, contractSha256 equal to
 *      contractSha256(CURRENT contract entry) (any later edit invalidates it), inspected PR head SHA (40 hex), same
 *      scenario, and DECLARED SESSION INDEPENDENCE: opaque `inspectorSessionId` and `authorSessionId` both present and
 *      distinct, with authorSessionId === the contract's revisionHistory[last].revisionAuthorSessionId (recorded by the
 *      revision, so the inspector cannot pick it). Wording of names is never compared. Evidence level is
 *      DECLARED_SESSION_INDEPENDENCE — declared ids, NOT cryptographic proof.
 *   R4 RUN_CONTROLLED_EXPERIMENTS becomes AUTHORIZED (derived) ⇔ R0 ∧ R2 ∧ R3 ∧ the owner's executionCondition is
 *      declared. It is VALIDATED (done — not PASS) ⇔ an experiment record bound to the same contractSha256 records an
 *      outcome; the outcome itself is never upgraded here.
 *   R5b VALIDATE_CRITERIA is VALIDATED only by a committed criteria-validation record (see validationValid) — the grade
 *      comes from that record, bounded by the experiment outcome (never upgraded).
 *   R5 VALIDATE_CRITERIA is authorized once the experiments are validated; it is NEVER auto-graded here (grading needs
 *      an independent inspection of the experiment result — not defined by V166).
 *   R6 executionAuthorized ⇔ the CURRENT step is an execution step AND authorized. Everything else is provider/docs work.
 *   R7 (V16.9 Phase 1b, proof currency — addendum §22 "fraîcheur" / "lien avec le commit et le contrat"): an inspection,
 *      experiment or criteria-validation record validates its step only if odg-observation-currency.assessEvidenceCurrency
 *      over the injected probes (evidence.probes — local git + file hashes, injected by the loaders) says usableAsProof:
 *      every cited commit exists in local git and is an ancestor of main (a well-formed but non-existent inspectedHeadSha
 *      ⇒ WRONG_COMMIT ⇒ refused), no decisive citation (contract entry, dataset, graded experiment file) is STALE, and the
 *      inspection's head was actually VERIFIED. No probe injected ⇒ not verifiable ⇒ refused (fail-closed, never assumed).
 */

const crypto = require("crypto");
const OCUR = require("./odg-observation-currency.js");   // V16.9 Phase 1b — evidence currency + commit binding (composed)

const STEP_SEQUENCES: any = Object.freeze({
  G: Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
  // V16.8 (owner V168, docs/odg/V168_OWNER_AUTHORIZATION_H.json): H follows exactly the same evidence-bound sequence
  H: Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
  // V17.2: NEW, distinct experiments (new ids; G, H and J and their records stay untouched) — same evidence-bound sequence.
  // G2 ⇐ owner V170 (docs/odg/V170_OWNER_AUTHORIZATION_HG.json, G clause); J2 ⇐ owner V171 (docs/odg/V171_OWNER_AUTHORIZATION_PORTFOLIO.json).
  G2: Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
  J2: Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
  // V17.5 — V175-NB1 (first ODG-native build) ⇐ owner V175 (docs/odg/V175_OWNER_AUTHORIZATION_NATIVE_BUILD.json): same sequence.
  "V175-NB1": Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
  // V17.5 NB2 — V175-NB2 (ODG designs the change) ⇐ the SAME owner V175 record (« développer et tester la boucle d'ingénierie
  // native d'ODG » / « modifier les composants et contrats internes concernés »): same sequence, its own inspection record.
  "V175-NB2": Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
  // V17.6 — J itself (owner V176 « DÉBLOCAGE FINAL » item 2, docs/odg/V176_OWNER_AUTHORIZATION_J.json): same evidence-bound
  // sequence; J's prior result (V161_SCENARIO_J.json) and J2 (CLOSED_FAIL) are untouched.
  J: Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
  // V17.6 NB3 — V176-NB3 (NB2's target + oracle with the DIV-1 repair-diversity lever) ⇐ owner record
  // docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json (« y compris NB3 »): same evidence-bound sequence.
  "V176-NB3": Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
  // V17.6 — F (multi-agents / GO parallel waves) ⇐ the SAME owner build-missions record (« y compris NB3, les vagues GO
  // parallèles […] »): same evidence-bound sequence.
  F: Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
  // V17.8 — V178-P1 / V178-P2 (Radar-proposal contracts, batch V178-RADAR-1) ⇐ owner record docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json
  // (« la conversion des propositions Radar en contrats »): same evidence-bound sequence.
  "V178-P1": Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
  "V178-P2": Object.freeze(["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"]),
});
const EXECUTION_STEPS = Object.freeze(["RUN_CONTROLLED_EXPERIMENTS"]);
const STEP_KIND: any = Object.freeze({
  REVISE_CONTRACT: "PROVIDER_DOCS_WORK",
  INSPECT_REVISED_CONTRACT: "INDEPENDENT_INSPECTION",
  RUN_CONTROLLED_EXPERIMENTS: "EXECUTION",
  VALIDATE_CRITERIA: "GRADING",
});
const INDEPENDENCE_LEVEL = "DECLARED_SESSION_INDEPENDENCE";   // declared opaque session ids — NOT cryptographic
/* MECH-1 (owner decision docs/odg/V178_OWNER_DECISION_MECHANICAL_NEGATIVE_VALIDATION.json, 2026-11-25) — a NARROW R5b
 * exception: a deterministic mechanical verifier may stand in for the distinct-session inspection ONLY to validate the
 * recording of a NEGATIVE result (experiment outcome FAIL or NOT_MEASURED, scenarioGrade EQUAL to it). It never grades
 * PASS/PARTIAL, never certifies success, never replaces an inspection for a positive result, and leaves every other R5b
 * condition (contract sha, experiment sha, grade bound, R7 currency) unchanged. */
const MECH_KIND = "MECHANICAL_VERIFIER";
const MECH_OWNER_RECORD = "docs/odg/V178_OWNER_DECISION_MECHANICAL_NEGATIVE_VALIDATION.json";
const MECH_NEGATIVE_GRADES = Object.freeze(["FAIL", "NOT_MEASURED"]);
const MECH_REQUIRED_CHECKS = Object.freeze(["RAW_DATA", "RECOMPUTE", "IDS_TRACES", "CONTRACT_LIMITS", "PROVENANCE", "REGISTER_CONSISTENCY"]);
const MECH_INDEPENDENCE_LEVEL = "MECHANICAL_NEGATIVE_ONLY";   // deterministic re-computation — NOT an independent inspection
/* R0 — the owner directive bound to each scenario. An authorization source must cite ITS scenario's directive and no
 * other scenario's (so the V165 authorization of G can never cover H, nor the V168 authorization of H cover G). */
const OWNER_SOURCES: any = Object.freeze({
  G: Object.freeze({ re: /V165/, label: "V165 (docs/odg/V165_OWNER_AUTHORIZATION.json)" }),
  H: Object.freeze({ re: /V168_OWNER_AUTHORIZATION_H\.json/, label: "V168 (docs/odg/V168_OWNER_AUTHORIZATION_H.json)" }),
  // V17.2 — each new experiment is bound to exactly one owner record; the regexes are disjoint from G's /V165/ and H's
  // V168 path, so neither record can ever cover another scenario (foreign-citation check below).
  G2: Object.freeze({ re: /V170_OWNER_AUTHORIZATION_HG\.json/, label: "V170 (docs/odg/V170_OWNER_AUTHORIZATION_HG.json)" }),
  J2: Object.freeze({ re: /V171_OWNER_AUTHORIZATION_PORTFOLIO\.json/, label: "V171 (docs/odg/V171_OWNER_AUTHORIZATION_PORTFOLIO.json)" }),
  "V175-NB1": Object.freeze({ re: /V175_OWNER_AUTHORIZATION_NATIVE_BUILD\.json/, label: "V175 (docs/odg/V175_OWNER_AUTHORIZATION_NATIVE_BUILD.json)", family: "V175-NATIVE-LOOP" }),
  // V17.5 NB2: bound to the SAME V175 record through an EXPLICIT shared family (the record authorizes the native-engineering
  // LOOP, not one item). Only scenarios declared in the same family may share a record; every other pair stays disjoint.
  "V175-NB2": Object.freeze({ re: /V175_OWNER_AUTHORIZATION_NATIVE_BUILD\.json/, label: "V175 (docs/odg/V175_OWNER_AUTHORIZATION_NATIVE_BUILD.json)", family: "V175-NATIVE-LOOP" }),
  // V17.6 — J bound to its OWN dedicated record (disjoint from J2's V171 record: J2's authorization never covers J, nor J's J2).
  J: Object.freeze({ re: /V176_OWNER_AUTHORIZATION_J\.json/, label: "V176 (docs/odg/V176_OWNER_AUTHORIZATION_J.json)" }),
  // V17.6 NB3 — bound EXCLUSIVELY to the V176 build-missions record (never NB1/NB2's V175 record: citing it is a foreign
  // citation of the V175-NATIVE-LOOP family, refused — that family stays exactly {V175-NB1, V175-NB2}). The record covers
  // several internal missions (F / parallel GO waves, V176-NB3, Radar-proposal contracts), so it is declared as the family
  // V176-BUILD-MISSIONS: another mission may share it ONLY by declaring the same family here (explicit, reviewed).
  "V176-NB3": Object.freeze({ re: /V176_OWNER_AUTHORIZATION_BUILD_MISSIONS\.json/, label: "V176 build missions (docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json)", family: "V176-BUILD-MISSIONS" }),
  // V17.6 — F joins the declared family V176-BUILD-MISSIONS explicitly (the record names « les vagues GO parallèles »): F shares
  // the record ONLY with the family's members (V176-NB3); every other scenario citing it is refused, and F citing any other
  // scenario's record (J, J2, V175 …) is refused.
  F: Object.freeze({ re: /V176_OWNER_AUTHORIZATION_BUILD_MISSIONS\.json/, label: "V176 build missions (docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json)", family: "V176-BUILD-MISSIONS" }),
  // V17.8 — the two bound Radar-proposal contracts join the declared family V176-BUILD-MISSIONS explicitly (the record names « la
  // conversion des propositions Radar en contrats »). P3–P7 stay PROPOSED and unbound (no entry ⇒ nothing derived for them).
  "V178-P1": Object.freeze({ re: /V176_OWNER_AUTHORIZATION_BUILD_MISSIONS\.json/, label: "V176 build missions (docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json)", family: "V176-BUILD-MISSIONS" }),
  "V178-P2": Object.freeze({ re: /V176_OWNER_AUTHORIZATION_BUILD_MISSIONS\.json/, label: "V176 build missions (docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json)", family: "V176-BUILD-MISSIONS" }),
});
function ownerSourceCheck(scenario: string, source: string): any {
  const own = OWNER_SOURCES[scenario];
  if (!own) return { ok: false, reason: `no owner directive is bound to scenario ${scenario}` };
  if (!own.re.test(source)) return { ok: false, reason: `authorization.source does not cite the owner directive ${own.label} bound to scenario ${scenario}` };
  const foreign = Object.keys(OWNER_SOURCES).filter((k) => k !== scenario && OWNER_SOURCES[k].re.test(source) && !(own.family && OWNER_SOURCES[k].family === own.family));
  if (foreign.length) return { ok: false, reason: `authorization.source cites the owner directive of scenario ${foreign.join(", ")} — an authorization is never reused for another mission` };
  return { ok: true };
}
const SHA40 = /^[0-9a-f]{40}$/;

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function str(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
/* canonical JSON: keys sorted recursively, undefined dropped, no whitespace (same as odg-go-cycle.canon). */
function canon(v: any): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
}
/* contractSha256(entry) = sha256 hex of canon(the WHOLE contracts[scenario=X] entry). */
function contractSha256(entry: any): string { return crypto.createHash("sha256").update(canon(entry)).digest("hex"); }
function freeze(o: any): any { return Object.freeze(o); }

function ownerAuthorization(contract: any): any {
  const a = contract && isObj(contract.authorization) ? contract.authorization : null;
  if (!a) return { ok: false, reason: "no authorization block on the contract" };
  if (!str(a.by) || !String(a.by).trim().toUpperCase().startsWith("OWNER")) return { ok: false, reason: `authorization.by '${a.by}' is not an OWNER authorization — ODG never self-authorizes` };
  if (!str(a.source)) return { ok: false, reason: "authorization.source missing" };
  const src = ownerSourceCheck(String(contract.scenario), String(a.source));
  if (!src.ok) return { ok: false, reason: src.reason };
  return { ok: true, by: String(a.by), source: String(a.source), scope: arr(a.scope).map(String), executionAuthorized: a.executionAuthorized === true, executionCondition: str(a.executionCondition) ? String(a.executionCondition) : null };
}

function lastRevision(contract: any): any { const h = arr(contract && contract.revisionHistory); return h.length ? h[h.length - 1] : null; }

function revisionValid(contract: any): any {
  const rev = lastRevision(contract);
  if (!isObj(rev)) return { ok: false, reason: "no revisionHistory entry" };
  if (!str(rev.author)) return { ok: false, reason: "revision has no author" };
  if (!arr(rev.originalCriteria).length) return { ok: false, reason: "revision does not record the ORIGINAL criteria verbatim" };
  if (!str(rev.change) && !arr(rev.change).length) return { ok: false, reason: "revision does not record the change" };
  if (!str(rev.justification)) return { ok: false, reason: "revision has no justification" };
  const w = contract && isObj(contract.WORK_ITEM_CONTRACT) ? contract.WORK_ITEM_CONTRACT : null;
  const pr = w && isObj(w.preRegistration) ? w.preRegistration : null;
  if (!pr) return { ok: false, reason: "WORK_ITEM_CONTRACT.preRegistration missing" };
  for (const k of ["metric", "baseline", "dataset", "decisionRule", "thresholds"]) if (pr[k] === undefined || pr[k] === null || pr[k] === "") return { ok: false, reason: `preRegistration.${k} missing` };
  if (!str(rev.revisionAuthorSessionId)) return { ok: false, reason: "revision has no revisionAuthorSessionId (opaque id binding the author session)" };
  return { ok: true, author: String(rev.author), authorSessionId: String(rev.revisionAuthorSessionId), evidence: { revisionDate: rev.date || null, author: String(rev.author), originalCriteriaCount: arr(rev.originalCriteria).length } };
}

const SESSION_ID = /^[A-Za-z0-9._:-]{8,128}$/;
/* R7 — proof currency of a committed record (composed: odg-observation-currency). */
function currencyOf(rec: any, probes: any, sha: string, requireCommitBinding: boolean): any {
  const r: any = { ...(isObj(rec) ? rec : {}) }; delete r.recordPath;
  return OCUR.assessEvidenceCurrency(r, probes, { currentContractSha256: sha, requireCommitBinding });
}
/* the verdict is attached NON-ENUMERABLY: readable by callers (evidence.proofCurrency) but never serialized, so records
 * that embed a derived scope (the G/H experiment runners' committed records) stay byte-identical (their --check). */
function withCurrency(evidence: any, c: any): any { Object.defineProperty(evidence, "proofCurrency", { value: Object.freeze(currencySummary(c)), enumerable: false }); return evidence; }
function currencySummary(c: any): any { return { status: c.status, usableAsProof: c.usableAsProof, counts: c.counts, blocking: c.blocking, rule: "R7 (odg-observation-currency.assessEvidenceCurrency)" }; }
function inspectionValid(contract: any, rec: any, revisionAuthorSessionId: string | null, sha: string, probes?: any): any {
  if (!isObj(rec)) return { ok: false, reason: "no committed inspection record" };
  if (str(rec.scenario) && String(rec.scenario) !== String(contract.scenario)) return { ok: false, reason: `inspection record is for scenario ${rec.scenario}, not ${contract.scenario}` };
  if (rec.verdict !== "ACCEPT") return { ok: false, reason: `inspection verdict ${rec.verdict === undefined ? "absent" : rec.verdict} ≠ ACCEPT` };
  if (rec.contractSha256 !== sha) return { ok: false, reason: `inspection contractSha256 ${rec.contractSha256} ≠ current contract sha256 ${sha} (contract edited after inspection, or wrong contract)` };
  const ins = rec.inspectorSessionId, aut = rec.authorSessionId;
  if (!str(ins) || !SESSION_ID.test(String(ins))) return { ok: false, reason: "inspection record lacks an opaque inspectorSessionId (not independent)" };
  if (!str(aut) || !SESSION_ID.test(String(aut))) return { ok: false, reason: "inspection record lacks the authorSessionId (not independent)" };
  if (!revisionAuthorSessionId || String(aut) !== revisionAuthorSessionId) return { ok: false, reason: "authorSessionId does not equal the revisionAuthorSessionId recorded in the contract (not independent)" };
  if (String(ins) === String(aut)) return { ok: false, reason: "inspectorSessionId equals authorSessionId (not independent)" };
  const head = String(rec.inspectedHeadSha || "");
  if (!SHA40.test(head)) return { ok: false, reason: "inspection record lacks the inspected PR head SHA (40 hex)" };
  const cur = currencyOf(rec, probes, sha, true);
  if (!cur.usableAsProof) return { ok: false, currency: currencySummary(cur), reason: `R7 proof currency ${cur.status}: ${cur.reason}` };
  return { ok: true, evidence: withCurrency({ inspector: str(rec.inspector) ? String(rec.inspector) : null, inspectorSessionId: String(ins), authorSessionId: String(aut), independenceLevel: INDEPENDENCE_LEVEL, verdict: "ACCEPT", contractSha256: sha, inspectedHeadSha: head, inspectedPr: rec.inspectedPr || null, recordPath: rec.recordPath || null }, cur) };
}

function experimentValid(rec: any, sha: string, probes?: any): any {
  if (!isObj(rec)) return { ok: false, reason: "no committed experiment record" };
  if (rec.contractSha256 !== sha) return { ok: false, reason: "experiment record not bound to the current contract sha256" };
  if (!["PASS", "PARTIAL", "FAIL", "NOT_MEASURED"].includes(rec.outcome)) return { ok: false, reason: "experiment record has no recorded outcome" };
  const cur = currencyOf(rec, probes, sha, false);
  if (!cur.usableAsProof) return { ok: false, currency: currencySummary(cur), reason: `R7 proof currency ${cur.status}: ${cur.reason}` };
  return { ok: true, evidence: withCurrency({ outcome: rec.outcome, contractSha256: sha, note: "step DONE with its recorded outcome — the outcome is not graded or upgraded here" }, cur) };
}

/* experimentSha256(rec) = sha256 of canon(the experiment record without the reader-added `recordPath`). */
function experimentSha256(rec: any): string { const r: any = { ...(isObj(rec) ? rec : {}) }; delete r.recordPath; return crypto.createHash("sha256").update(canon(r)).digest("hex"); }
const GRADE_RANK: any = Object.freeze({ NOT_MEASURED: 0, FAIL: 1, PARTIAL: 2, PASS: 3 });
/* R5b — VALIDATE_CRITERIA validated ⇔ a committed criteria-validation record bound to the current contract sha256 AND to
 * the exact experiment record (experimentSha256), citing an independent inspection of the experiment result with
 * verdict ACCEPT and distinct declared session ids, whose scenarioGrade never exceeds the experiment outcome
 * (no upgrade; NOT_MEASURED only if the experiment is NOT_MEASURED). Grading is NOT done here — the record is. */
/* MECH-1 — the mechanical stand-in: negative outcome only, grade EQUAL to the outcome, verdict CONSISTENT, bound to the
 * same experiment sha, every required check present and ok, the recomputed outcome equal to the recorded one, and a
 * reproduction command + verifier path recorded (the trace is the committed verification record it cites). */
function mechanicalNegativeValid(rec: any, ei: any, xs: string, experiment: any): any {
  const o = experiment && experiment.outcome;
  if (!MECH_NEGATIVE_GRADES.includes(o)) return { ok: false, reason: `MECH-1: mechanical validation applies only to a NEGATIVE outcome (FAIL/NOT_MEASURED), not ${o} — a positive result needs an independent inspection ACCEPT` };
  if (rec.scenarioGrade !== o) return { ok: false, reason: `MECH-1: scenarioGrade ${rec.scenarioGrade} must EQUAL the experiment outcome ${o}` };
  if (ei.verdict !== "CONSISTENT") return { ok: false, reason: "MECH-1: mechanical verifier verdict is not CONSISTENT" };
  if (ei.ownerRecord !== MECH_OWNER_RECORD) return { ok: false, reason: `MECH-1: must cite the owner record ${MECH_OWNER_RECORD}` };
  if (ei.experimentSha256 !== xs) return { ok: false, reason: "MECH-1: mechanical verification not bound to the current experiment record" };
  if (!str(ei.verifier) || !str(ei.reproduce) || !str(ei.verificationRecord)) return { ok: false, reason: "MECH-1: verifier path, reproduction command and verification record are required" };
  const checks = arr(ei.checks);
  const missing = MECH_REQUIRED_CHECKS.filter((id) => !checks.some((c: any) => isObj(c) && c.id === id && c.ok === true));
  if (missing.length) return { ok: false, reason: `MECH-1: required mechanical checks missing or not ok: ${missing.join(", ")}` };
  if (!isObj(ei.recomputed) || ei.recomputed.outcome !== o) return { ok: false, reason: "MECH-1: recomputed outcome differs from the recorded outcome" };
  return { ok: true };
}

function validationValid(rec: any, sha: string, experiment: any, probes?: any): any {
  if (!isObj(rec)) return { ok: false, reason: "no committed criteria-validation record" };
  if (rec.contractSha256 !== sha) return { ok: false, reason: "criteria-validation record not bound to the current contract sha256" };
  const xs = experimentSha256(experiment);
  if (!isObj(rec.experimentEvidence) || rec.experimentEvidence.experimentSha256 !== xs) return { ok: false, reason: `criteria-validation record not bound to the current experiment record (experimentSha256 ${xs.slice(0, 12)})` };
  const ei = rec.experimentInspection;
  const mech = isObj(ei) && ei.kind === MECH_KIND;
  if (mech) { const m = mechanicalNegativeValid(rec, ei, xs, experiment); if (!m.ok) return m; }
  else {
  if (!isObj(ei) || ei.verdict !== "ACCEPT") return { ok: false, reason: "experiment result lacks an independent inspection ACCEPT" };
  if (!str(ei.inspectorSessionId) || !str(ei.authorSessionId) || !SESSION_ID.test(String(ei.inspectorSessionId)) || !SESSION_ID.test(String(ei.authorSessionId)) || String(ei.inspectorSessionId) === String(ei.authorSessionId)) return { ok: false, reason: "experiment inspection lacks distinct declared session ids (not independent)" };
  }
  const g = rec.scenarioGrade, o = experiment.outcome;
  if (!(g in GRADE_RANK) || !(o in GRADE_RANK)) return { ok: false, reason: "scenarioGrade or experiment outcome not a recognised grade" };
  if (GRADE_RANK[g] > GRADE_RANK[o]) return { ok: false, reason: `scenarioGrade ${g} exceeds the experiment outcome ${o} (upgrade refused)` };
  if (g === "NOT_MEASURED" && o !== "NOT_MEASURED") return { ok: false, reason: "NOT_MEASURED grade on a measured experiment" };
  const cur = currencyOf(rec, probes, sha, false);
  if (!cur.usableAsProof) return { ok: false, currency: currencySummary(cur), reason: `R7 proof currency ${cur.status}: ${cur.reason}` };
  return { ok: true, evidence: withCurrency({ scenarioGrade: g, experimentOutcome: o, experimentSha256: xs, inspectorSessionId: mech ? null : String(ei.inspectorSessionId), independenceLevel: mech ? MECH_INDEPENDENCE_LEVEL : INDEPENDENCE_LEVEL, ...(mech ? { mechanicalVerifier: String(ei.verifier), rule: "MECH-1" } : {}), note: "VALIDATE_CRITERIA DONE with the recorded grade — never upgraded here" }, cur) };
}

/*
 * deriveAuthorizationScope(contract, evidence) → frozen
 *   { applicable, scenario, contractSha256, experimentSha256, owner, sequence, authorizedSteps, derivedSteps, validatedSteps:[{step,evidence}],
 *     currentStep, currentStepKind, currentStepAuthorized, nextStep, nextStepAuthorized, executionAuthorized, reason, selfAuthorized:false }
 * evidence = { inspection?: record|null, experiment?: record|null, validation?: record|null, probes?: R7 probes
 *   (odg-observation-currency.localGitProbes — injected by the loader; absent ⇒ no record can validate a step) }.
 */
function deriveAuthorizationScope(contract: any, evidence?: any): any {
  const ev = isObj(evidence) ? evidence : {};
  const none = (reason: string, extra: any = {}) => freeze({ applicable: false, scenario: contract && contract.scenario != null ? String(contract.scenario) : null, authorizedSteps: freeze([]), derivedSteps: freeze([]), validatedSteps: freeze([]), currentStep: null, nextStep: null, executionAuthorized: false, reason, selfAuthorized: false, ...extra });
  if (!isObj(contract)) return none("no contract");
  if (!isObj(contract.authorization)) return none("contract has no scoped authorization block (plain state semantics apply)");
  const owner = ownerAuthorization(contract);
  if (!owner.ok) return none(`R0: ${owner.reason}`);
  const seq: string[] | undefined = STEP_SEQUENCES[String(contract.scenario)];
  if (!seq) return none(`R1: no declared step sequence for scenario ${contract.scenario}`);
  const sha = contractSha256(contract);

  const explicit = owner.scope.filter((s: string) => seq.includes(s) && (!EXECUTION_STEPS.includes(s) || owner.executionAuthorized));
  const authorized = new Set<string>(explicit);
  const derived: any[] = [];
  const validated: any[] = [];

  const rev = revisionValid(contract);
  if (rev.ok) validated.push({ step: "REVISE_CONTRACT", evidence: rev.evidence });
  const insp = rev.ok ? inspectionValid(contract, ev.inspection, rev.authorSessionId, sha, ev.probes) : { ok: false, reason: "revision not complete (R2) — inspection cannot validate" };
  if (insp.ok) validated.push({ step: "INSPECT_REVISED_CONTRACT", evidence: insp.evidence });
  if (rev.ok && insp.ok && owner.executionCondition && !authorized.has("RUN_CONTROLLED_EXPERIMENTS")) {
    authorized.add("RUN_CONTROLLED_EXPERIMENTS");
    derived.push({ step: "RUN_CONTROLLED_EXPERIMENTS", rule: "R4", coveredBy: `${owner.by} — ${owner.source} (executionCondition: ${owner.executionCondition})`, basedOn: insp.evidence });
  }
  const exp = authorized.has("RUN_CONTROLLED_EXPERIMENTS") ? experimentValid(ev.experiment, sha, ev.probes) : { ok: false, reason: "experiments not authorized" };
  if (insp.ok && exp.ok) validated.push({ step: "RUN_CONTROLLED_EXPERIMENTS", evidence: exp.evidence });
  if (insp.ok && exp.ok && !authorized.has("VALIDATE_CRITERIA")) { authorized.add("VALIDATE_CRITERIA"); derived.push({ step: "VALIDATE_CRITERIA", rule: "R5", coveredBy: `${owner.by} — ${owner.source}` }); }
  const val = insp.ok && exp.ok ? validationValid(ev.validation, sha, ev.experiment, ev.probes) : { ok: false, reason: "experiments not validated" };
  if (val.ok) validated.push({ step: "VALIDATE_CRITERIA", evidence: val.evidence });

  const vset = new Set(validated.map((v) => v.step));
  const cur = seq.find((s) => !vset.has(s)) || null;
  const nxt = cur ? seq[seq.indexOf(cur) + 1] || null : null;
  const curAuth = !!cur && authorized.has(cur);
  const execAuth = !!cur && curAuth && EXECUTION_STEPS.includes(cur);
  const why = !cur ? "all steps validated"
    : cur === "REVISE_CONTRACT" ? `REVISE_CONTRACT not validated: ${rev.reason}`
    : cur === "INSPECT_REVISED_CONTRACT" ? `INSPECT_REVISED_CONTRACT pending: ${insp.reason} ⇒ RUN_CONTROLLED_EXPERIMENTS NOT authorized`
    : cur === "RUN_CONTROLLED_EXPERIMENTS" ? `inspection ACCEPT bound to contract ${sha.slice(0, 12)} ⇒ experiments AUTHORIZED by the owner's prior authorization (derived, R4); ${exp.reason}`
    : `VALIDATE_CRITERIA pending: ${val.reason} (R5b — needs a criteria-validation record bound to the contract + experiment and an independent inspection ACCEPT of the result; never auto-graded)`;
  return freeze({
    applicable: true, scenario: String(contract.scenario), contractSha256: sha, contractState: contract.state || null,
    owner: freeze({ by: owner.by, source: owner.source, declaredScope: freeze(owner.scope.slice()), executionAuthorizedDeclared: owner.executionAuthorized, executionCondition: owner.executionCondition }),
    sequence: freeze(seq.slice()), authorizedSteps: freeze(seq.filter((s) => authorized.has(s))), derivedSteps: freeze(derived), validatedSteps: freeze(validated),
    currentStep: cur, currentStepKind: cur ? STEP_KIND[cur] : null, currentStepAuthorized: curAuth, nextStep: nxt, nextStepAuthorized: !!nxt && authorized.has(nxt),
    executionAuthorized: execAuth, reason: why, independenceLevel: INDEPENDENCE_LEVEL, contractStateRewritten: false, selfAuthorized: false,
  });
}

/* isStepAuthorized(scope, step) — true only for a step of the declared sequence that is in authorizedSteps. */
function isStepAuthorized(scope: any, step: string): boolean {
  return !!scope && scope.applicable === true && arr(scope.sequence).includes(step) && arr(scope.authorizedSteps).includes(step);
}

const AUTHORIZATION_SCOPE_CONTRACT = Object.freeze({
  id: "V166-ODG-AUTHORIZATION-SCOPE",
  source: "owner directive V166 §3–§4 over V165 §1 (docs/odg/V165_OWNER_AUTHORIZATION.json#missionG); H: owner directive V168 (docs/odg/V168_OWNER_AUTHORIZATION_H.json); G2: owner directive V170 (docs/odg/V170_OWNER_AUTHORIZATION_HG.json); J2: owner directive V171 (docs/odg/V171_OWNER_AUTHORIZATION_PORTFOLIO.json); V175-NB1 + V175-NB2 (family V175-NATIVE-LOOP): owner directive V175 (docs/odg/V175_OWNER_AUTHORIZATION_NATIVE_BUILD.json); J: owner directive V176 (docs/odg/V176_OWNER_AUTHORIZATION_J.json); V176-NB3 + F (family V176-BUILD-MISSIONS): owner directive V176 build missions (docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json)",
  ownerSources: Object.freeze({ G: OWNER_SOURCES.G.label, H: OWNER_SOURCES.H.label, G2: OWNER_SOURCES.G2.label, J2: OWNER_SOURCES.J2.label, "V175-NB1": OWNER_SOURCES["V175-NB1"].label, "V175-NB2": OWNER_SOURCES["V175-NB2"].label, J: OWNER_SOURCES.J.label, "V176-NB3": OWNER_SOURCES["V176-NB3"].label, F: OWNER_SOURCES.F.label, "V178-P1": OWNER_SOURCES["V178-P1"].label, "V178-P2": OWNER_SOURCES["V178-P2"].label }),
  steps: STEP_SEQUENCES, executionSteps: EXECUTION_STEPS, stepKind: STEP_KIND,
  invariants: Object.freeze([
    "PURE derivation: no write, no contract-state rewrite, no authorization minted",
    "owner authorization (by OWNER…, source = the directive bound to the scenario: G ⇒ V165, H ⇒ V168, G2 ⇒ V170, J2 ⇒ V171, V175-NB1 / V175-NB2 ⇒ V175 (declared shared family), J ⇒ V176, V176-NB3 / F ⇒ V176 build missions (family V176-BUILD-MISSIONS); citing another scenario's directive ⇒ refused) must exist first — otherwise nothing is derived",
    "steps outside the declared sequence (provider spend, governance, …) are never derived",
    "inspection validates only with verdict ACCEPT, contractSha256 = sha256(canon(current contract entry)), distinct opaque inspector/author session ids bound to the revision's revisionAuthorSessionId (DECLARED_SESSION_INDEPENDENCE, not cryptographic), inspected head SHA",
    "a validated step is DONE, never PASS: no outcome is graded or upgraded here",
    "MECH-1: a deterministic mechanical verifier may validate ONLY the recording of a NEGATIVE result (outcome FAIL/NOT_MEASURED, grade equal); never PASS/PARTIAL, never a substitute for an inspection of a positive result",
    "R7 proof currency (odg-observation-currency.assessEvidenceCurrency over injected local-git probes): a record citing a commit absent from git / not an ancestor of main, or a STALE decisive hash, or unverified for want of a probe, validates nothing",
  ]),
});

module.exports = { deriveAuthorizationScope, isStepAuthorized, contractSha256, experimentSha256, canon, ownerSourceCheck, OWNER_SOURCES, STEP_SEQUENCES, EXECUTION_STEPS, STEP_KIND, INDEPENDENCE_LEVEL, MECH_KIND, MECH_OWNER_RECORD, MECH_REQUIRED_CHECKS, MECH_INDEPENDENCE_LEVEL, AUTHORIZATION_SCOPE_CONTRACT };
export {};
