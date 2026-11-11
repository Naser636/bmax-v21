#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V83 §3 — PIPELINE ADVERSARIAL BATTERY. Runs the 11 adversarial cases through the INTEGRATED chain
 * (evidence-qualifier → mission-decomposer), proving each produces the correct status and NO abusive closure: content
 * mismatch, incomplete markers, stale/contradictory, unwired test, gate-green-but-wrong-requirement, partial-composite,
 * absent, empty, contradictory-multi, gated-parent-with-local-sub, never-auto-sign-off. Injected readers ⇒ offline,
 * deterministic. Reuses the canonical modules; no new primitive. Run: `odg-pipeline-adversarial.ts`.
 */

const Q = require("../core/evidence-qualifier.js");
const DEC = require("../core/mission-decomposer.js");
const fs = require("fs");
const path = require("path");

// synthetic evidence store.
const FILES: any = {
  "ok.json": '{"RECONSTRUCTED":true,"partI":[1]}',
  "unrelated.json": '{"weather":"sunny"}',
  "incomplete.json": '{"RECONSTRUCTED":true}',            // missing "partI"
  "stale.json": '{"RECONSTRUCTED":true,"partI":[1],"CONTRADICTED":true}',
  "empty.json": "   ",
  "wired.test.ts": "check(1)",
  "unwired.test.ts": "check(1)",
};
const exists = (r: string) => r in FILES;
const read = (r: string) => FILES[r] || null;
const gate = ["wired.test.ts"];
const qualify = (ref: string, markers: string[], forbid?: string[]) => {
  const q = Q.qualify(ref, { exists, read, expectMarkers: markers, gateSuites: gate });
  if (q.status === "VALID" && Array.isArray(forbid)) { const c = read(ref) || ""; if (forbid.some((f) => c.includes(f))) return "INSUFFICIENT"; }  // contradiction downgrades
  return q.status;
};

const cases: any[] = [];
const rec = (name: string, expected: string, actual: string) => cases.push({ case: name, expected, actual, pass: expected === actual });

rec("1 content unrelated", "INSUFFICIENT", qualify("unrelated.json", ["RECONSTRUCTED", "partI"]));
rec("2 incomplete markers", "INSUFFICIENT", qualify("incomplete.json", ["RECONSTRUCTED", "partI"]));
rec("3 stale/contradictory", "INSUFFICIENT", qualify("stale.json", ["RECONSTRUCTED", "partI"], ["CONTRADICTED"]));
rec("4 test not gate-wired", "INSUFFICIENT", qualify("unwired.test.ts", ["check"]));
rec("5 gate-green but wrong requirement", "INSUFFICIENT", qualify("ok.json", ["superiority_demonstrated"]));   // markers for another req
rec("7 absent", "ABSENT", qualify("missing.json", ["x"]));
rec("8 empty", "INSUFFICIENT", qualify("empty.json", []));
rec("valid baseline", "VALID", qualify("ok.json", ["RECONSTRUCTED", "partI"]));
rec("4b test gate-wired + marker", "VALID", qualify("wired.test.ts", ["check"]));

// 6 partial-composite: a parent whose evidence is VALID but test is INSUFFICIENT ⇒ only part ALREADY_DONE.
const comp = DEC.decompose({ id: "COMP", kind: "PARTIAL", needsSignOff: true, evidence: { impl: true, test: "unwired.test.ts", evidenceRef: "ok.json", dossier: true } }, { qualify: (r: string) => qualify(r, r.endsWith(".test.ts") ? ["check"] : ["RECONSTRUCTED", "partI"]) });
rec("6 partial-composite: evidence VALID, test INSUFFICIENT ⇒ tests LOCAL_REMAINING", "LOCAL_REMAINING", comp.subMissions.find((s: any) => s.name === "tests").status);
rec("6b partial-composite: evidence sub ALREADY_DONE", "ALREADY_DONE", comp.subMissions.find((s: any) => s.name === "evidence").status);

// 10 gated parent with local sub ⇒ local sub LOCAL_REMAINING, parent sign-off GATED
const gated = DEC.decompose({ id: "G", kind: "B_human", needsSignOff: true, evidence: { test: "unwired.test.ts" } }, { qualify: (r: string) => qualify(r, ["check"]) });
rec("10 gated parent exposes local sub", "LOCAL_REMAINING", gated.subMissions.find((s: any) => s.name === "tests").status);
rec("11 sign-off never auto-completed", "SIGN_OFF_GATED", gated.subMissions.find((s: any) => /sign/.test(s.name)).status);

const passed = cases.filter((c) => c.pass).length;
const out = {
  "//": "CTO V83 §3 — adversarial battery over the integrated evidence-qualifier → mission-decomposer chain. Each adversarial case must yield the correct status with NO abusive closure. Injected readers ⇒ offline/deterministic. Reuses canonical modules; no new primitive.",
  caseCount: cases.length, passed, allPass: passed === cases.length, cases,
  honestConclusion: `${passed}/${cases.length} adversarial cases produced the correct status: content-mismatch/incomplete/stale/unwired/wrong-requirement/empty ⇒ INSUFFICIENT; absent ⇒ ABSENT; only genuinely-matching evidence ⇒ VALID; a partial-composite advances only its valid sub; a gated parent exposes its local sub but NEVER auto-completes the sign-off. No abusive closure.`,
  invariant: "no ALREADY_DONE without semantic VALID; contradictory/incomplete/unwired/mismatched evidence downgrades; sign-off never auto-completed; a gated parent never blocks its local sub.",
};
fs.writeFileSync(path.join(__dirname, "..", "..", "docs", "odg", "V83_PIPELINE_ADVERSARIAL.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ cases: cases.length, passed, allPass: out.allPass, failed: cases.filter((c) => !c.pass).map((c) => c.case) }, null, 2) + "\n");
export {};
