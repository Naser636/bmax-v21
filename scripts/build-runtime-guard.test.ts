#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Regression for the odg-mission-runner build recurrence vector: the build:runtime guard
// must NOT report a dist as "fresh/complete" when a closure output file is missing (deleted artifact + unchanged inputs).
// distIsComplete(distDir, manifestPath) now verifies every manifest-recorded closure file exists — fail-closed.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const G = require("./build-runtime-guard.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// Phase-2A: the scripts-dist outputs are NOT in the closure manifest but ARE required by distIsComplete, so a COMPLETE
// fixture must include them (the production build always emits them). Pass {noScripts:true} to simulate their absence.
const SCRIPTS_OUT = ["scripts/compass-update.js", "scripts/capability-classify.js"];
function mkDist(inputs, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "distguard-"));
  fs.mkdirSync(path.join(dir, "core"), { recursive: true });
  const man = { generator: "test", emittedCount: inputs.length, copiedCount: 0, totalClosure: inputs.length, copied: [], provenance: { schema: 1, inputCount: inputs.length, inputs: inputs.map((r) => ({ distRel: r, srcRel: "x", srcSha: "y", kind: "emitted" })) } };
  fs.writeFileSync(path.join(dir, "dist-closure-manifest.json"), JSON.stringify(man));
  for (const r of inputs) { fs.mkdirSync(path.dirname(path.join(dir, r)), { recursive: true }); fs.writeFileSync(path.join(dir, r), "// " + r); }
  if (!opts.noScripts) { for (const r of SCRIPTS_OUT) { fs.mkdirSync(path.dirname(path.join(dir, r)), { recursive: true }); fs.writeFileSync(path.join(dir, r), "// " + r); } }
  return dir;
}
const MAN = (d) => path.join(d, "dist-closure-manifest.json");

// (1) every recorded closure file present ⇒ complete.
{
  const d = mkDist(["bin/odg-schedule-tick.js", "core/canary-decision-pack.js", "core/audit-log.js"]);
  try { ok("all closure files present ⇒ distIsComplete true", G.distIsComplete(d, MAN(d)) === true); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}
// (2) a recorded closure file deleted (inputs unchanged) ⇒ INCOMPLETE (the reproduced MODULE_NOT_FOUND vector).
{
  const d = mkDist(["bin/odg-schedule-tick.js", "core/canary-decision-pack.js"]);
  try { fs.rmSync(path.join(d, "core/canary-decision-pack.js")); ok("a missing manifest-listed output ⇒ distIsComplete false (forces rebuild, not a false 'fresh')", G.distIsComplete(d, MAN(d)) === false); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}
// (3) manifest without a recorded closure (no provenance.inputs) ⇒ fail-closed false.
{
  const d = mkDist(["core/x.js"]); fs.writeFileSync(MAN(d), JSON.stringify({ generator: "t", provenance: { schema: 1 } }));
  try { ok("manifest lacking provenance.inputs ⇒ false (fail-closed)", G.distIsComplete(d, MAN(d)) === false); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}
// (4) malformed manifest JSON ⇒ false (no throw).
{
  const d = mkDist(["core/x.js"]); fs.writeFileSync(MAN(d), "{ not json");
  try { ok("malformed manifest ⇒ false, no throw", G.distIsComplete(d, MAN(d)) === false); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}
// (5) missing dist/core dir or missing manifest ⇒ false.
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "distguard-empty-"));
  try { ok("no dist/core + no manifest ⇒ false", G.distIsComplete(d, MAN(d)) === false); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}
// (6) Phase-2A: all manifest closure files present but a scripts-dist OUTPUT missing (not manifest-recorded, inputs
// unchanged) ⇒ INCOMPLETE. Without the explicit check this would false-'fresh' and SKIP, leaving the dist dashboards
// silently UNAVAILABLE — the same stale-reuse class as (2), extended to the scripts-dist category this lot adds.
{
  const d = mkDist(["bin/odg-schedule-tick.js", "core/audit-log.js"]);
  try { fs.rmSync(path.join(d, "scripts/compass-update.js")); ok("a missing scripts-dist output ⇒ distIsComplete false (forces rebuild, no false 'fresh')", G.distIsComplete(d, MAN(d)) === false); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}
// (7) a dist WITH all manifest closure files AND the scripts-dist outputs ⇒ complete (the production shape).
{
  const d = mkDist(["bin/odg-schedule-tick.js", "core/audit-log.js"]);
  try { ok("manifest closure + scripts-dist outputs all present ⇒ distIsComplete true", G.distIsComplete(d, MAN(d)) === true); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}

console.log(`\nBUILD-RUNTIME-GUARD suite — ${pass} assertions passed. (distIsComplete verifies every closure output exists; a missing dist file forces a rebuild — no false 'fresh' SKIP.)`);
