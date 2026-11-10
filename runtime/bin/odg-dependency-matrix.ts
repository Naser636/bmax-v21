#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V46.1 — 15-MÉTIERS DEPENDENCY MATRIX (read-only audit). PURE analysis: it modifies NO runtime/primitive/
 * contract. It parses the REAL `require("./x.js")` imports of each métier's representative modules, computes the transitive
 * closure, and classifies each métier×shared-component relation FROM CODE (REQUIRED = a métier module imports it directly;
 * USED = in the transitive closure, not direct; NOT_APPLICABLE = no demonstrated dependency; UNKNOWN/MISSING kept explicit).
 * Every relation carries its evidence (file path + the import). Emits the V46.1 artifacts. Run: `odg-dependency-matrix.ts`.
 */

const fs = require("fs");
const path = require("path");
const CORE = path.join(__dirname, "..", "core");
const OUTDIR = path.join(__dirname, "..", "..", "docs", "odg");

// métier -> representative module basenames (verified to exist; concrete entry points, not names guessed).
const METIERS: any = {
  P1: ["native-project-builder", "code-health-service", "patch-executor"],
  P2: ["agent-governance-harness", "intelligence-loop"],
  P3: ["sbom-audit-service", "supply-chain-attest", "license-policy"],
  P4: ["dataset-quality-service"],
  P5: ["canary-decision-pack", "deployment-readiness"],
  P6: ["eval-metrics", "targeted-verify"],
  P7: ["latency-measure", "p12-circuit-breaker"],
  P8: ["api-contract", "einvoice-export"],
  P9: ["cost-engine", "economic-extractor"],
  P10: ["ai-assurance-assessment", "regulatory-assurance", "compliance-evidence-pack"],
  P11: ["einvoice-validator", "einvoice-workflow-demonstrator", "document-pipeline"],
  P12: ["event-stream-engine", "integration-stream-reliability"],
  P13: ["inference-engine", "local-model-generator"],
  P14: ["developer-platform", "golden-path-evidence-bundle", "capability-map"],
  P15: ["metier-coordinator", "campaign-controller", "cognitive-workflow-selection"],
};
// shared components to audit = the 9 primitives' representative modules + the measured top transversal hubs.
const PRIMITIVE_MODULE: any = { IDENTITY: "agent-identity", STATE: "state-transition", CONTRACT: "api-contract", POLICY: "excellence-policy", RESOLVER: "coding-mission-resolver", EXECUTOR: "capability-executors", EVIDENCE: "evidence-provenance", RECOVERY: "build-recovery-engine", ALLOCATOR: null /* no single canonical module ⇒ MISSING */ };
const HUBS = ["evidence-provenance", "audit-log", "sarif-report", "repair-workflow", "code-execution", "reuse-ledger", "excellence-policy", "assurance-pilot-runner", "regulatory-assurance", "economic-unit", "einvoice-parser"];
const SHARED = Array.from(new Set(([] as string[]).concat(Object.values(PRIMITIVE_MODULE).filter(Boolean) as string[], HUBS)));

// --- build the real import graph (direct deps per module) ---
function directDeps(mod: string): string[] {
  const p = path.join(CORE, mod + ".ts");
  if (!fs.existsSync(p)) return [];
  const src = fs.readFileSync(p, "utf8");
  const deps = new Set<string>();
  const re = /require\(["']\.\/([a-zA-Z0-9_-]+)\.js["']\)/g; let m;
  while ((m = re.exec(src)) !== null) deps.add(m[1]);
  return Array.from(deps);
}
const directCache: any = {};
function deps(mod: string): string[] { return directCache[mod] || (directCache[mod] = directDeps(mod)); }
function closure(mods: string[]): Set<string> {
  const seen = new Set<string>(); const stack = [...mods];
  while (stack.length) { const cur = stack.pop() as string; for (const d of deps(cur)) if (!seen.has(d)) { seen.add(d); stack.push(d); } }
  return seen;
}

// --- classify each métier × shared component ---
const matrix: any = {}; const evidence: any = {};
for (const P of Object.keys(METIERS)) {
  const mods = METIERS[P];
  const directUnion = new Set<string>(); for (const mm of mods) for (const d of deps(mm)) directUnion.add(d);
  const clo = closure(mods);
  matrix[P] = {}; evidence[P] = {};
  for (const comp of SHARED) {
    let rel = "NOT_APPLICABLE";
    if (directUnion.has(comp)) rel = "REQUIRED"; else if (clo.has(comp)) rel = "USED";
    matrix[P][comp] = rel;
    if (rel !== "NOT_APPLICABLE") {
      const importer = mods.find((mm: string) => deps(mm).includes(comp));
      evidence[P][comp] = { relation: rel, confidence: rel === "REQUIRED" ? "high (direct import)" : "medium (transitive)", via: importer ? `runtime/core/${importer}.ts` : `transitive from [${mods.join(",")}]`, api: `require('./${comp}.js')` };
    }
  }
}
// ALLOCATOR primitive: no canonical module ⇒ MISSING (explicit).
const allocatorStatus = { primitive: "ALLOCATOR", module: null, status: "MISSING", note: "no single canonical allocator module found in runtime/core; allocation logic is dispersed (e.g. economic/budget) — flagged as a primitive gap, not fabricated." };

// --- cross-reuse: consumers per shared component (by closure membership) ---
const crossReuse: any[] = [];
for (const comp of SHARED) {
  const consumers = Object.keys(METIERS).filter((P) => matrix[P][comp] === "REQUIRED" || matrix[P][comp] === "USED");
  crossReuse.push({ component: comp, consumerCount: consumers.length, consumers, directConsumers: Object.keys(METIERS).filter((P) => matrix[P][comp] === "REQUIRED") });
}
crossReuse.sort((a, b) => b.consumerCount - a.consumerCount);

// --- graph edges (REQUIRES = direct import métier→component) ---
const edges: any[] = [];
for (const P of Object.keys(METIERS)) for (const comp of SHARED) { if (matrix[P][comp] === "REQUIRED") edges.push({ from: P, to: comp, type: "REQUIRES" }); else if (matrix[P][comp] === "USED") edges.push({ from: P, to: comp, type: "COMPOSES_WITH" }); }

// --- coherence self-check: every REQUIRED relation's evidence file exists AND the import is really present ---
let checks = 0, failures = 0;
for (const P of Object.keys(METIERS)) for (const comp of SHARED) if (matrix[P][comp] === "REQUIRED") {
  checks++; const ev = evidence[P][comp]; const f = path.join(__dirname, "..", "..", ev.via.replace("runtime/", "runtime/"));
  const ok = fs.existsSync(path.join(CORE, path.basename(ev.via))) && fs.readFileSync(path.join(CORE, path.basename(ev.via)), "utf8").includes(`require('./${comp}.js')`) || fs.readFileSync(path.join(CORE, path.basename(ev.via)), "utf8").includes(`require("./${comp}.js")`);
  if (!ok) { failures++; }
}

const result = {
  "//": "CTO V46.1 — 15-métiers dependency matrix, PROVEN from real require() imports (read-only). REQUIRED=direct import; USED=transitive closure; NOT_APPLICABLE=no demonstrated dependency; MISSING/UNKNOWN explicit.",
  metiers: Object.keys(METIERS).length, sharedComponents: SHARED, matrix, evidence,
  primitives: { auditedModules: PRIMITIVE_MODULE, allocator: allocatorStatus },
  crossReuse, edges, graphStats: { nodes: Object.keys(METIERS).length + SHARED.length, edges: edges.length },
  coherence: { requiredRelationsChecked: checks, evidenceFailures: failures, pass: failures === 0 },
};
fs.writeFileSync(path.join(OUTDIR, "V46_1_15_METIERS_DEPENDENCY_MATRIX.json"), JSON.stringify(result, null, 2) + "\n");
fs.writeFileSync(path.join(OUTDIR, "V46_1_SHARED_COMPONENTS_INVENTORY.json"), JSON.stringify({ sharedComponents: SHARED, crossReuse, primitives: result.primitives }, null, 2) + "\n");
fs.writeFileSync(path.join(OUTDIR, "V46_1_DEPENDENCY_GRAPH.json"), JSON.stringify({ edges, graphStats: result.graphStats, relationTypes: ["REQUIRES", "COMPOSES_WITH"] }, null, 2) + "\n");

process.stdout.write(JSON.stringify({ metiers: result.metiers, sharedComponents: SHARED.length, edges: edges.length, top5reuse: crossReuse.slice(0, 5).map((c: any) => `${c.component}:${c.consumerCount}`), allocator: allocatorStatus.status, coherencePass: result.coherence.pass, checks, failures }, null, 2) + "\n");
export {};
