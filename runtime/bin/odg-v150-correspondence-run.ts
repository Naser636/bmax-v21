#!/usr/bin/env node
"use strict";
/*
 * V15.0 Phase 1 — WIC-V150-PHASE1-CORRESPONDENCE. GENERATED (not hand-written) correspondence register:
 *   V12.4 mission (docs/odg/v124-consolidated-roadmap.json) → declared components → census class (CONNECTED / NO_CONSUMER /
 *   …, from the EXISTING odg-component-census over the real require-graph) → consumers → test → mission evidence,
 * plus the dormant-capability candidate pool (census decision surface) on the current HEAD. READ-ONLY; composes the existing
 * census run (runCensus) — no second scan, no second graph. Deterministic: same HEAD ⇒ byte-identical output (no clock).
 * A consumer count is NOT proof of real use; NO_CONSUMER can miss dynamic consumers (census invariant).
 * Usage: npx tsx runtime/bin/odg-v150-correspondence-run.ts [--write docs/odg/evidence/V150_PHASE1_CORRESPONDENCE.json]
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const { runCensus } = require("./odg-component-census-run.ts");

function main(argv: string[]): void {
  const out = (() => { const i = argv.indexOf("--write"); return i >= 0 ? argv[i + 1] : null; })();
  const head = (cp.spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout || "").trim();
  // (inspection L1) the scan reads the WORKING TREE: record whether it differs from HEAD (paths only, sorted ⇒ deterministic)
  const dirtyPaths = (cp.spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all", "--", "runtime", "scripts", "src"], { cwd: ROOT, encoding: "utf8" }).stdout || "").split("\n").filter(Boolean).map((l: string) => l.slice(3)).sort();
  const companion = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/v124-consolidated-roadmap.json"), "utf8"));
  const r = runCensus();
  const byId: Record<string, any> = {}; for (const rec of r.records || []) byId[rec.module] = rec;
  const classOf = (rec: any) => rec ? String(rec.status || "UNKNOWN") : "NOT_IN_CENSUS";
  const missions = (companion.missions || []).map((m: any) => {
    const comps = (m.components || []).map((c0: string) => {
      // the companion declares components either as repo paths or as bare core module names ("odg-mission-orchestrator")
      const c = /^[A-Za-z0-9._-]+$/.test(c0) && !/\.[a-z]+$/.test(c0) ? "runtime/core/" + c0 + ".ts" : c0;
      const exists = fs.existsSync(path.join(ROOT, c));
      const mod = /^runtime\/core\/([^/]+)\.ts$/.exec(c); const rec = mod ? byId[mod[1]] : null;
      const kind = mod ? "CORE_MODULE" : /^runtime\/bin\//.test(c) ? "BIN_ENTRY" : "NON_CODE_ARTIFACT";
      return { declared: c0, path: c, kind, exists, censusClass: mod ? classOf(rec) : null, consumers: rec ? rec.consumerCount : null, why: rec ? rec.why : null, hasTest: mod ? fs.existsSync(path.join(ROOT, c.replace(/\.ts$/, ".test.ts"))) : null };
    });
    const core = comps.filter((c: any) => c.kind === "CORE_MODULE" && c.exists);
    const connected = core.filter((c: any) => c.censusClass === "CONNECTED").length;
    return { id: m.id, section: m.section, status: m.status, commit: m.commit || null, evidence: m.evidence || null, components: comps,
      summary: comps.length === 0 ? "NO_COMPONENT_DECLARED" : comps.some((c: any) => !c.exists) ? "DECLARED_COMPONENT_MISSING" : core.length === 0 ? "NO_CORE_MODULE" : connected === core.length ? "ALL_CORE_CONNECTED" : connected === 0 ? "NO_CORE_CONNECTED" : "PARTIALLY_CONNECTED" };
  });
  const tally: Record<string, number> = {}; for (const m of missions) tally[m.summary] = (tally[m.summary] || 0) + 1;
  const report = {
    workItem: "WIC-V150-PHASE1-CORRESPONDENCE", head, scannedTree: dirtyPaths.length ? "HEAD + uncommitted changes under runtime/scripts/src" : "HEAD (clean under runtime/scripts/src)", uncommittedScannedPaths: dirtyPaths, generator: "runtime/bin/odg-v150-correspondence-run.ts",
    composes: ["odg-component-census (runCensus: change-impact-graph + odg-consumer-scan + architecture-audit)", "docs/odg/v124-consolidated-roadmap.json"],
    census: { total: r.total, counts: r.counts, noConsumerWhy: r.noConsumerWhy, decisionSurfaceSize: (r.decisionSurface || []).length },
    missionSummary: tally, missions,
    dormantCandidates: (r.decisionSurface || []).map((d: any) => (typeof d === "string" ? d : d.id || d.module || d)).slice().sort(),
    limits: [
      "NO_CONSUMER = no STATIC importer — can miss dynamic/spawn/app-dynamic consumers (over-reports orphans); never cite as dead",
      "a consumer count is not proof of real use in a real path (V15.0 §7.6 requires a traced scenario)",
      "mission→component links are those DECLARED in the V12.4 companion; undeclared components are not inferred",
      "hasTest = an exact <module>.test.ts exists (stricter than the census heuristic, which also accepts <module>-*.test.ts)",
    ],
  };
  const text = JSON.stringify(report, null, 2) + "\n";
  if (out) fs.writeFileSync(path.join(ROOT, out), text); else process.stdout.write(text);
  process.stderr.write(`[v150-correspondence] HEAD ${head.slice(0, 8)} missions=${missions.length} ${JSON.stringify(tally)} census ${r.counts.CONNECTED}/${r.total} CONNECTED, dormant candidates=${report.dormantCandidates.length}\n`);
}
main(process.argv.slice(2));
export {};
