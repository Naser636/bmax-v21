#!/usr/bin/env node
"use strict";
/* V15.9 — NATIVE BUILD ISOLATION: model-written code runs ONLY in the outer bwrap sandbox. Adversarial: the 7 known
 * in-process escapes (documented by #913) attempted FROM GENERATED SOURCE must not touch the host (marker file absent,
 * host secret not read, no process spawned); plus the outer layer ALONE (raw program, no vm) cannot write/read the host,
 * spawn onto the host or reach the network; timeout, memory bomb, garbage output and nonce forgery are all fail-closed;
 * no sandbox ⇒ NOT_RUN (never an in-process fallback); a host-function test is REFUSED without the explicit opt-in.
 * CONTROL: the same escape through the legacy UNISOLATED path DOES reach the host (proves the probes are real).
 * Needs bubblewrap (CI installs it). */
const fs = require("fs");
const os = require("os");
const path = require("path");
const N = require("./odg-native-build-sandbox");
const B = require("./native-project-builder");
const NBO = require("./native-build-outcome");
const LMB = require("./odg-local-model-benchmark");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
// diagnostics: on a failing isolated run, print outcome + reason (never masks the failure)
const diag = (r: any): string => r ? ` [status=${r.status} outcome=${r.outcome} reason=${String(r.reason || "")} buildError=${String(r.buildError || "")} verifyError=${String(r.verifyError || "")} wallMs=${r.wallMs}]` : " [no result]";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-nbs-"));
const SECRET = "ODG-HOST-SECRET-" + Date.now();
const secretFile = path.join(dir, "secret.txt"); fs.writeFileSync(secretFile, SECRET);
const marker = (n: string) => path.join(dir, "marker-" + n);

// each payload: try to obtain host fs via one escape, write a marker + read the secret; report what happened.
function payload(name: string, getFs: string): string {
  return `let __o = "NOT_TRIED";
try { const fs = (${getFs}); fs.writeFileSync(${JSON.stringify(marker(name))}, "x"); __o = "ESCAPED:" + fs.readFileSync(${JSON.stringify(secretFile)}, "utf8"); }
catch (e) { __o = "BLOCKED:" + String(e && e.message); }
module.exports = () => __o;`;
}
const ESCAPES: Array<[string, string]> = [
  ["require.cache", "(() => { const c = require.cache; return c[Object.keys(c)[0]].require('fs'); })()"],
  ["module.constructor._load", "module.constructor._load('fs')"],
  ["module.constructor.createRequire", "module.constructor.createRequire('/')('fs')"],
  ["process.mainModule.require", "process.mainModule.require('fs')"],
  ["process.getBuiltinModule", "process.getBuiltinModule('fs')"],
  ["Function('return process')", "(function () {}).constructor('return process')().getBuiltinModule('fs')"],
  ["process.binding", "(() => { const b = process.binding('fs'); return { writeFileSync: (p) => b.open(p, 0o101, 0o644), readFileSync: () => 'binding' }; })()"],
];
// dynamic import() is async: it is attempted at load time and its outcome captured.
const IMPORT_PAYLOAD = `var __o = "PENDING"; try { import("fs").then((fs) => { fs.writeFileSync(${JSON.stringify(marker("import"))}, "x"); __o = "ESCAPED"; }, (e) => { __o = "BLOCKED:" + String(e && e.message); }); } catch (e) { __o = "BLOCKED:" + String(e && e.message); }
module.exports = () => __o;`;

function observe(src: string): any {
  const r = N.runIsolated({ "evil.js": src }, { kind: "none" }, { repair: { entry: "evil.js", examples: [{ args: [] }] } });
  let o: any = null; try { o = JSON.parse(r.repairObservations[0]); } catch { o = null; }
  return { r, o, value: o && o.ok ? o.value : null };
}

(async () => {
  // ROOT-CAUSE regression (CI): the sandbox must run the HOST's interpreter by absolute path and bind a non-system prefix
  const nb = N.nodeBinding();
  check(nb.command === process.execPath && (nb.roBind === null ? /^\/(usr|lib|lib64|bin|sbin)\//.test(process.execPath) : process.execPath.startsWith(nb.roBind + "/")), "sandbox runs process.execPath (not PATH 'node'); a non-system install prefix is bound read-only: " + JSON.stringify(nb));
  const probe = N.probeSandbox();
  check(probe.ok === true, "bubblewrap sandbox probe OK (required for the isolation tests): " + String(probe.reason));
  process.stderr.write("diag: probe=" + JSON.stringify(probe) + "\n");

  // ---- 1. the 7 in-process escapes, FROM GENERATED SOURCE, through the isolated path ----
  for (const [name, getFs] of ESCAPES) {
    const { r, value } = observe(payload(name, getFs));
    check(r.status === "EXECUTED" && r.buildOk === true, `escape ${name}: sandbox executed the build` + diag(r));
    check(typeof value === "string" && value.startsWith("BLOCKED:") && !value.includes(SECRET), `escape ${name}: BLOCKED inside the sandbox (observed: ${String(value).slice(0, 90)})`);
    check(!fs.existsSync(marker(name)), `escape ${name}: host marker file ABSENT`);
  }
  const imp = observe(IMPORT_PAYLOAD);
  check(typeof imp.value === "string" && imp.value.startsWith("BLOCKED") && !fs.existsSync(marker("import")), `escape dynamic import(): BLOCKED + host marker ABSENT (observed: ${String(imp.value).slice(0, 90)})`);
  // the candidate has no stdout channel (cannot forge the nonce line) and cannot redefine the loader's verdict entrypoint
  // V8 gives every context a `console`, but in a vm context it is NOT wired to the process stdout ⇒ no output channel.
  let seenStdout = "";
  const capRunner = (prog: string, n: string, o: any) => { const r = LMB.defaultCodeRunner(prog, { timeoutMs: 15000 }); seenStdout = String(r.stdout || ""); return r; };
  const leak = N.runIsolated({ "f.js": "try { console.log('ODG-CONSOLE-LEAK'); } catch (e) {} try { console.error('ODG-CONSOLE-LEAK'); } catch (e) {} module.exports = (a, b) => a + b;" }, { kind: "source", source: "(m) => m['f.js'](2, 3) === 5" }, { runner: capRunner });
  check(leak.verified === true && seenStdout.length > 0 && !seenStdout.includes("ODG-CONSOLE-LEAK"), "model code has no stdout channel (console inside the vm context reaches nothing) ⇒ cannot print a nonce line");
  const tamper = N.runIsolated({ "f.js": "try { globalThis.__odgRunTest = () => 'T'; } catch (e) {} try { Object.defineProperty(globalThis, '__odgRunTest', { value: () => 'T' }); } catch (e) {} module.exports = (a, b) => a - b;" }, { kind: "source", source: "(m) => m['f.js'](2, 3) === 5" });
  check(tamper.verified === false && tamper.outcome === "FAIL", "a candidate redefining the verdict entrypoint cannot flip a wrong result to PASS");

  // ---- 2. the OUTER layer alone (as if the vm layer were escaped): raw program inside bwrap ----
  const nonce = N.newNonce();
  const raw = [
    "const fs = require('fs'); const cp = require('child_process'); const net = require('net'); const r = {};",
    `try { fs.writeFileSync(${JSON.stringify(marker("raw-write"))}, 'x'); r.write = 'OK'; } catch (e) { r.write = 'BLOCKED:' + e.code; }`,
    `try { r.read = fs.readFileSync(${JSON.stringify(secretFile)}, 'utf8'); } catch (e) { r.read = 'BLOCKED:' + e.code; }`,
    `try { const s = cp.spawnSync('/usr/bin/touch', [${JSON.stringify(marker("raw-spawn"))}]); r.spawn = 'status:' + s.status; } catch (e) { r.spawn = 'BLOCKED:' + e.code; }`,
    "try { r.home = fs.readdirSync('/home').length; } catch (e) { r.home = 'BLOCKED:' + e.code; }",
    "r.env = Object.keys(process.env).sort().join(',');",
    "const s = net.connect({ host: '127.0.0.1', port: 11434 }); s.setTimeout(1500);",
    `const done = (v) => { r.net = v; process.stdout.write('\\n' + ${JSON.stringify(nonce)} + JSON.stringify(r) + '\\n'); process.exit(0); };`,
    "s.on('connect', () => done('CONNECTED')); s.on('error', (e) => done('BLOCKED:' + e.code)); s.on('timeout', () => done('BLOCKED:timeout'));",
  ].join("\n");
  const rr = LMB.defaultCodeRunner(raw, { timeoutMs: 15000 });
  const ro = rr.ran ? LMB.parseResult(rr.stdout, nonce) : null;
  check(ro !== null, "outer-layer probe produced a nonce-stamped report" + ` [ran=${rr.ran} exitOk=${rr.exitOk} reason=${String(rr.reason || "")}]`);
  if (ro) {
    check(!fs.existsSync(marker("raw-write")) && String(ro.write).startsWith("BLOCKED"), `outer layer: write to a host path fails (${ro.write}) + host marker ABSENT`);
    check(String(ro.read).startsWith("BLOCKED") && !String(ro.read).includes(SECRET), `outer layer: host secret file NOT readable (${ro.read})`);
    check(!fs.existsSync(marker("raw-spawn")), `outer layer: a spawned process cannot touch the host (${ro.spawn}; marker ABSENT)`);
    check(ro.net !== "CONNECTED", `outer layer: NO network — loopback Ollama unreachable (${ro.net})`);
    check(String(ro.home).startsWith("BLOCKED"), "outer layer: /home is not mounted");
    check(ro.env === "HOME,PATH,PWD" || ro.env === "HOME,PATH", `outer layer: env cleared (only ${ro.env})`);
  }

  // ---- 3. timeout, memory bomb, garbage output, nonce forgery ----
  const hang = N.runIsolated({ "f.js": "module.exports = () => { while (true) {} };" }, { kind: "source", source: "(m) => m['f.js']() === 1" }, { stepTimeoutMs: 500 });
  check(hang.verified === false && hang.outcome === "TIMEOUT", "infinite loop in the candidate ⇒ TIMEOUT (non-pass), host not hung" + diag(hang));
  const hangLoad = N.runIsolated({ "f.js": "while (true) {} module.exports = 1;" }, { kind: "source", source: "(m) => true" }, { stepTimeoutMs: 500 });
  check(hangLoad.verified === false && hangLoad.buildOk === false && hangLoad.outcome === "TIMEOUT", "infinite loop at module load ⇒ TIMEOUT build failure (non-pass)" + diag(hangLoad));
  const procHang = N.runIsolated({ "f.js": "module.exports = () => { while (true) {} };" }, { kind: "source", source: "(m) => m['f.js']() === 1" }, { stepTimeoutMs: 60000, processTimeoutMs: 1500 });
  check(procHang.verified === false && procHang.outcome === "TIMEOUT", "process-level timeout kills the sandbox ⇒ TIMEOUT (non-pass)" + diag(procHang));
  const bomb = N.runIsolated({ "f.js": "module.exports = () => { const a = []; for (;;) a.push(new Array(1e6).fill(7)); };" }, { kind: "source", source: "(m) => m['f.js']() === 1" });
  check(bomb.verified === false && bomb.status === "EXECUTED" && bomb.outcome !== "PASS", `memory bomb ⇒ bounded by RLIMIT_AS, non-pass (${bomb.outcome})`);
  const garbage = N.runIsolated({ "f.js": "module.exports = 1;" }, { kind: "source", source: "(m) => true" }, { runner: () => ({ ran: true, exitOk: true, stdout: "%%% not json \u0000 garbage" }) });
  check(garbage.verified === false && garbage.outcome === "CRASH_OR_NO_RESULT", "garbage sandbox output ⇒ fail-closed non-pass");
  const forged = N.runIsolated({ "f.js": "module.exports = 1;" }, { kind: "source", source: "(m) => true" }, { nonce: () => "ODGNBrealnonce0000000000000000:", runner: () => ({ ran: true, exitOk: true, stdout: "ODGNBforgednonce000000000000000:" + JSON.stringify({ build: { ok: true }, test: { kind: "source", verdict: "T" } }) }) });
  check(forged.verified === false && forged.outcome === "CRASH_OR_NO_RESULT", "a verdict behind a FORGED nonce is ignored ⇒ non-pass");
  const exitBad = N.runIsolated({ "f.js": "module.exports = 1;" }, { kind: "source", source: "(m) => true" }, { runner: () => ({ ran: true, exitOk: false, stdout: "", reason: "local model exited 134" }) });
  check(exitBad.verified === false && exitBad.outcome === "CRASH_OR_NO_RESULT", "non-zero sandbox exit ⇒ non-pass");

  // ---- 4. fail-closed policy in buildProject ----
  const gen = async () => ({ ok: true, content: "module.exports = (a, b) => a + b;" });
  const spyT = { called: false };
  const fnSpec = { name: "f", writeSet: ["f.js"], architecture: [{ path: "f.js", role: "add", contract: "add" }], independentTest: (m: any) => { spyT.called = true; return m["f.js"](2, 3) === 5; } };
  const refused = await B.buildProject(fnSpec, { generateFile: gen, maxRepair: 2 });
  check(refused.accepted === false && spyT.called === false && refused.executionMode === "REFUSED_UNISOLATED" && /REFUSED_UNISOLATED/.test(String(refused.verifyError)) && refused.repairs === 0, "host-function test WITHOUT the opt-in ⇒ REFUSED (never called in-process), not accepted, no blind repair");
  const optIn = await B.buildProject({ ...fnSpec, unisolatedInProcess: N.UNISOLATED_OPT_IN }, { generateFile: gen });
  check(optIn.accepted === true && spyT.called === true && optIn.executionMode === "UNISOLATED_IN_PROCESS" && optIn.isolation.hostExecutesModelCode === true, "explicit UNISOLATED_IN_PROCESS opt-in ⇒ legacy in-thread path, LABELLED hostExecutesModelCode=true");
  let genCalls = 0;
  const srcSpec = { name: "f", writeSet: ["f.js"], architecture: [{ path: "f.js", role: "add", contract: "add" }], independentTestSource: "(m) => m['f.js'](2, 3) === 5" };
  const notRun = await B.buildProject(srcSpec, { generateFile: async () => { genCalls++; return gen(); }, maxRepair: 3, sandboxRunner: () => ({ ran: false, reason: "bwrap missing (test)" }) });
  check(notRun.executionStatus === "NOT_RUN" && notRun.verified === null && notRun.accepted === false && notRun.repairs === 0 && notRun.repairStopReason === "NOT_RUN_NO_SANDBOX" && genCalls === 1, "no sandbox ⇒ NOT_RUN (verified=null, not accepted, no repair burn) — never an in-process fallback");
  check(NBO.deriveNativeOutcome(notRun, srcSpec, "MONOLITHIC", 1).outcome === "UNKNOWN", "a NOT_RUN build is recorded UNKNOWN (not a capability FAILURE)");
  const iso = await B.buildProject(srcSpec, { generateFile: gen });
  check(iso.accepted === true && iso.executionMode === "SANDBOX" && iso.executionStatus === "EXECUTED" && iso.isolation.hostExecutesModelCode === false && typeof iso.sandboxWallMs === "number", "serializable test ⇒ SANDBOX execution, accepted, provenance fields present" + ` [mode=${iso.executionMode} status=${iso.executionStatus} buildError=${iso.buildError} verifyError=${iso.verifyError}]`);
  const casesSpec = { ...srcSpec, independentTestSource: undefined, independentTestCases: [{ entry: "f.js", args: [2, 3], expect: 5 }, { entry: "f.js", args: [-1, 1], expect: 0 }] };
  check((await B.buildProject(casesSpec, { generateFile: gen })).accepted === true, "CASES form (host-graded, expected values never enter the sandbox) accepts correct code");
  check((await B.buildProject(casesSpec, { generateFile: async () => ({ ok: true, content: "module.exports = (a, b) => a * b;" }), maxRepair: 0 })).accepted === false, "CASES form rejects wrong code");
  // escapes through the FULL buildProject path: still blocked + host untouched
  const evilBuild = await B.buildProject({ name: "e", writeSet: ["e.js"], architecture: [{ path: "e.js", role: "x", contract: "x" }], independentTestSource: "(m) => true" }, { generateFile: async () => ({ ok: true, content: payload("bp-getBuiltinModule", "process.getBuiltinModule('fs')") }), maxRepair: 0 });
  check(evilBuild.executionMode === "SANDBOX" && !fs.existsSync(marker("bp-getBuiltinModule")), "escape via buildProject (default path) ⇒ host marker ABSENT");

  // ---- CONTROL: the same escape through the legacy UNISOLATED path DOES reach the host (the probes are real) ----
  const ctl = B.assembleAndLoad({ "evil.js": payload("control", "process.getBuiltinModule('fs')") });
  check(ctl.ok === true && String(ctl.modules["evil.js"]()).includes(SECRET) && fs.existsSync(marker("control")), "CONTROL: in-process (UNISOLATED) the escape writes the host marker + reads the secret — the isolated path is what blocks it");

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  if (failures === 0) process.stdout.write("ALL PASS — V15.9 NATIVE BUILD ISOLATION (7 escapes blocked, outer layer, timeout/OOM/garbage/forgery fail-closed)\n");
  process.exit(failures === 0 ? 0 : 1);
})();

export {};
