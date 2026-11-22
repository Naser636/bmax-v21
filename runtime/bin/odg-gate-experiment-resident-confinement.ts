#!/usr/bin/env node
"use strict";
/* V15 — REAL measured experiment through the canonical gate (odg-improvement-chain → odg-sandbox-integration-gate):
 * "confine the resident-driver tick". Every one of the 12 conditions is MEASURED here (baseline = unconfined run,
 * candidate = confined launcher), in a THROW-AWAY copy of the repo; nothing is asserted. Review/inspection count only via
 * an OWNER-anchored inspection record on origin/main bound to the candidate commit (V15 closure); non-regression = the real required CI
 * check of the given commit (gh, read-only). The real repository is fingerprinted before/after (must be identical).
 * Usage: --ci-commit <sha> [--write <evidence.json>]   (simulation ≠ execution: nothing is installed or deployed) */
const cp = require("child_process"); const fs = require("fs"); const os = require("os"); const path = require("path"); const crypto = require("crypto");
const MG = require("../core/odg-gate-measured-evidence.js");
const EVV = require("../core/odg-evidence-verifier.js");   // committed-tree reader (origin/main)
const ROOT = path.resolve(__dirname, "../..");
const sha = (b: any) => crypto.createHash("sha256").update(b).digest("hex");
const sh = (cwd: string, script: string, env: any = {}) => cp.spawnSync("bash", ["-c", script], { cwd, env: Object.assign({}, process.env, env), encoding: "utf8", timeout: 240000 });
function fingerprint(dir: string): string { const r = sh(dir, "{ git rev-parse HEAD; git status --porcelain=v1 --untracked-files=all; git ls-files -s | sha256sum; } | sha256sum"); return (r.stdout || "").trim(); }

function main() {
  const argv = process.argv.slice(2); const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const ciCommit = arg("--ci-commit"); const out = arg("--write");
  if (!ciCommit || !/^[0-9a-f]{7,40}$/.test(ciCommit)) throw new Error("--ci-commit <sha> required");
  const M: any[] = []; const add = (condition: string, method: string, observed: any, passed: boolean) => M.push({ condition, method, observed, passed });
  const realBefore = fingerprint(ROOT);
  // throw-away copy
  const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-gx-")));
  for (const d of ["runtime/core", "runtime/bin", "scripts"]) fs.cpSync(path.join(ROOT, d), path.join(T, d), { recursive: true, filter: (s: string) => !s.includes(`${path.sep}dist${path.sep}`) });
  fs.mkdirSync(path.join(T, "docs/odg"), { recursive: true }); fs.copyFileSync(path.join(ROOT, "docs/odg/v124-consolidated-roadmap.json"), path.join(T, "docs/odg/v124-consolidated-roadmap.json"));
  fs.copyFileSync(path.join(ROOT, "package.json"), path.join(T, "package.json")); fs.symlinkSync(fs.realpathSync(path.join(ROOT, "node_modules")), path.join(T, "node_modules"));
  // 1. V12.4 link (the companion really lists the mission)
  const comp = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/v124-consolidated-roadmap.json"), "utf8"));
  const link = JSON.stringify(comp).includes('"CM-V234-RESIDENT-DRIVER"');
  add("linkedToV124", "companion docs/odg/v124-consolidated-roadmap.json lists CM-V234-RESIDENT-DRIVER", link, link);
  // baseline / candidate probes (same probe set; baseline = unconfined shell in T, candidate = the confined view)
  const uid = String(os.userInfo().uid); const NODE = fs.realpathSync(process.execPath);
  const PROBES: Array<[string, string]> = [
    ["writeSource", `/bin/sh -c 'echo x >> runtime/core/odg-resident-driver.ts'`],
    ["writeDist", `/bin/sh -c 'mkdir -p runtime/dist/bin && echo x > runtime/dist/bin/odg-schedule-tick.js'`],
    ["createInLogs", `/bin/sh -c 'mkdir -p runtime/logs; echo x > runtime/logs/radar-weekly.log'`],
    ["truncateTrace", `/bin/sh -c ': > runtime/logs/resident-driver-l0.log'`],
    ["symlinkInLogs", `/bin/sh -c 'ln -sf ../../scripts/x runtime/logs/planted.lnk'`],
    ["hostSocket", `${NODE} -e 'const n=require("net");const c=n.connect("/run/user/${uid}/systemd/private");c.on("connect",()=>{c.destroy();process.exit(0)});c.on("error",()=>process.exit(1))'`],
    ["nonLoopbackNet", `${NODE} -e 'process.exit(Object.keys(require("os").networkInterfaces()).some(k=>k!=="lo")?0:1)'`],
  ];
  const VIEW = `. scripts/lib/odg-confined-view.sh; mkdir -p runtime/logs; touch runtime/logs/resident-driver-l0.log; odg_confined_view "${T}";`;   // V15 trace integrity: nothing writable (the launcher writes the trace after the sandbox)
  const run = (confined: boolean) => PROBES.map(([k, c]) => ({ probe: k, open: (confined ? sh(T, `${VIEW} exec "\${BW[@]}" --chdir "${T}" ${c}`) : sh(T, c)).status === 0 }));
  const baseline = run(false);
  const baseOpen = baseline.filter((p) => p.open).length;
  add("baselineRecorded", "7 attack-surface probes run UNCONFINED in the throw-away copy before the change", baseline, baseline.length === PROBES.length);
  add("needDemonstrated", "baseline: attack surfaces AVAILABLE to an unconfined tick (capability by construction, not a demonstrated incident) > 0", baseOpen, baseOpen > 0);
  fs.rmSync(path.join(T, "runtime/logs"), { recursive: true, force: true }); fs.rmSync(path.join(T, "runtime/dist"), { recursive: true, force: true });
  sh(T, "git init -q 2>/dev/null; true"); // (copy is not a repo; the probes above wrote only inside T)
  for (const f of ["runtime/core/odg-resident-driver.ts"]) fs.copyFileSync(path.join(ROOT, f), path.join(T, f));   // undo baseline source write
  const candidate = run(true);
  const candOpen = candidate.filter((p) => p.open).length;
  add("securityValidated", "confinement of the 7 probed surfaces (writes, trace truncation, symlink, host socket, non-loopback net) — all REFUSED; scope = these probes, NOT a full security validation", candidate, candOpen === 0);
  add("measurableGainOrNewCapability", "attack surface removed: available surfaces baseline → candidate (strict decrease to 0); not a measured risk reduction", { baseline: baseOpen, candidate: candOpen }, candOpen === 0 && baseOpen > candOpen);
  // functional: the real confined launcher (rebuild path, stop signal, tsx fallback)
  const L = (env: any = {}) => sh(T, `bash scripts/odg-resident-driver-confined.sh "${T}"`, env);
  const f1 = L(), f2 = L({ ODG_SCHEDULER_STOP: "1" });
  fs.appendFileSync(path.join(T, "runtime/bin/odg-resident-driver-tick.ts"), "\n// stale\n"); const f3 = L({ ODG_RESIDENT_NO_BUILD: "1" });
  const fOk = f1.status === 0 && /level=L0_OBSERVE/.test(f1.stdout) && /writes=0/.test(f1.stdout) && /state=STOPPED/.test(f2.stdout) && f3.status === 0 && /tsx fallback/.test(f3.stderr);
  add("functionalTestsPass", "confined launcher: L0 tick (rebuild path) exit 0 + writes=0; stop signal ⇒ STOPPED; stale build ⇒ confined tsx fallback", { normal: f1.status, stopped: /state=STOPPED/.test(f2.stdout), fallback: f3.status }, fOk);
  // rollback: the un-confined normal launcher (= not installing the drop-in) still works
  const rb = sh(T, "bash scripts/odg-resident-driver-run.sh");
  add("rollbackAvailable", "rollback = keep the existing ExecStart (normal launcher); measured: it still runs, exit 0, L0 line", rb.status, rb.status === 0 && /level=L0_OBSERVE/.test(rb.stdout));
  // isolation + no contract/permission violation: everything happened in T; real repository unchanged
  const realAfter = fingerprint(ROOT);
  add("isolatedExperiment", "runs in a throw-away copy under os.tmpdir() (path check) + bubblewrap for the candidate; see noContractOrPermissionViolation for the repo check", T.startsWith(fs.realpathSync(os.tmpdir())), T.startsWith(fs.realpathSync(os.tmpdir())));
  add("noContractOrPermissionViolation", "real repository fingerprint (HEAD + status + index; NOT gitignored paths) identical before/after; runner writes only in the throw-away copy; no systemd/sudo action", { before: realBefore.slice(0, 16), after: realAfter.slice(0, 16) }, !!realBefore && realBefore === realAfter);
  // non-regression: the real required CI check of the commit carrying the change
  const full = (cp.spawnSync("git", ["rev-parse", "--verify", ciCommit + "^{commit}"], { cwd: ROOT, encoding: "utf8" }).stdout || "").trim();   // gh needs the FULL sha
  const ci = cp.spawnSync("gh", ["run", "list", "--commit", full || ciCommit, "--json", "name,conclusion,headSha", "--limit", "5"], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
  let runs: any[] = []; try { runs = JSON.parse(ci.stdout || "[]"); } catch {}
  const green = runs.length > 0 && runs.every((r) => r.conclusion === "success");   // pending ("") or failure ⇒ not proven
  add("nonRegressionPass", "GitHub Actions required check on commit " + ciCommit + " (gh run list, read-only)", runs.map((r) => ({ name: r.name, conclusion: r.conclusion || "PENDING" })), green);
  // review + inspection: ONLY via an OWNER-anchored signature over the inspection record read from origin/main
  // (inspection HIGH: a provider-authored VERIFIED WIC would be self-certification). Signature sidecar: <record>.sig.json.
  const reader = EVV.makeCommittedReader(ROOT, "origin/main"); const EVP = "docs/odg/evidence/V15_RESIDENT_CONFINEMENT_INSPECTION.json";
  let rec: any = null, signed: any = null; try { rec = JSON.parse(String(reader(EVP) || "")); } catch {} try { signed = JSON.parse(String(reader(EVP.replace(/\.json$/, ".sig.json")) || "")); } catch {}
  // V15 closure (audit D2/D3): review/inspection are computed INSIDE runMeasuredExperiment from the owner-anchored record,
  // bound to THIS candidate (record.subjectCommit must equal the full CI commit); no measurement can assert them.
  fs.rmSync(T, { recursive: true, force: true });
  const r = MG.runMeasuredExperiment({ ownerReview: { record: rec, signed, candidateCommit: full }, id: "V15-EXP-resident-confinement", v124Link: "CM-V234-RESIDENT-DRIVER", discovery: "1180 organizational Truth-Lock refusals + unconfined resident tick (V375)", significant: true }, M);
  const evidence = { experiment: "V15-EXP-resident-confinement", ciCommit, ranAt: new Date().toISOString(), measurements: M, derived: r.derived, verdict: r.chain.verdict, action: r.chain.action, softMissing: r.chain.softMissing, hardViolations: r.chain.hardViolations, deployed: false, deployStillOwnerGated: true,
    note: "simulation ≠ execution: the experiment ran in a throw-away copy; nothing was installed, enabled or deployed. INTEGRATE would mean merge-eligible only." };
  if (out) fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ verdict: evidence.verdict, action: evidence.action, satisfied: r.chain.satisfied, softMissing: evidence.softMissing, hardViolations: evidence.hardViolations, basis: r.derived.basis }) + "\n");
}
main();
export {};
