#!/usr/bin/env node
"use strict";
/* Tests for odg-verification-level (V15.7). Fixture reader (no real repo reads except the final grounding check). */
const path = require("path");
const V = require("./odg-verification-level.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const PKG = (suites: string[], extra: any = {}) => JSON.stringify({ name: "x", scripts: { "test:report": "tsx runtime/bin/odg-test-report.ts " + suites.join(" "), ...extra } });
const BASE_SUITES = ["runtime/core/a.test.ts", "runtime/core/b.test.ts", "runtime/core/odg-v251-repair-reconciliation.test.ts"];

// fixture repo: a ← b ← c (c consumes b, b consumes a); lone has no consumers; fleet-bridge consumes guard; bin/tool.ts requires core/lone
function fixture(over: any = {}): any {
  const files: any = {
    "package.json": PKG(BASE_SUITES),
    "runtime/core/a.ts": "", "runtime/core/a.test.ts": 'require("./a.js")', "runtime/core/b.ts": 'require("./a.js")', "runtime/core/b.test.ts": "",
    "runtime/core/c.ts": 'require("./b.js")', "runtime/core/c.test.ts": "", "runtime/core/lone.ts": "", "runtime/core/lone.test.ts": "",
    "runtime/core/guard.ts": "", "runtime/core/guard.test.ts": "", "runtime/core/fleet-bridge.ts": 'require("./guard.js")',
    "runtime/core/odg-v251-repair-reconciliation.test.ts": "", "runtime/core/change-impact-graph.test.ts": "",
    "runtime/bin/tool.ts": 'const L = require("../core/lone.js");', "runtime/bin/tool.test.ts": 'require("./tool.ts")',
    "runtime/core/data.json": "{}", "runtime/core/uses-data.ts": 'const f = "data.json";', "runtime/core/uses-data.test.ts": "",
    "docs/odg/evidence/X.json": "{}", "docs/notes.md": "# n",
    "docs/odg/evidence/ORACLE.json": "{}", "runtime/core/grader.ts": 'const p = "docs/odg/evidence/ORACLE.json";', "runtime/core/grader.test.ts": "",
    "runtime/core/bench.ts": 'const sb = require("./provider-sandbox.js");', "runtime/core/bench.test.ts": "", "runtime/core/provider-sandbox.ts": "",
    "runtime/core/notest.ts": "", "runtime/bin/notest.ts": "",
    "runtime/core/ui-shared.ts": "", "runtime/core/ui-shared.test.ts": "", "src/app/page.tsx": 'import x from "../../runtime/core/ui-shared";',
    "runtime/missions/M1.json": "{}",
    ...(over.files || {}),
  };
  const graph = over.graphThrows ? null : {
    modules: ["a", "b", "c", "lone", "guard", "fleet-bridge", "uses-data", "grader", "bench", "provider-sandbox", "notest", "ui-shared"],
    deps: { a: [], b: ["a"], c: ["b"], lone: [], guard: [], "fleet-bridge": ["guard"], "uses-data": [], grader: [], bench: ["provider-sandbox"], "provider-sandbox": [], notest: [], "ui-shared": [] },
    consumers: { a: ["b"], b: ["c"], c: [], lone: [], guard: ["fleet-bridge"], "fleet-bridge": [], "uses-data": [], grader: [], bench: [], "provider-sandbox": ["bench"], notest: [], "ui-shared": [] },
  };
  return {
    exists: (r: string) => Object.prototype.hasOwnProperty.call(files, r),
    read: (r: string) => (Object.prototype.hasOwnProperty.call(files, r) && !(over.unreadable || []).includes(r) ? files[r] : null),
    list: (d: string) => { const p = d + "/"; const out = Object.keys(files).filter((f) => f.startsWith(p) && !f.slice(p.length).includes("/")).map((f) => f.slice(p.length)).sort(); return out; },
    realRel: (r: string) => (over.symlinks && r in over.symlinks ? over.symlinks[r] : (Object.prototype.hasOwnProperty.call(files, r) ? r : null)),
    graph: () => { if (over.graphThrows) throw new Error("boom"); return graph; },
    walk: over.noWalk ? undefined : (d: string) => Object.keys(files).filter((f) => f.startsWith(d + "/")).sort(),
  };
}
const ROOT = "/repo";
const plan = (changed: any, over: any = {}, opts: any = {}) => V.chooseLevel(changed, { root: ROOT, reader: fixture(over), ...opts });

function main(): void {
  // DOCS_ONLY
  let p = plan(["docs/odg/evidence/X.json", "docs/notes.md"]);
  check("docs/evidence-only ⇒ DOCS_ONLY, no tests, doc-lint step, CI still mandatory", p.level === "DOCS_ONLY" && !p.reinforced && p.tests.L1.length === 0 && p.steps.some((s: any) => s.step === "doc-lint" && s.files.includes("docs/odg/evidence/X.json")) && p.mandatoryPreMergeCI === true && p.steps.some((s: any) => s.step === "pre-merge-CI" && s.mandatory));
  check("DOCS_ONLY reason says merge still requires CI", p.reasons.some((r: string) => /Merge STILL requires CI/.test(r)));

  // L1: leaf module
  p = plan(["runtime/core/lone.ts"]);
  check("leaf core module with no core consumers but a bin importer ⇒ L2 (bin edge found by scan)", p.level === "L2" && p.tests.L1.join() === "runtime/core/lone.test.ts" && p.tests.L2.includes("runtime/bin/tool.test.ts"));
  p = plan(["runtime/core/c.ts"]);
  check("module with no reverse-dependents ⇒ L1 with its own test + typecheck", p.level === "L1" && p.tests.L1.join() === "runtime/core/c.test.ts" && p.steps.some((s: any) => s.step === "typecheck"));
  p = plan(["runtime/core/c.test.ts"]);
  check("test-only change ⇒ L1 running that test", p.level === "L1" && p.tests.L1.join() === "runtime/core/c.test.ts");

  // L2: transitive reverse-dependents + regression
  p = plan(["runtime/core/a.ts"]);
  check("a ← b ← c ⇒ L2 with transitive reverse-dependent tests (b, c) + regression suites", p.level === "L2" && ["runtime/core/a.test.ts", "runtime/core/b.test.ts", "runtime/core/c.test.ts", "runtime/core/odg-v251-repair-reconciliation.test.ts", "runtime/core/change-impact-graph.test.ts"].every((t) => p.tests.L2.includes(t)) && p.tests.L1.join() === "runtime/core/a.test.ts");
  check("L2 ⊇ L1", p.tests.L1.every((t: string) => p.tests.L2.includes(t)));

  // REINFORCED
  for (const f of ["runtime/core/fleet-bridge.ts", "runtime/bin/odg-schedule-tick.ts", "runtime/core/mission-ledger.ts", "runtime/core/provider-sandbox.ts", "runtime/core/secret-store.ts", "runtime/governance/x.json", "runtime/core/write-set-gate.ts", "runtime/core/objective-authorization.ts", "runtime/core/audit-integrity.ts", "runtime/core/recovery-engine.ts", "runtime/core/lease-manager.ts", "docs/odg/closure-register.json"]) {
    p = plan([f]);
    check(`control surface ${f} ⇒ L3 REINFORCED + mandatory inspection + checklist`, p.level === "L3" && p.reinforced === true && p.independentInspection === "MANDATORY" && Array.isArray(p.adversarialChecklist) && p.adversarialChecklist.length > 5);
  }
  p = plan(["runtime/core/guard.ts"]);
  check("a change whose reverse-dependent is a control surface (fleet-bridge) ⇒ REINFORCED", p.level === "L3" && p.reinforced && p.reasons.some((r: string) => /IMPACTS_SENSITIVE_CONSUMER/.test(r)));
  p = plan(["Runtime/Core/Fleet-Bridge.ts"]);
  check("case variant of a control surface still REINFORCED", p.reinforced === true);
  check("'author' is not 'auth' (token match)", V.sensitiveHits("runtime/core/author-profile.ts").length === 0);

  // fail-closed paths
  for (const bad of ["../etc/passwd", "/etc/passwd", "runtime\\core\\a.ts", "a\0b", "", ".", "~/x"]) {
    p = plan([bad]);
    check(`invalid path ${JSON.stringify(bad)} ⇒ L3 REINFORCED`, p.level === "L3" && p.reinforced && p.files.some((f: any) => f.class === "INVALID_PATH"));
  }
  p = plan(["/repo/runtime/core/c.ts"]);
  check("absolute path inside the repo is relativised (⇒ L1 for c)", p.level === "L1" && p.tests.L1.join() === "runtime/core/c.test.ts");
  p = plan(["runtime/core/../core/c.ts"]);
  check("'..' that stays inside the repo is normalised", p.level === "L1" && p.files[0].path === "runtime/core/c.ts");
  p = plan(["docs/link.md"], { files: { "docs/link.md": "" }, symlinks: { "docs/link.md": "ESCAPE" } });
  check("symlink escaping the repo ⇒ INVALID ⇒ L3 REINFORCED", p.level === "L3" && p.reinforced);
  p = plan(["docs/link.md"], { files: { "docs/link.md": "" }, symlinks: { "docs/link.md": "runtime/core/fleet-bridge.ts" } });
  check("symlink in docs pointing at a control surface is classified by its TARGET ⇒ REINFORCED", p.reinforced === true && p.level === "L3");
  check("empty change-set ⇒ L3 REINFORCED (fail closed)", plan([]).level === "L3" && plan([]).reinforced && plan(null).level === "L3");

  // unresolved ⇒ escalate
  p = plan(["runtime/core/c.ts"], { graphThrows: true });
  check("graph unavailable ⇒ unresolved ⇒ escalate L1 → L2", p.level === "L2" && p.reasons.some((r: string) => /GRAPH_UNAVAILABLE/.test(r)) && p.reasons.some((r: string) => /escalate L1 → L2/.test(r)));
  p = plan(["runtime/core/data.json"]);
  check("non-TS runtime data file ⇒ unresolved ⇒ escalated (≥ L2) and its naming source's test selected", (p.level === "L2" || p.level === "L3") && p.tests.L2.includes("runtime/core/uses-data.test.ts"));
  p = plan(["runtime/core/gone.ts"]);
  check("deleted module ⇒ unresolved ⇒ escalate", p.level === "L2" && p.unresolved.some((u: any) => /DELETED_MODULE/.test(u.reason)));
  p = plan(["runtime/core/c.ts"], { unreadable: ["runtime/bin/tool.ts"] });
  check("unreadable source during the edge scan ⇒ unresolved ⇒ escalate (never silently smaller)", p.level === "L2" && p.unresolved.some((u: any) => /UNREADABLE/.test(u.reason)));
  p = plan(["src/app/page.tsx"]);
  check("out-of-graph-domain (src/app) ⇒ L3", p.level === "L3" && !p.reinforced);
  p = plan(["tsconfig.runtime-dist.json"]);
  check("build config ⇒ L3", p.level === "L3");

  // package.json
  const head = PKG([...BASE_SUITES, "runtime/core/c.test.ts"]);
  p = plan(["package.json"], { files: { "package.json": head } }, { packageJson: { base: PKG(BASE_SUITES), head } });
  check("package.json: only a suite ADDED to test:report ⇒ L1 running it", p.level === "L1" && p.tests.L1.join() === "runtime/core/c.test.ts");
  const removed = PKG(["runtime/core/a.test.ts"]);
  p = plan(["package.json"], { files: { "package.json": removed } }, { packageJson: { base: PKG(BASE_SUITES), head: removed } });
  check("package.json: a suite REMOVED from the gate ⇒ L3 REINFORCED", p.level === "L3" && p.reinforced);
  const other = PKG(BASE_SUITES, { build: "x" });
  p = plan(["package.json"], { files: { "package.json": other } }, { packageJson: { base: PKG(BASE_SUITES), head: other } });
  check("package.json: other change ⇒ L3", p.level === "L3");
  p = plan(["package.json"]);
  check("package.json without base ⇒ UNKNOWN ⇒ L3 (fail closed)", p.level === "L3");
  p = plan(["runtime/core/c.ts"], { files: { "package.json": "{not json" } });
  check("full test:report list unreadable ⇒ L3", p.level === "L3" && p.tests.L3.length === 0);

  // ---- inspection #902 regressions ----
  p = plan(["runtime/missions/M1.json"]);
  check("#902 MED: runtime/missions/*.json (write_set/permission declarations) ⇒ REINFORCED", p.level === "L3" && p.reinforced);
  p = plan(["runtime/core/bench.ts"]);
  check("#902 LOW: a changed source that IMPORTS a control surface (provider-sandbox) ⇒ REINFORCED", p.reinforced && p.reasons.some((r: string) => /IMPORTS_SENSITIVE_MODULE: runtime\/core\/bench\.ts → runtime\/core\/provider-sandbox\.ts/.test(r)));
  p = plan(["docs/odg/evidence/ORACLE.json"]);
  check("#902 LOW: a doc JSON read by code is NOT DOCS_ONLY (escalated ≥ L2, reader's test selected)", p.level !== "DOCS_ONLY" && (p.level === "L2" || p.level === "L3") && p.tests.L2.includes("runtime/core/grader.test.ts"));
  check("an unread doc JSON stays DOCS_ONLY", plan(["docs/odg/evidence/X.json"]).level === "DOCS_ONLY");
  p = plan(["runtime/core/ui-shared.ts"]);
  check("#902 LOW: a runtime module imported from src/app ⇒ L3 (CONSUMED_OUTSIDE_RUNTIME)", p.level === "L3" && p.reasons.some((r: string) => /CONSUMED_OUTSIDE_RUNTIME: src\/app\/page\.tsx/.test(r)));
  // re-inspection LOW: a Next page loading the COMPILED dist through a createRequire alias (real case: src/app/[lang]/estimate/page.tsx)
  p = plan(["runtime/core/lone.ts"], { files: { "src/app/est/page.tsx": 'const require_ = createRequire(import.meta.url);\nconst V = require_("../../../runtime/dist/core/lone.js");' } });
  check("re-inspection LOW: a runtime/dist alias load (require_(\"…/runtime/dist/core/x.js\")) maps to runtime/core/x.ts ⇒ L3 CONSUMED_OUTSIDE_RUNTIME", p.level === "L3" && p.reasons.some((r: string) => /CONSUMED_OUTSIDE_RUNTIME: .*src\/app\/est\/page\.tsx/.test(r)));
  p = plan(["runtime/core/c.ts"], { noWalk: true });
  check("extra trees not scannable ⇒ unresolved ⇒ escalate (fail closed)", p.level === "L2" && p.unresolved.some((u: any) => /tree not scannable/.test(u.path)));
  p = plan(["runtime/core/notest.ts"]);
  check("#902 LOW/MED: L1 source change selecting 0 suites ⇒ escalated (never passes on typecheck alone)", p.level !== "L1" && p.reasons.some((r: string) => /NO_TESTS_SELECTED/.test(r)));
  check("core source with no own test ⇒ L2 (regression suites at least)", p.level === "L2" && p.tests.L2.length > 0);
  p = plan(["runtime/bin/notest.ts"]);
  check("bin source selecting 0 suites at L1 AND L2 ⇒ L3", p.level === "L3" && p.reasons.some((r: string) => /NO_TESTS_SELECTED at L2/.test(r)));

  // never lowers CI; L3 lists full gate
  p = plan(["src/x.ts"]);
  check("L3 lists the FULL test:report list + build + independent inspection", p.tests.L3.length === BASE_SUITES.length && ["build", "typecheck", "trust-anchor", "full-test-report", "independent-inspection", "pre-merge-CI"].every((s) => p.steps.some((x: any) => x.step === s)));
  check("every plan keeps mandatoryPreMergeCI true", [plan(["docs/a.md"]), plan(["runtime/core/c.ts"]), plan(["runtime/core/a.ts"]), plan(["src/x.ts"])].every((x: any) => x.mandatoryPreMergeCI === true));
  check("escalate never exceeds L3 and lifts DOCS_ONLY to ≥ L2", V.escalate("L3") === "L3" && V.escalate("L2") === "L3" && V.escalate("L1") === "L2" && V.escalate("DOCS_ONLY") === "L2");
  check("plan is frozen", Object.isFrozen(p) && Object.isFrozen(p.tests));

  // grounding on the real repo (read-only): the real test:report list parses and the real graph resolves this module
  const root = path.join(__dirname, "..", "..");
  const real = V.chooseLevel(["runtime/core/odg-verification-level.ts"], { root });
  check("real repo: graph builds, full list parses, own test selected at L1", real.graph.ok === true && real.tests.L3.length > 100 && real.tests.L1.includes("runtime/core/odg-verification-level.test.ts"));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
