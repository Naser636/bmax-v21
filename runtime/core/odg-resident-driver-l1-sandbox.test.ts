#!/usr/bin/env node
"use strict";
/* V375 Lot B — resident driver: L0 tick honours the canonical stop signal; L1 cycle is pure (no write, never executes,
 * never triggers L2) and, when bubblewrap is available, runs under a READ-ONLY / no-network sandbox with zero write. */
const cp = require("child_process"); const path = require("path"); const fs = require("fs");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../.."); const TSX = path.join(ROOT, "node_modules/.bin/tsx");
// the L0 tick runs in a THROW-AWAY cwd (inspection MEDIUM): it reads docs/odg/v124-consolidated-roadmap.json from cwd and
// appends its trace only if <cwd>/runtime/logs exists — absent here ⇒ the real technical log is never touched.
const os = require("os"); const TMPCWD = fs.mkdtempSync(path.join(os.tmpdir(), "odg-l1-")); fs.mkdirSync(path.join(TMPCWD, "docs/odg"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "docs/odg/v124-consolidated-roadmap.json"), path.join(TMPCWD, "docs/odg/v124-consolidated-roadmap.json"));
const run = (file: string, env: any) => cp.spawnSync(process.execPath, [TSX, path.join(ROOT, file)], { cwd: TMPCWD, env: Object.assign({}, process.env, env), encoding: "utf8", timeout: 120000 });
const t0 = run("runtime/bin/odg-resident-driver-tick.ts", { ODG_SCHEDULER_STOP: "1" });
check("L0 tick with ODG_SCHEDULER_STOP=1 ⇒ state=STOPPED (canonical stop signal now injected)", /state=STOPPED/.test(t0.stdout || ""));
const t1 = run("runtime/bin/odg-resident-driver-tick.ts", { ODG_SCHEDULER_STOP: "" });
check("L0 tick without the stop signal ⇒ not STOPPED, still L0, writes=0", /level=L0_OBSERVE/.test(t1.stdout || "") && !/state=STOPPED/.test(t1.stdout || "") && /writes=0/.test(t1.stdout || ""));
check("the throw-away cwd received no trace (no runtime/logs created)", !fs.existsSync(path.join(TMPCWD, "runtime")));
const c0 = run("runtime/bin/odg-resident-driver-l1-cycle.ts", { ODG_SCHEDULER_STOP: "" }); let j: any = null; try { j = JSON.parse(c0.stdout); } catch {}
check("L1 cycle: level L1_SIMULATE, persisted=false, wouldExecute=false, canTriggerL2=false", !!j && j.l1.level === "L1_SIMULATE" && j.l1.persisted === false && j.l1.canTriggerL2 === false && (j.l1.simulatedDecision.wouldExecute === false || j.l1.simulatedDecision.idle === true));
const c1 = run("runtime/bin/odg-resident-driver-l1-cycle.ts", { ODG_SCHEDULER_STOP: "1" }); let k: any = null; try { k = JSON.parse(c1.stdout); } catch {}
check("L1 cycle under stop ⇒ no observation, idle decision", !!k && k.emergencyStopEngaged === true && k.l1.basedOnObservation === null && k.l1.simulatedDecision.idle === true);
const hasBwrap = cp.spawnSync("sh", ["-c", "command -v bwrap && bwrap --ro-bind / / --unshare-all true"], { encoding: "utf8" }).status === 0;
if (hasBwrap) {
  const s = cp.spawnSync("bash", [path.join(ROOT, "scripts/odg-resident-driver-l1-sandbox.sh"), ROOT], { encoding: "utf8", timeout: 180000 }); let e: any = null; try { e = JSON.parse(s.stdout); } catch {}
  check("sandbox: filesystem READ_ONLY (write probe refused), NO host Unix socket reachable (systemd/D-Bus), only loopback, zeroWrite fingerprint", !!e && e.sandbox.fs === "READ_ONLY" && e.sandbox.hostSockets === "NONE_REACHABLE" && e.sandbox.netInterfaces === "lo" && e.zeroWrite === true && e.cycle.l1.persisted === false);
} else process.stdout.write("skip - bubblewrap unavailable (CI): sandbox run is evidenced in docs/odg/evidence/LOT_B_L1_SANDBOX_EVIDENCE.json\n");
fs.rmSync(TMPCWD, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-resident-driver L1 sandbox (V375 Lot B)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
