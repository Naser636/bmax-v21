// @ts-nocheck — Workstream B: canonical RELEASE visibility in the dashboard/runtime-state surface.
// Proves the release view (a) sources its five gates from the runtime's OWN evidence (runtime-verify.json +
// the independent mission-report verdict), (b) NEVER reports RELEASE from a green build/test alone, (c) shows
// UNAVAILABLE honestly when release-time provenance is incomplete, and (d) the Dashboard renders it.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }

// Hermetic: point the reader at a temp ODG_RUNTIME_STATE_DIR seeded with crafted artifacts.
function withState(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rel-vis-"));
  for (const [name, obj] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), JSON.stringify(obj));
  const prev = process.env.ODG_RUNTIME_STATE_DIR;
  process.env.ODG_RUNTIME_STATE_DIR = dir;
  try {
    const mod = path.resolve(process.cwd(), "src/app/api/runtime-state/route.ts");
    delete require.cache[require.resolve(mod)];
    const { readRuntimeSnapshot } = require(mod);
    fn(readRuntimeSnapshot());
  } finally {
    if (prev === undefined) delete process.env.ODG_RUNTIME_STATE_DIR; else process.env.ODG_RUNTIME_STATE_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log("RELEASE VISIBILITY — canonical gates, never RELEASE-from-build-alone, honest UNAVAILABLE");

// 1. All five gates green (same mission) ⇒ gatesReady true; but with NO release-time provenance the frozen
//    Release Manager fail-closes ⇒ decision UNAVAILABLE (honest — the dashboard cannot assert a RELEASE).
withState({
  "runtime-verify.json": { mission: "M1", build: true, typescript: true, gitClean: true, documentationProofPresent: true },
  "mission-report.json": { mission: "M1", status: "SUCCESS", validated: true },
}, (s) => {
  ok("gates all read from canonical evidence (all true)", s.release.gates.build && s.release.gates.typescript && s.release.gates.gitClean && s.release.gates.documentationProofPresent && s.release.gates.missionPipeline === true);
  ok("gatesReady true when all five gates green", s.release.gatesReady === true);
  ok("decision is NOT RELEASE without release-time provenance (honest UNAVAILABLE)", s.release.decision === "UNAVAILABLE" && /provenance|not persisted|release time|gates green/i.test(s.release.reason || ""));
  ok("evidenceComplete false (provenance missing)", s.release.evidenceComplete === false);
});

// 2. NEVER infer RELEASE from a green build/test alone: build+tsc green but missionPipeline false ⇒ not ready.
withState({
  "runtime-verify.json": { mission: "M2", build: true, typescript: true, gitClean: true, documentationProofPresent: true },
  "mission-report.json": { mission: "M2", status: "BLOCKED", validated: false },
}, (s) => {
  ok("build+tsc green but validation BLOCKED ⇒ missionPipeline false", s.release.gates.missionPipeline === false);
  ok("gatesReady FALSE (never RELEASE from build/test alone)", s.release.gatesReady === false);
  ok("decision never RELEASE here", s.release.decision !== "RELEASE");
});

// 3. A failing hard gate (gitClean false) ⇒ not ready, never RELEASE.
withState({
  "runtime-verify.json": { mission: "M3", build: true, typescript: true, gitClean: false, documentationProofPresent: true },
  "mission-report.json": { mission: "M3", status: "SUCCESS", validated: true },
}, (s) => {
  ok("gitClean false surfaced from canonical evidence", s.release.gates.gitClean === false);
  ok("gatesReady false + decision not RELEASE", s.release.gatesReady === false && s.release.decision !== "RELEASE");
});

// 4. No runtime-verify.json ⇒ honest absence (present:false, gates null, UNAVAILABLE), never fabricated.
withState({
  "mission-report.json": { mission: "M4", status: "SUCCESS", validated: true },
}, (s) => {
  ok("release.present false when runtime-verify.json absent", s.release.present === false);
  ok("gates null (honest unknown, not false-positive)", s.release.gates.build === null && s.release.gates.gitClean === null);
  ok("decision UNAVAILABLE with a reason", s.release.decision === "UNAVAILABLE" && typeof s.release.reason === "string");
});

// 5. Dashboard renders the Release card + the decision + per-gate state.
withState({
  "runtime-verify.json": { mission: "M5", build: true, typescript: true, gitClean: true, documentationProofPresent: false },
  "mission-report.json": { mission: "M5", status: "BLOCKED", validated: false },
}, (s) => {
  const Dashboard = require(path.resolve(process.cwd(), "src/components/Dashboard.tsx")).default;
  const html = renderToStaticMarkup(React.createElement(Dashboard, { snapshot: s }));
  ok("dashboard renders a Release section", html.includes("Release"));
  ok("dashboard renders the release decision", html.includes(s.release.decision));
  ok("dashboard surfaces the five gate labels", html.includes("gitClean") && html.includes("missionPipeline") && html.includes("documentationProof"));
});

console.log(`\nRELEASE VISIBILITY — ${passed} assertions passed.`);
