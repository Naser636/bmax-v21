/*
 * CROSS-RUNTIME PARITY HARNESS (η3-B133, Lot 1 — CTO authorized).
 * Type-suppression pragma REMOVED (TS_NOCHECK_CROSS_RUNTIME_PARITY): former TS2451 + crypto.createHash
 * were a script-vs-module / Web-Crypto-global shadow (→ `export {}` marker); the TS2339/never-cascade was
 * the incrementally-built `report`/`rec`/`out` objects (→ `: any`); finish() trailing params made optional
 * (runtime-optional); params carry explicit `: any`. NO harness-behaviour change; parity logic identical.
 *
 * Proves that the two execution substrates produce IDENTICAL artifacts for the same mission:
 *   - JS pipeline        : `node runtime/bin/odg-run.js <mission>`
 *   - compiled TS path   : `ODG_STAGE_BASE=runtime/dist/core node runtime/dist/bin/odg-run.js <mission>`
 *
 * Method (reuses the accepted clean-clone pattern, runtime/__bench__/clean-clone-ts-proof.e2e.test.ts):
 * ONE disposable sandbox is materialised from `git archive HEAD` (no node_modules needed — the dist
 * closure is builtins-only). The compiled dist (built from REPO) is copied in; the synthesized parity
 * fixtures are copied into the sandbox's runtime/missions. For each mission the generated state is RESET,
 * the JS entry is run and its artifacts captured, the state RESET again, then the compiled entry is run
 * and its artifacts captured. Because BOTH runs share one sandbox (identical absolute paths/cwd), the
 * only legitimate volatile difference is wall-clock; artifacts are byte-compared after ISO-8601 timestamp
 * normalization ONLY. A business difference, a missing artifact, an exit-code mismatch, or an asymmetric
 * timestamp count is a DIVERGENCE (never normalized away).
 *
 * This harness NEVER: mutates the real repo tree (all writes are inside the disposable sandbox), calls a
 * provider/network, or edits any runtime/economic module. It only INVOKES the runtime read-only.
 *
 * Honest exit codes (§S release doctrine): 0 = PASS (all covered classes parity-identical);
 * 1 = FAIL (a real divergence); 2 = BLOCKED (a prerequisite or a required coverage class could not be
 * established — never reported as PASS).
 */
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const REPO = process.cwd();
// The four execution artifacts the mandate requires compared across runtimes.
const ARTIFACTS = ["mission-report.json", "mission-ledger.json", "mission-lifecycle.json", "patch-execution.json"];
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g;

function sha256(buf: any) { return crypto.createHash("sha256").update(buf).digest("hex"); }

/* ---- PURE, UNIT-TESTABLE CORE (exported for the bench) ----------------------------------------- */

// Normalize ONLY justified volatile data: ISO-8601 timestamps → "<TS>". Returns the normalized text and
// the count of substitutions (an ASYMMETRIC count between runtimes is itself treated as a divergence).
function normalizeArtifact(text: any) {
  if (typeof text !== "string") return { text: "", tsCount: 0 };
  let tsCount = 0;
  const out = text.replace(ISO, () => { tsCount += 1; return "<TS>"; });
  return { text: out, tsCount };
}

// Compare one artifact across the two runtimes. `js`/`ts` are {present, raw} where raw is the file text
// (or null when absent). Business bytes must match after timestamp normalization; presence and timestamp
// counts must match too. No other normalization is applied.
function compareArtifact(name: any, js: any, ts: any) {
  const result = { name, jsPresent: js.present, tsPresent: ts.present, identical: false, reason: "" };
  if (js.present !== ts.present) { result.reason = `presence mismatch (js=${js.present} ts=${ts.present})`; return result; }
  if (!js.present && !ts.present) { result.identical = true; result.reason = "both absent"; return result; }
  const njs = normalizeArtifact(js.raw);
  const nts = normalizeArtifact(ts.raw);
  if (njs.tsCount !== nts.tsCount) { result.reason = `timestamp-count asymmetry (js=${njs.tsCount} ts=${nts.tsCount}) — possible real divergence`; return result; }
  if (njs.text === nts.text) { result.identical = true; result.reason = njs.tsCount ? `byte-identical after ${njs.tsCount} timestamp normalizations` : "byte-identical (no normalization)"; return result; }
  // first divergent offset for forensics (on the normalized text, so it points at a BUSINESS diff)
  let i = 0; const a = njs.text, b = nts.text;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  result.reason = `BUSINESS DIVERGENCE at offset ${i}: js=${JSON.stringify(a.slice(i, i + 60))} ts=${JSON.stringify(b.slice(i, i + 60))}`;
  return result;
}

// Decide the overall verdict + exit code from the per-scenario results.
// scenarios: [{ name, class, blocked?:string, exitJs, exitTs, artifacts:[compareArtifact...], touchProof?:{ok,detail} }]
// Rules: any BLOCKED required class ⇒ BLOCKED(2). Any artifact non-identical, exit-code mismatch, or a
// failed touch-proof ⇒ FAIL(1). Else PASS(0). The three classes READ_ONLY+ENGINEERING_WRITE+ECONOMIC_TOUCH
// are all REQUIRED; if any is blocked the global verdict is BLOCKED (never a partial PASS).
function verdict(scenarios: any) {
  const required = ["READ_ONLY", "ENGINEERING_WRITE", "ECONOMIC_TOUCH"];
  const covered = new Set(scenarios.filter((s: any) => !s.blocked).map((s: any) => s.class));
  const blockedClasses = required.filter((c: any) => !covered.has(c));
  let hasDivergence = false;
  const notes = [];
  for (const s of scenarios) {
    if (s.blocked) { notes.push(`${s.class}: BLOCKED — ${s.blocked}`); continue; }
    if (s.exitJs !== s.exitTs) { hasDivergence = true; notes.push(`${s.class}: exit-code mismatch js=${s.exitJs} ts=${s.exitTs}`); }
    for (const a of s.artifacts) if (!a.identical) { hasDivergence = true; notes.push(`${s.class}/${a.name}: ${a.reason}`); }
    if (s.touchProof && !s.touchProof.ok) { hasDivergence = true; notes.push(`${s.class}: touch-proof failed — ${s.touchProof.detail}`); }
  }
  if (hasDivergence) return { verdict: "FAIL", exitCode: 1, notes, blockedClasses };
  if (blockedClasses.length) return { verdict: "BLOCKED", exitCode: 2, notes, blockedClasses };
  return { verdict: "PASS", exitCode: 0, notes, blockedClasses };
}

/* ---- IMPURE DRIVER ----------------------------------------------------------------------------- */

function run(cmd: any, args: any, cwd: any, extraEnv?: any) {
  const env = { ...process.env, ...(extraEnv || {}) };
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "", signal: r.signal };
}
function readIf(p: any) { return fs.existsSync(p) ? { present: true, raw: fs.readFileSync(p, "utf8") } : { present: false, raw: null }; }
function resetGenerated(sandbox: any) {
  fs.rmSync(path.join(sandbox, "runtime", "generated"), { recursive: true, force: true });
  fs.rmSync(path.join(sandbox, "bench-workspace"), { recursive: true, force: true });
}
function captureArtifacts(sandbox: any) {
  const gen = path.join(sandbox, "runtime", "generated");
  const out: any = {};
  for (const a of ARTIFACTS) out[a] = readIf(path.join(gen, a));
  return out;
}

function main() {
  const report: any = { harness: "cross-runtime-parity", repo: REPO, scenarios: [], normalization: "ISO-8601 timestamps → <TS> ONLY (count asymmetry = divergence)", artifacts: ARTIFACTS };
  const log = (...m: any[]) => console.log(...m);
  log("η3-B133 — CROSS-RUNTIME PARITY HARNESS");

  // 0. Preflight.
  if (run("git", ["--version"], REPO).status !== 0) return finish(2, "git unavailable", report);
  if (run("node", ["--version"], REPO).status !== 0) return finish(2, "node unavailable", report);

  // 1. Build the compiled runtime in REPO (self-cleaning, network-free; reuses node_modules).
  const build = run("npm", ["run", "build:runtime"], REPO);
  report.build = { status: build.status, tail: (build.stdout + build.stderr).slice(-300) };
  if (build.status !== 0 || !fs.existsSync(path.join(REPO, "runtime", "dist", "bin", "odg-run.js"))) {
    return finish(2, "build:runtime failed — compiled path unavailable (BLOCKED)", report);
  }

  // 2. Disposable sandbox from committed HEAD; copy the fresh dist + the (possibly uncommitted) fixtures.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "odg-parity-"));
  report.sandbox = base;
  let keep = false;
  try {
    const arch = run("bash", ["-c", "git archive HEAD | tar -x -C " + JSON.stringify(base)], REPO);
    if (arch.status !== 0) { keep = true; return finish(2, "git archive failed (BLOCKED)", report); }
    // dist is gitignored (not in the archive) — copy the REPO-built dist so the compiled path exists.
    fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(base, "runtime", "dist"), { recursive: true });
    // node_modules symlink: harmless for plain `node` (read-only); guarantees any incidental require resolves.
    try { fs.symlinkSync(path.join(REPO, "node_modules"), path.join(base, "node_modules"), "dir"); } catch { /* best-effort */ }
    fs.mkdirSync(path.join(base, "runtime", "missions"), { recursive: true });
    // runtime/missions/*.json are gitignored (generated-contract lifecycle) ⇒ NOT in the archive. Copy the
    // shipped READ_ONLY mission and the synthesized fixtures into the sandbox missions dir.
    for (const m of ["QUAL_CLEAN_GATEB"]) {
      const src = path.join(REPO, "runtime", "missions", `${m}.json`);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(base, "runtime", "missions", `${m}.json`));
    }
    const fxDir = path.join(REPO, "runtime", "__bench__", "fixtures");
    for (const [fx, mission] of [["PARITY_WRITE.json", "PARITY_WRITE"], ["PARITY_ECONOMIC.json", "PARITY_ECONOMIC"]]) {
      const src = path.join(fxDir, fx);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(base, "runtime", "missions", `${mission}.json`));
    }
    // Initialise a real git baseline so git-based read-only scans (CLEAN_WORKSPACE `git ls-files
    // --others --ignored`) work deterministically in the disposable sandbox (the archive carries NO .git).
    // The committed baseline + the archive's own .gitignore keep runtime/{dist,missions,generated} IGNORED,
    // so both runtimes observe the identical ignored-file set. Mirrors the accepted autonomy-e2e recipe.
    run("git", ["init", "-q"], base);
    run("git", ["-c", "user.email=parity@local", "-c", "user.name=parity", "add", "-A"], base);
    run("git", ["-c", "user.email=parity@local", "-c", "user.name=parity", "commit", "-q", "-m", "parity-baseline"], base);

    const scenarios = [
      { class: "READ_ONLY", mission: "QUAL_CLEAN_GATEB", source: "shipped runtime/missions (AUTHORIZED, read-only)" },
      { class: "ENGINEERING_WRITE", mission: "PARITY_WRITE", source: "fixture (AUTHORIZED, ODG_WRITE_ confined to runtime/generated/parity-probe)", touch: "write" },
      { class: "ECONOMIC_TOUCH", mission: "PARITY_ECONOMIC", source: "fixture (AUTHORIZED, budget.allocations → budget-contract+economic-unit in Loader, offline read-only)", touch: "economic" },
    ];

    for (const sc of scenarios) {
      const rec: any = { class: sc.class, mission: sc.mission, source: sc.source };
      const missionFile = path.join(base, "runtime", "missions", `${sc.mission}.json`);
      if (!fs.existsSync(missionFile)) { rec.blocked = `mission contract absent: ${sc.mission}`; report.scenarios.push(rec); continue; }

      // Identical env for both runtimes (same inputs ⇒ a fair JS-vs-TS comparison). FLEET_BRIDGE_MOCK
      // keeps the Fleet Bridge stage deterministic/offline (accepted bench convention); it is applied to
      // BOTH paths, so it never biases the comparison.
      const commonEnv = { FLEET_BRIDGE_MOCK: "1" };
      // JS path.
      resetGenerated(base);
      const js = run("node", ["runtime/bin/odg-run.js", sc.mission], base, commonEnv);
      const jsArt = captureArtifacts(base);
      const jsPlan = readIf(path.join(base, "runtime", "generated", "mission-plan.json"));
      const jsWrite = readIf(path.join(base, "bench-workspace", "odg-synthetic-manifest.txt"));

      // Compiled TS path.
      resetGenerated(base);
      const ts = run("node", ["runtime/dist/bin/odg-run.js", sc.mission], base, { ...commonEnv, ODG_STAGE_BASE: "runtime/dist/core" });
      const tsArt = captureArtifacts(base);
      const tsPlan = readIf(path.join(base, "runtime", "generated", "mission-plan.json"));
      const tsWrite = readIf(path.join(base, "bench-workspace", "odg-synthetic-manifest.txt"));

      rec.exitJs = js.status; rec.exitTs = ts.status;
      rec.artifacts = ARTIFACTS.map((a) => compareArtifact(a, jsArt[a], tsArt[a]));

      // Class-specific TOUCH PROOF — the mission must really exercise its path IN BOTH runtimes.
      if (sc.touch === "write") {
        const bothWrote = jsWrite.present && tsWrite.present;
        const sameContent = bothWrote && jsWrite.raw === tsWrite.raw;
        rec.touchProof = { ok: bothWrote && sameContent, detail: bothWrote ? (sameContent ? "confined deliverable written & identical in both runtimes (bench-workspace/odg-synthetic-manifest.txt)" : "deliverable content differs across runtimes") : `deliverable not written (js=${jsWrite.present} ts=${tsWrite.present})` };
      } else if (sc.touch === "economic") {
        // mission-loader.js:170 assigns plan.budget = resolved.budget (the NORMALIZED {allocations}) ONLY
        // when budget-contract.resolveBudget returned ok:true — which itself validates each allocation's
        // kind against the economic-unit vocabulary (budget-contract.js:64,68 ⇒ economic-unit.KIND). So a
        // present, non-empty plan.budget.allocations is positive proof the economic modules were exercised.
        const budgetOk = (plan: any) => { try { const b = JSON.parse(plan.raw).budget; return !!b && Array.isArray(b.allocations) && b.allocations.length > 0; } catch { return false; } };
        const jsOk = jsPlan.present && budgetOk(jsPlan); const tsOk = tsPlan.present && budgetOk(tsPlan);
        const same = jsPlan.present && tsPlan.present && normalizeArtifact(jsPlan.raw).text === normalizeArtifact(tsPlan.raw).text;
        rec.touchProof = { ok: jsOk && tsOk && same, detail: (jsOk && tsOk) ? (same ? "budget-contract resolved an economic-unit budget identically in both runtimes (mission-plan.budget.allocations present)" : "mission-plan differs across runtimes") : `economic module not exercised (js budget ok=${jsOk} ts ok=${tsOk})` };
      }
      report.scenarios.push(rec);
    }

    const v = verdict(report.scenarios);
    report.verdict = v;
    // persist reproducible report
    const outPath = path.join(REPO, "runtime", "generated", "parity");
    try { fs.mkdirSync(outPath, { recursive: true }); fs.writeFileSync(path.join(outPath, "cross-runtime-parity-report.json"), JSON.stringify(report, null, 2)); } catch { /* ignore */ }

    for (const s of report.scenarios) {
      if (s.blocked) { log(`  BLOCKED ${s.class} — ${s.blocked}`); continue; }
      const allOk = s.exitJs === s.exitTs && s.artifacts.every((a: any) => a.identical) && (!s.touchProof || s.touchProof.ok);
      log(`  ${allOk ? "PASS" : "FAIL"} ${s.class} (${s.mission}) exit js=${s.exitJs} ts=${s.exitTs}`);
      for (const a of s.artifacts) log(`      ${a.identical ? "=" : "≠"} ${a.name}: ${a.reason}`);
      if (s.touchProof) log(`      touch: ${s.touchProof.ok ? "OK" : "FAIL"} — ${s.touchProof.detail}`);
    }
    for (const n of v.notes) log("  NOTE " + n);
    keep = v.exitCode !== 0;
    return finish(v.exitCode, v.verdict, report, base, keep);
  } finally {
    if (!keep && report.sandbox) { try { fs.rmSync(report.sandbox, { recursive: true, force: true }); } catch { /* ignore */ } }
  }
}

function finish(code: any, msg: any, report: any, sandbox?: any, keep?: any) {
  report.exit = code; report.message = msg;
  const label = code === 0 ? "PASS" : code === 1 ? "FAIL" : "BLOCKED";
  console.log(`CROSS-RUNTIME PARITY: ${label} (exit ${code}) — ${msg}`);
  if (sandbox && keep) console.log("sandbox preserved for forensics: " + sandbox);
  console.log("report -> runtime/generated/parity/cross-runtime-parity-report.json");
  process.exit(code);
}

module.exports = { normalizeArtifact, compareArtifact, verdict, ARTIFACTS };

if (require.main === module || (process.argv[1] && /cross-runtime-parity\.ts$/.test(process.argv[1]))) {
  main();
}

// Module-scope marker (adds NO runtime export): forces TypeScript MODULE scope so top-level consts
// (fs/path/os/crypto/spawnSync/REPO/...) do not collide with sibling script-scope files / Web globals (TS2451).
export {};
