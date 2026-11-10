#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V50 (C2 — P15 E4) — Enterprise Automation / Agentic Workflow readiness DEMONSTRATOR. Composes ODG's
 * EXISTING metier-coordinator (selectMetiers / orderByDependency / consolidate — the P15 multi-métier guard) over a
 * SYNTHETIC workflow request and emits a reproducible client deliverable via the shared O1 report layer (+O2 evidence).
 * HONEST SCOPE: a workflow-orchestration readiness assessment; the consolidation is FAIL-CLOSED (any REJECT ⇒ REJECT,
 * contradiction ⇒ ESCALATE). Reuses, does not duplicate. Run: `odg-e4-p15-automation.ts [outPath]`.
 */

const COORD = require("../core/metier-coordinator.js");
const O1 = require("../core/shared-report-generator.js");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "..", "..", "docs", "odg", "demonstrators", "P15_AUTOMATION_READINESS.json");

// SYNTHETIC request: an enterprise release-automation workflow needing security + release + SRE competencies.
const sel = COORD.selectMetiers({ competenciesNeeded: ["security", "release", "slo"] });
const order = COORD.orderByDependency(sel.selected, { P8: [], P3: [], P7: ["P3"] });
// synthetic per-métier decisions on a shared subject (no contradiction here ⇒ expect a clean consolidation).
const results = [
  { metier: "P3", subject: "release-x", decision: "ADMIT" },
  { metier: "P8", subject: "release-x", decision: "ADMIT" },
  { metier: "P7", subject: "release-x", decision: "ADMIT" },
];
const con = COORD.consolidate(results);

const rep = O1.generateReport({
  metier: "P15", title: "Enterprise Automation / Agentic Workflow Readiness", status: `READINESS — consolidated verdict ${con.verdict}`,
  summary: `Orchestrated a release-automation workflow: selected ${sel.selected.length}/15 competency-matching métiers [${sel.selected.join(", ")}] (never all 15 by reflex), dependency-ordered, and consolidated FAIL-CLOSED ⇒ ${con.verdict}. ${con.reason}`,
  controls: [
    { name: "Métier selection", status: "RELEVANT-ONLY", detail: sel.justification },
    { name: "Dependency ordering", status: order.cycle ? "CYCLE (fail-closed)" : "ORDERED", detail: order.order.join(" → ") },
    { name: "Consolidation (fail-closed)", status: con.verdict, detail: con.reason },
  ],
  findings: (con.contradictions || []).map((c: any) => ({ severity: "HIGH", detail: `contradiction on ${c.subject}: ADMIT ${c.admit} vs REJECT ${c.reject} ⇒ ESCALATE`, basis: "PROVEN" })),
  recommendations: ["run the selected métiers' real guards on the client's artifacts", "escalate any contradiction to a human (never resolved silently)"],
  limits: ["decisions here are SYNTHETIC inputs to the orchestrator", "a métier never self-authorizes; decision power stays with ODG", "readiness assessment, NOT a delivered automation; ODG maturity L2, 0 paying clients"],
  evidence: [{ claim: `${sel.selected.length}/15 métiers selected by competency match`, basis: "PROVEN", sourceRef: path.basename(OUT) }, { claim: `fail-closed consolidation ⇒ ${con.verdict}`, basis: "PROVEN", sourceRef: path.basename(OUT) }],
  validationConditions: ["re-run reproduces the selection + verdict from the same inputs", "evidence digest independently verifiable"],
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ "//": "CTO V50 P15 E4 automation readiness. SYNTHETIC workflow. Fail-closed consolidation. Reuses metier-coordinator + O1/O2.", selected: sel.selected, verdict: con.verdict, report: rep.json }, null, 2) + "\n");
fs.writeFileSync(OUT.replace(/\.json$/, ".md"), rep.markdown);
process.stdout.write(`=== P15 Automation E4 written: ${OUT} (+ ${OUT.replace(/\.json$/, ".md")}) ===\n`);
process.stdout.write(JSON.stringify({ selected: sel.selected, notAll15: sel.selected.length < 15, verdict: con.verdict, reportOk: rep.ok, evidenceVerifiable: rep.evidence.integrity.digest != null }, null, 2) + "\n");

export {};
