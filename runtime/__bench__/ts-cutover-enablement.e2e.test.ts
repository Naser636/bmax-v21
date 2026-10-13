// @ts-nocheck
/*
 * η3-B105 — P2-CUTOVER-ENABLEMENT (provenance + freshness; front-door alignment; reversible rollback).
 *
 * Builds on B104's entry-point controlled build by adding artifact PROVENANCE + FRESHNESS so a cutover
 * never runs a STALE compiled runtime (the documented B104 limitation). Qualifies, from an out-of-tree
 * sandbox (git archive HEAD + the B105 working-tree files overlaid; node_modules symlinked — install
 * fidelity is proven separately by clean-clone-ts-proof.e2e.test.ts via a REAL npm ci):
 *   - the build records a deterministic provenance block (source sha per closure input);
 *   - the validator detects a STALE dist (source changed after build) and rebuilds; backward-compatible
 *     with a provenance-less manifest;
 *   - front-door alignment: the compiled ENTRY needs ODG_STAGE_BASE=runtime/dist/core for FULL-TS
 *     stages (entry-only ⇒ JS stages, by design — front door B/adapter seam);
 *   - JS≡TS parity; reversible rollback to JavaScript; NO silent fallback.
 *
 * Never touches the dev worktree. Honest exit codes: 0=PASS, 1=FAIL. Sandbox removed on success.
 */
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
let failures = 0;
function check(c, label) { if (c) console.log("  PASS " + label); else { failures++; console.log("  FAIL " + label); } }
function run(cmd, a, cwd, env) { const r = spawnSync(cmd, a, { cwd, encoding: "utf8", env: { ...process.env, ...(env || {}) }, maxBuffer: 64 * 1024 * 1024 }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; }
const helper = (sb, env) => run("bash", ["runtime/bin/odg-ensure-ts-runtime.sh"], sb, env);
const manifest = (sb) => { const p = path.join(sb, "runtime/dist/dist-closure-manifest.json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; };

console.log("η3-B105 — P2-CUTOVER-ENABLEMENT (provenance + freshness; alignment; rollback)");

const BASE = process.env.ODG_CLEAN_CLONE_BASE || path.join(os.homedir(), ".cache", "odg-clean-clone");
fs.mkdirSync(BASE, { recursive: true });
const SB = fs.mkdtempSync(path.join(BASE, "b105-"));
let ok = false;
try {
  run("bash", ["-c", "git archive HEAD | tar -x -C " + JSON.stringify(SB)], REPO);
  for (const rel of ["scripts/build-dist-closure.js", "runtime/bin/odg-ensure-ts-runtime.sh", "runtime/bin/odg-local-pipeline.sh"]) {
    fs.copyFileSync(path.join(REPO, rel), path.join(SB, rel));
  }
  fs.chmodSync(path.join(SB, "runtime/bin/odg-ensure-ts-runtime.sh"), 0o755);
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(SB, "node_modules"));
  const DIST = path.join(SB, "runtime", "dist");
  const reportPath = path.join(SB, "runtime", "generated", "mission-report.json");

  // 1. Build records provenance (deterministic, inputs = emitted + copied).
  const h1 = helper(SB, {});
  check(h1.status === 0, "entry build succeeds on the clean sandbox");
  const m = manifest(SB);
  check(m && m.provenance && m.provenance.schema === 1 && Array.isArray(m.provenance.inputs) && m.provenance.inputs.length === m.totalClosure + 1, `manifest carries provenance (inputs=${m && m.provenance && m.provenance.inputCount} = closure ${m && m.totalClosure} + entry)`);
  check(m && m.provenance.inputs.every((i) => i.srcRel && i.srcSha && i.kind), "every provenance input has srcRel + srcSha + kind");

  // 2. reproducible provenance: a second clean build ⇒ byte-identical manifest.
  const sha1 = require("crypto").createHash("sha256").update(fs.readFileSync(path.join(DIST, "dist-closure-manifest.json"))).digest("hex");
  const h2 = helper(SB, { ODG_TS_REBUILD: "1" });
  const sha2 = require("crypto").createHash("sha256").update(fs.readFileSync(path.join(DIST, "dist-closure-manifest.json"))).digest("hex");
  check(h2.status === 0 && sha1 === sha2, "provenance manifest is reproducible across clean builds (no volatile fields)");

  // 3. valid+fresh dist ⇒ reused (not rebuilt).
  check(/structurally valid — reusing/.test(helper(SB, {}).out), "fresh dist ⇒ reused (freshness PASS)");

  // 4. FRESHNESS: mutate a tracked SOURCE file ⇒ validator flags STALE ⇒ rebuild ⇒ srcSha updated.
  const srcProbe = path.join(SB, "runtime/core/budget-contract.js");
  const before = fs.readFileSync(srcProbe);
  fs.appendFileSync(srcProbe, "\n// b105 freshness probe\n");
  const h4 = helper(SB, {});
  check(/STALE: source changed/.test(h4.out) && /explicit controlled build OK/.test(h4.out), "source changed after build ⇒ STALE detected ⇒ entry rebuilds");
  const m4 = manifest(SB);
  const inp = m4 && m4.provenance.inputs.find((i) => i.srcRel === "runtime/core/budget-contract.js");
  const freshSha = require("crypto").createHash("sha256").update(fs.readFileSync(srcProbe)).digest("hex").slice(0, 16);
  check(inp && inp.srcSha === freshSha, "rebuilt manifest records the NEW source sha (genuinely rebuilt from current source)");
  fs.writeFileSync(srcProbe, before); // restore
  helper(SB, { ODG_TS_REBUILD: "1" });

  // 5. backward-compat: a provenance-less manifest still passes freshness by omission (structural only).
  const mp = path.join(DIST, "dist-closure-manifest.json");
  const noProv = JSON.parse(fs.readFileSync(mp, "utf8")); delete noProv.provenance; fs.writeFileSync(mp, JSON.stringify(noProv));
  check(/structurally valid — reusing/.test(helper(SB, {}).out), "manifest without provenance ⇒ structural-only validity (backward compatible)");

  // 6. ALIGNMENT — the compiled ENTRY runs; FULL-TS needs ODG_STAGE_BASE=runtime/dist/core.
  helper(SB, { ODG_TS_REBUILD: "1" });
  const tsFull = run("node", ["runtime/dist/bin/odg-run.js", "QUAL_CLEAN_GATEB"], SB, { ODG_STAGE_BASE: "runtime/dist/core" });
  check(tsFull.status === 0 && /PIPELINE SUCCESS/.test(tsFull.out), "front-door-A/B FULL-TS: compiled entry + ODG_STAGE_BASE=dist/core ⇒ SUCCESS");
  const tsRep = fs.readFileSync(reportPath);
  const tsEntryOnly = run("node", ["runtime/dist/bin/odg-run.js", "QUAL_CLEAN_GATEB"], SB, { ODG_STAGE_BASE: "" });
  check(tsEntryOnly.status === 0 && /PIPELINE SUCCESS/.test(tsEntryOnly.out), "compiled entry with NO stage base ⇒ runs JS stages (documented partial, by design)");
  // adapter seam (front door B) honours ODG_RUNTIME_ENTRY and inherits env (static, source-confirmed).
  const adapter = fs.readFileSync(path.join(SB, "src/runtime/autonomy-runtime-adapter.ts"), "utf8");
  check(/ODG_RUNTIME_ENTRY/.test(adapter) && /resolvePipelineEntry/.test(adapter), "adapter (front door B) exposes the ODG_RUNTIME_ENTRY opt-in seam (operator sets entry+base ⇒ full TS)");

  // 7. PARITY — JS default on the same sandbox, byte-identical mission report.
  const js = run("node", ["runtime/bin/odg-run.js", "QUAL_CLEAN_GATEB"], SB, {});
  check(js.status === 0 && /PIPELINE SUCCESS/.test(js.out), "JS default (rollback target) runs SUCCESS");
  const jsRep = fs.readFileSync(reportPath);
  check(tsRep.length > 0 && tsRep.equals(jsRep), "JS ≡ full-TS mission-report BYTE-IDENTICAL (parity)");

  // 8. REVERSIBLE ROLLBACK + no silent fallback: a STALE/forced-missing dist refuses on the TS path but
  //    the JS default remains fully operational.
  fs.rmSync(DIST, { recursive: true, force: true });
  // Simulate toolchain gone so the entry CANNOT build ⇒ must refuse (no silent fallback), not run JS.
  const SB2 = fs.mkdtempSync(path.join(BASE, "b105-notools-"));
  try {
    run("bash", ["-c", "git archive HEAD | tar -x -C " + JSON.stringify(SB2)], REPO);
    for (const rel of ["scripts/build-dist-closure.js", "runtime/bin/odg-ensure-ts-runtime.sh", "runtime/bin/odg-local-pipeline.sh"]) fs.copyFileSync(path.join(REPO, rel), path.join(SB2, rel));
    fs.chmodSync(path.join(SB2, "runtime/bin/odg-ensure-ts-runtime.sh"), 0o755);
    const h8 = helper(SB2, {});
    check(h8.status !== 0 && /NO silent fallback|not installed/.test(h8.out), `no toolchain ⇒ TS entry STOPS, no silent fallback (exit=${h8.status})`);
    const jsStill = run("node", ["runtime/bin/odg-run.js", "QUAL_CLEAN_GATEB"], SB2, {});
    check(jsStill.status === 0 && /PIPELINE SUCCESS/.test(jsStill.out), "rollback: JS default still runs SUCCESS when the TS path is unavailable");
  } finally { fs.rmSync(SB2, { recursive: true, force: true }); }

  ok = failures === 0;
} finally {
  if (ok) fs.rmSync(SB, { recursive: true, force: true });
  else console.log("sandbox preserved for forensics: " + SB);
}
console.log(failures === 0 ? "ALL PASS — TS CUTOVER ENABLEMENT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
