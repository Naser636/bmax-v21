#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-7 (P4 data + cross-cutting privacy — world-research gap) — DATASET PII CLASSIFICATION + DATA-
 * MINIMIZATION / PURPOSE-LIMITATION. PURE, deterministic. World reference: EDPB Guidelines 03/2026 (web scraping for
 * GenAI, 7-Jul-2026) + EDPB "Data protection by design & by default" (Feb-2026) reaffirm GDPR Art.5(1)(c) data
 * minimization + Art.5(1)(b) purpose limitation — personal data must be "adequate, relevant and limited to what is
 * necessary" for the stated purpose; data not relevant to that purpose must be redacted/excluded; special-category
 * data (Art.9) needs its own basis. ODG has GDPR readiness CHECKLISTS (regulatory-assurance, with CALLER-DECLARED
 * dataCategories) and outreach-draft compliance, but NO module that scans an actual dataset to DETECT which fields
 * hold personal/special-category data and enforce minimization/purpose-limitation (grep-verified absent; failures-
 * register F29 "classification + minimization" is self-marked PARTIAL). This composes dataset-quality-service.parseCsv
 * (row iteration) + regulatory-assurance's GDPR grounding + special-category vocabulary, emitting the standard
 * {id,area,severity,detail,remediation,evidence} finding shape and a pure redaction PLAN. Deny-by-default. Dual export.
 */

const DQS = require("./dataset-quality-service");      // parseCsv — reuse the CSV row parser

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function finding(id: string, area: string, severity: string, detail: string, remediation: string, evidence: string): any {
  return Object.freeze({ id, area, severity, detail, remediation, evidence });
}

const CLASS = Object.freeze(["NONE", "PERSONAL", "SPECIAL_CATEGORY"]);
// field-NAME keyword lists. SPECIAL vocabulary grounded in regulatory-assurance (["sensitive","health","biometric"]) + GDPR Art.9.
const PERSONAL_NAME = ["email", "e-mail", "phone", "mobile", "tel", "name", "firstname", "lastname", "surname", "address", "street", "postal", "postcode", "zip", "city", "dob", "birth", "ssn", "nin", "national", "passport", "ip", "ipaddr", "iban", "account", "userid", "username", "gps", "lat", "lon", "geo"];
const SPECIAL_NAME = ["health", "medical", "diagnosis", "disability", "biometric", "genetic", "dna", "fingerprint", "religion", "religious", "ethnic", "race", "racial", "political", "union", "sexual", "orientation", "sensitive"];
// value regexes (sample-based detection).
const VALUE_RE: Array<[string, RegExp]> = [
  ["email", /^[^@\s]+@[^@\s]+\.[^@\s]+$/],
  ["phone", /^\+?[0-9][0-9\s().-]{6,}$/],
  ["ip", /^(\d{1,3}\.){3}\d{1,3}$/],
  ["iban", /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/],
];
function nameMatches(name: string, list: string[]): boolean { const n = String(name).toLowerCase(); return list.some((k) => n.includes(k)); }
function valueMatchesPersonal(values: any[]): boolean { return values.some((v) => { const s = String(v); return VALUE_RE.some(([, re]) => re.test(s)); }); }

/** classifyField(name, sampledValues) -> { field, class, matchStatus, by }. Ambiguity resolves toward PII; sample-absence ⇒ UNVERIFIED. */
function classifyField(name: string, sampledValues: any[]): any {
  const vals = arr(sampledValues).filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (nameMatches(name, SPECIAL_NAME)) return { field: name, class: "SPECIAL_CATEGORY", matchStatus: "NAME", by: "name" };
  const personalName = nameMatches(name, PERSONAL_NAME);
  const personalValue = valueMatchesPersonal(vals);
  if (personalName || personalValue) return { field: name, class: "PERSONAL", matchStatus: personalValue ? "VALUE" : "NAME", by: personalName ? "name" : "value" };
  // no match — but detection is sample-based, so absence is UNVERIFIED, never asserted CLEAN.
  return { field: name, class: "NONE", matchStatus: vals.length > 0 ? "UNVERIFIED" : "NO_SAMPLE", by: "none" };
}

/**
 * assessPiiMinimization({ dataset, purpose }) -> { verdict, fieldClassifications, findings, redactionPlan }.
 *   dataset: { fields?: [{name}], format?: "csv", content?: string, rows?: object[] }
 *   purpose: { allowedFields?: string[], art9Basis?: boolean|string }  (absent ⇒ deny-by-default: all PII is excess)
 */
function assessPiiMinimization(input: any): any {
  const o = isObj(input) ? input : {};
  const ds = isObj(o.dataset) ? o.dataset : {};
  const purpose = isObj(o.purpose) ? o.purpose : {};
  const allowed = new Set(arr(purpose.allowedFields).map((x) => String(x)));
  const hasBasis = purpose.art9Basis === true || (typeof purpose.art9Basis === "string" && purpose.art9Basis.length > 0);

  // resolve rows + field names.
  let rows: any[] = [];
  if (ds.format === "csv" && typeof ds.content === "string") rows = DQS.parseCsv(ds.content);
  else rows = arr(ds.rows).filter(isObj);
  let fieldNames: string[] = arr(ds.fields).map((f) => (isObj(f) ? f.name : f)).filter((x) => typeof x === "string");
  if (fieldNames.length === 0 && rows.length > 0) fieldNames = Object.keys(rows[0]);

  const fieldClassifications: any[] = [];
  const findings: any[] = [];
  const redactionPlan: string[] = [];

  for (const name of fieldNames) {
    const sampled = rows.slice(0, 50).map((r) => r[name]);
    const c = classifyField(name, sampled);
    const inPurpose = allowed.has(name);
    const rec = Object.freeze({ ...c, inPurpose });
    fieldClassifications.push(rec);

    if (c.class === "SPECIAL_CATEGORY") {
      if (!hasBasis) { findings.push(finding("special-category:no-art9-basis", "privacy", "HIGH", `field '${name}' holds special-category data with no declared Art.9 basis`, `declare an Art.9 lawful basis or redact '${name}'`, `class=SPECIAL via ${c.by}`)); redactionPlan.push(name); }
      else if (!inPurpose) { findings.push(finding("minimization:special-not-in-purpose", "privacy", "HIGH", `special-category field '${name}' is not among the declared purpose's allowedFields`, `exclude '${name}' or add it to the declared purpose`, `class=SPECIAL, inPurpose=false`)); redactionPlan.push(name); }
    } else if (c.class === "PERSONAL") {
      if (!inPurpose) { findings.push(finding("minimization:excess-personal-field", "privacy", "HIGH", `personal field '${name}' is not necessary for the declared purpose (Art.5(1)(c) data minimization)`, `exclude/redact '${name}' or justify it in the declared purpose`, `class=PERSONAL via ${c.by}, inPurpose=false`)); redactionPlan.push(name); }
    }
  }

  const unverified = fieldClassifications.some((f) => f.matchStatus === "UNVERIFIED" || f.matchStatus === "NO_SAMPLE");
  const verdict = fieldNames.length === 0 ? "NO_DATA" : findings.length > 0 ? "VIOLATIONS_FOUND" : (unverified ? "NO_VIOLATION_UNVERIFIED" : "COMPLIANT");

  return Object.freeze({
    verdict,
    purposeDeclared: allowed.size > 0,
    fieldClassifications: Object.freeze(fieldClassifications),
    findings: Object.freeze(findings),
    redactionPlan: Object.freeze(redactionPlan),   // a PLAN — this module never mutates data
    note: allowed.size === 0 ? "no declared purpose ⇒ deny-by-default: every detected personal/special field is excess" : (verdict === "NO_VIOLATION_UNVERIFIED" ? "no violation on the sampled rows — UNVERIFIED (sample-based), never asserted CLEAN" : "purpose-scoped minimization assessed"),
  });
}

const DATASET_PII_MINIMIZATION_CONTRACT = Object.freeze({
  id: "V124-DATASET-PII-MINIMIZATION",
  source: "SÉRIE 23/W7 P4+privacy — GDPR data-minimization/purpose-limitation + special-category detection (EDPB 03/2026; Art.5(1)(b)(c)/Art.9)",
  classes: CLASS,
  reuses: Object.freeze(["dataset-quality-service.parseCsv (row iteration)", "regulatory-assurance GDPR-2016-679 grounding + special-category vocabulary", "standard {id,area,severity,detail,remediation,evidence} finding shape → sarif-report path"]),
  notAuthority: "detects PII + produces a redaction PLAN; it mutates no data and is NOT legal advice",
  invariants: Object.freeze([
    "deny-by-default: absent/empty declared purpose ⇒ EVERY detected personal/special-category field is excess (on the redaction plan)",
    "a field is PII when EITHER its name OR any sampled value matches (ambiguity resolves toward PII, never 'clean')",
    "special-category (Art.9) field with no declared basis ⇒ HIGH finding + redaction, regardless of purpose",
    "detection is sample-based: no match ⇒ UNVERIFIED (NO_VIOLATION_UNVERIFIED), never asserted CLEAN (no silent pass)",
    "pure/deterministic: name keywords + value regexes over a bounded sample; no clock/random/network; it never mutates data",
  ]),
});

module.exports = { classifyField, assessPiiMinimization, DATASET_PII_MINIMIZATION_CONTRACT };

if (require.main === module) {
  const demo = assessPiiMinimization({ dataset: { format: "csv", content: "id,email,health_notes\n1,a@b.com,diabetes\n2,c@d.com,none\n" }, purpose: { allowedFields: ["id"] } });
  process.stdout.write(JSON.stringify({ ...DATASET_PII_MINIMIZATION_CONTRACT, demo: { verdict: demo.verdict, redactionPlan: demo.redactionPlan } }, null, 2) + "\n");
}

export {};
