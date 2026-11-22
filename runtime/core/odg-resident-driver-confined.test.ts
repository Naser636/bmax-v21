#!/usr/bin/env node
"use strict";
/* V15 — confined resident-driver launcher (bwrap) tested END TO END without systemd, in a THROW-AWAY copy of the repo:
 * rebuild path, fresh-build path, tsx fallback (esbuild hidden), stop signal, and negative controls (source write refused,
 * host Unix sockets unreachable, only loopback); only runtime/logs + runtime/dist may change. */
const cp = require("child_process"); const fs = require("fs"); const os = require("os"); const path = require("path");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../..");
const ok = cp.spawnSync("sh", ["-c", "command -v bwrap >/dev/null && bwrap --unshare-all --ro-bind / / true"], { encoding: "utf8" }).status === 0;
if (!ok) { process.stdout.write("skip - bubblewrap unavailable\n\nALL PASS — odg-resident-driver-confined (V15) [skipped]\n"); process.exit(0); }
const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-conf-")));
for (const d of ["runtime/core", "runtime/bin", "scripts"]) fs.cpSync(path.join(ROOT, d), path.join(T, d), { recursive: true, filter: (s: string) => !s.includes(`${path.sep}dist${path.sep}`) });
fs.mkdirSync(path.join(T, "docs/odg"), { recursive: true }); fs.copyFileSync(path.join(ROOT, "docs/odg/v124-consolidated-roadmap.json"), path.join(T, "docs/odg/v124-consolidated-roadmap.json"));
fs.copyFileSync(path.join(ROOT, "package.json"), path.join(T, "package.json"));
fs.symlinkSync(fs.realpathSync(path.join(ROOT, "node_modules")), path.join(T, "node_modules"));
const sh = (script: string, env: any = {}) => cp.spawnSync("bash", ["-c", script], { cwd: T, env: Object.assign({}, process.env, env), encoding: "utf8", timeout: 240000 });
const launch = (env: any = {}) => sh(`bash scripts/odg-resident-driver-confined.sh "${T}"`, env);
const snap = () => { const out: string[] = []; const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isSymbolicLink()) continue; if (e.isDirectory()) walk(p); else out.push(path.relative(T, p) + ":" + fs.statSync(p).size + ":" + fs.statSync(p).mtimeMs); } }; walk(T); return out.filter((x) => !/^runtime\/(logs|dist)\//.test(x)).sort().join("\n"); };
const before = snap();
const r1 = launch();
check("rebuild path (no dist): tick runs confined, L0 IDLE/observing, writes=0, exit 0", r1.status === 0 && /level=L0_OBSERVE/.test(r1.stdout) && /writes=0/.test(r1.stdout) && fs.existsSync(path.join(T, "runtime/dist/bin/odg-resident-driver-tick.js")));
const r2 = launch();
check("fresh-build path: second run uses the precompiled build, exit 0", r2.status === 0 && /level=L0_OBSERVE/.test(r2.stdout) && !/tsx fallback/.test(r2.stderr));
const r3 = launch({ ODG_SCHEDULER_STOP: "1" });
check("stop signal passes through the confinement ⇒ state=STOPPED", r3.status === 0 && /state=STOPPED/.test(r3.stdout));
fs.writeFileSync(path.join(T, "runtime/bin/odg-resident-driver-tick.ts"), fs.readFileSync(path.join(T, "runtime/bin/odg-resident-driver-tick.ts"), "utf8") + "\n// touch\n");
const VIEW = `. scripts/lib/odg-confined-view.sh; odg_confined_view "${T}" runtime/logs runtime/dist;`;
const r4 = sh(`${VIEW} BW+=(--ro-bind /dev/null "$(readlink -f node_modules)/.bin/esbuild"); exec "\${BW[@]}" --chdir "${T}" /bin/bash scripts/odg-resident-driver-run.sh`);
check("tsx fallback (stale build + esbuild unavailable): local tsx works under read-only HOME (no npx cache), exit 0", r4.status === 0 && /tsx fallback/.test(r4.stderr) && /level=L0_OBSERVE/.test(r4.stdout));
const after = snap().split("\n").filter((x) => !x.startsWith("runtime/bin/odg-resident-driver-tick.ts:")).join("\n");
check("only runtime/logs and runtime/dist changed (every other file identical)", after === before.split("\n").filter((x) => !x.startsWith("runtime/bin/odg-resident-driver-tick.ts:")).join("\n"));
check("log contains exactly the 4 confined ticks", fs.readFileSync(path.join(T, "runtime/logs/resident-driver-l0.log"), "utf8").trim().split("\n").length === 4);
const probe = (cmd: string) => sh(`${VIEW} exec "\${BW[@]}" --chdir "${T}" ${cmd}`);
check("negative: write to source refused inside the confinement", probe(`/bin/sh -c 'echo x >> runtime/core/odg-resident-driver.ts'`).status !== 0);
check("negative: write to scripts/ and docs/ refused", probe(`/bin/sh -c 'echo x > scripts/x || echo y > docs/x'`).status !== 0);
check("positive control: write to runtime/logs allowed", probe(`/bin/sh -c 'echo x > runtime/logs/probe'`).status === 0);
const uid = String(os.userInfo().uid);
const s = probe(`"$(readlink -f "$(command -v node)")" -e 'const n=require("net");const ps=["/run/user/${uid}/bus","/run/user/${uid}/systemd/private","/run/dbus/system_bus_socket"];let k=ps.length,h=[];for(const p of ps){const c=n.connect(p);c.on("connect",()=>{h.push(p);c.destroy();if(!--k)fin()});c.on("error",()=>{if(!--k)fin()})}function fin(){process.stdout.write(h.length?"REACHABLE":"NONE")}'`);
check("negative: host Unix sockets (user systemd manager, D-Bus) unreachable", s.stdout === "NONE");
const n = probe(`"$(readlink -f "$(command -v node)")" -e 'process.stdout.write(Object.keys(require("os").networkInterfaces()).join(","))'`);
check("negative: only the loopback interface", n.stdout === "lo");
fs.rmSync(T, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-resident-driver-confined (V15)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
