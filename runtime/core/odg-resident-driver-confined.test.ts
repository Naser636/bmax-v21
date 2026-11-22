#!/usr/bin/env node
"use strict";
/* V15 — confined resident-driver launcher (bwrap) tested END TO END without systemd, in a THROW-AWAY copy of the repo:
 * rebuild path (TRUSTED, before the sandbox), fresh-build path, tsx fallback, stop signal; negative controls inside the
 * confinement: source / runtime/dist / runtime/logs (other files, symlink planting) writes refused, ONLY the driver's own
 * trace written by the TRUSTED launcher after the sandbox (confined code has NO writable host path: it can neither truncate
 * nor rewrite the trace history, nor back-date / inject a line), host Unix sockets unreachable, loopback only. */
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
const r4 = launch({ ODG_RESIDENT_NO_BUILD: "1" });
check("tsx fallback (stale build, rebuild skipped): local tsx runs CONFINED under read-only HOME (no npx), exit 0", r4.status === 0 && /tsx fallback/.test(r4.stderr) && /level=L0_OBSERVE/.test(r4.stdout));
const VIEW = `. scripts/lib/odg-confined-view.sh; odg_confined_view "${T}";`;
fs.renameSync(path.join(T, "runtime/logs/resident-driver-l0.log"), path.join(T, "runtime/logs/real.log")); fs.symlinkSync("real.log", path.join(T, "runtime/logs/resident-driver-l0.log"));
const r6 = launch();
check("launcher REFUSES when the trace file is a symlink (no bind through a planted link)", r6.status !== 0 && /not a regular file/.test(r6.stderr));
fs.rmSync(path.join(T, "runtime/logs/resident-driver-l0.log")); fs.renameSync(path.join(T, "runtime/logs/real.log"), path.join(T, "runtime/logs/resident-driver-l0.log"));
const after = snap().split("\n").filter((x) => !x.startsWith("runtime/bin/odg-resident-driver-tick.ts:")).join("\n");
check("only runtime/logs and runtime/dist changed (every other file identical)", after === before.split("\n").filter((x) => !x.startsWith("runtime/bin/odg-resident-driver-tick.ts:")).join("\n"));
check("log contains the 4 confined ticks first (refused 5th run wrote nothing)", fs.readFileSync(path.join(T, "runtime/logs/resident-driver-l0.log"), "utf8").trim().split("\n").length === 4);
const probe = (cmd: string) => sh(`${VIEW} exec "\${BW[@]}" --chdir "${T}" ${cmd}`);
check("negative: write to source refused inside the confinement", probe(`/bin/sh -c 'echo x >> runtime/core/odg-resident-driver.ts'`).status !== 0);
check("negative: write to scripts/ and docs/ refused", probe(`/bin/sh -c 'echo x > scripts/x || echo y > docs/x'`).status !== 0);
check("positive control: the confined view itself runs (true ⇒ exit 0)", probe(`/bin/sh -c 'true'`).status === 0);
{ const lp = path.join(T, "runtime/logs/resident-driver-l0.log"); const h0 = fs.readFileSync(lp, "utf8");
  const t1 = probe(`/bin/sh -c ': > runtime/logs/resident-driver-l0.log'`), t2 = probe(`/bin/sh -c 'echo forged >> runtime/logs/resident-driver-l0.log'`);
  check("negative: the trace file itself is NOT writable inside the confinement (no truncate / rewrite / append of history)", t1.status !== 0 && t2.status !== 0 && fs.readFileSync(lp, "utf8") === h0); }
check("negative: write into runtime/dist refused (no planting of JS run by unconfined services)", probe(`/bin/sh -c 'echo x > runtime/dist/bin/odg-schedule-tick.js || echo x >> runtime/dist/bin/odg-resident-driver-tick.js'`).status !== 0 && probe(`/bin/sh -c 'echo x >> runtime/dist/bin/odg-resident-driver-tick.js'`).status !== 0);
check("negative: create/replace files or symlinks in runtime/logs refused (other unconfined writers safe)", probe(`/bin/sh -c 'echo x > runtime/logs/radar-weekly.log'`).status !== 0 && probe(`/bin/sh -c 'ln -s ../../scripts/x runtime/logs/radar-weekly.log'`).status !== 0 && probe(`/bin/sh -c 'rm -f runtime/logs/resident-driver-l0.log'`).status !== 0);
const big = sh(`ODG_SCHEDULER_STOP=1 ODG_RESIDENT_MAX_FILE_KB=1 bash scripts/odg-resident-driver-confined.sh "${T}" >/dev/null 2>&1; ${VIEW} exec "\${BW[@]}" --chdir "${T}" /bin/sh -c 'ulimit -f 4; head -c 100000 /dev/zero > /tmp/fill'`);
check("disk-fill bound: a write beyond RLIMIT_FSIZE inside the confinement (private /tmp) fails", big.status !== 0);
{ const lp = path.join(T, "runtime/logs/resident-driver-l0.log"); const keep = fs.readFileSync(lp); fs.writeFileSync(lp, Buffer.concat([keep, Buffer.alloc(3 * 1024 * 1024, 0x2e), Buffer.from("\n")]));
  const g = sh(`ODG_RESIDENT_MAX_FILE_KB=1 bash scripts/odg-resident-driver-confined.sh "${T}"`);
  check("a trace ALREADY larger than the per-run cap does not block the tick (cap is relative to current size)", g.status === 0 && /level=L0_OBSERVE/.test(g.stdout) && fs.statSync(lp).size > 3 * 1024 * 1024 + keep.length);
  fs.writeFileSync(lp, keep); }
{ const lp = path.join(T, "runtime/logs/resident-driver-l0.log"); const tp = path.join(T, "runtime/bin/odg-resident-driver-tick.ts"); const orig = fs.readFileSync(tp, "utf8");
  const h0 = fs.readFileSync(lp, "utf8"); const year = String(new Date().getUTCFullYear());
  fs.writeFileSync(tp, `const fs=require("fs");try{fs.writeFileSync("runtime/logs/resident-driver-l0.log","")}catch{}process.stdout.write("[1999-01-01T00:00:00.000Z] L0 tick: level=L0_OBSERVE state=IDLE writes=0\\n");process.exit(0);\nexport {};\n`);
  const m1 = launch({ ODG_RESIDENT_NO_BUILD: "1" }); const h1 = fs.readFileSync(lp, "utf8"); const last1 = h1.trim().split("\n").pop() || "";
  check("hostile tick: its truncate attempt fails (history intact) and its back-dated line is re-stamped with the LAUNCHER clock", m1.status === 0 && h1.startsWith(h0) && last1.startsWith("[" + year) && !last1.includes("1999") && /state=IDLE/.test(last1));
  fs.writeFileSync(tp, `process.stdout.write("[2026-01-01T00:00:00.000Z] L0 tick: state=IDLE \\u001b[2K\\n[2026-01-01T00:00:00.000Z] L0 tick: state=IDLE\\u0007\\n");process.exit(0);\nexport {};\n`);
  const m2 = launch({ ODG_RESIDENT_NO_BUILD: "1" }); const h2 = fs.readFileSync(lp, "utf8"); const added = h2.slice(h1.length).trim().split("\n");
  check("hostile tick: control characters / non-conforming output ⇒ exactly ONE launcher line state=INVALID_TRACE", h2.startsWith(h1) && added.length === 1 && /state=INVALID_TRACE/.test(added[0]) && !/[\u0000-\u001f]/.test(added[0]));
  fs.writeFileSync(tp, orig); }
const uid = String(os.userInfo().uid);
const s = probe(`"$(readlink -f "$(command -v node)")" -e 'const n=require("net");const ps=["/run/user/${uid}/bus","/run/user/${uid}/systemd/private","/run/dbus/system_bus_socket"];let k=ps.length,h=[];for(const p of ps){const c=n.connect(p);c.on("connect",()=>{h.push(p);c.destroy();if(!--k)fin()});c.on("error",()=>{if(!--k)fin()})}function fin(){process.stdout.write(h.length?"REACHABLE":"NONE")}'`);
check("negative: host Unix sockets (user systemd manager, D-Bus) unreachable", s.stdout === "NONE");
const n = probe(`"$(readlink -f "$(command -v node)")" -e 'process.stdout.write(Object.keys(require("os").networkInterfaces()).join(","))'`);
check("negative: only the loopback interface", n.stdout === "lo");
fs.rmSync(T, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-resident-driver-confined (V15)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
