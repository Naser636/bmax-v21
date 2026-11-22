#!/usr/bin/env node
"use strict";
/* V15.0 scenario L — the concurrency DECISION is measurement-driven: pure chooseLevel cases + one tiny real run. */
const path = require("path"); const cp = require("child_process");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const C = require("./odg-concurrency-calibrate.ts");
const m = (level: number, ms: number[], failures = 0) => ({ level, wallMs: ms, failures });
let d = C.chooseLevel([m(1, [100, 100]), m(2, [55, 56]), m(4, [40, 41]), m(8, [38, 39])], { minGain: 0.10 });
check("diminishing returns: 4 (40.5 ms) is within 10% of the best (8: 38.5 ms) ⇒ choose 4, not 8", d.chosen === 4 && d.speedupVsSerial === 2.47);
d = C.chooseLevel([m(1, [100]), m(4, [30], 1), m(2, [60])], { minGain: 0.10 });
check("a faster level WITH failures is ineligible ⇒ choose 2", d.chosen === 2);
d = C.chooseLevel([m(1, [100], 2), m(2, [50], 1)]);
check("no failure-free level ⇒ no choice (NO_FAILURE_FREE_LEVEL)", d.chosen === null && d.reason === "NO_FAILURE_FREE_LEVEL");
d = C.chooseLevel([m(1, [100]), m(2, [99])], { minGain: 0.10 });
check("parallelism with no gain ⇒ stay at 1", d.chosen === 1);
const ROOT = path.resolve(__dirname, "../..");
const r = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(__dirname, "odg-concurrency-calibrate.ts"), "--levels", "1,2", "--repeats", "1", "--suites", "3"], { cwd: ROOT, encoding: "utf8", timeout: 240000 });
let o: any = {}; try { o = JSON.parse(r.stdout); } catch {}
check("real run: exactly 3 hermetic suites EXECUTED at levels 1,2 (non-zero wall time each), failures counted, a decision made", r.status === 0 && o.workload && o.workload.suites === 3 && Array.isArray(o.measurements) && o.measurements.length === 2 && o.measurements.every((x: any) => x.wallMs.every((t: number) => t > 200)) && o.decision && (o.decision.chosen === 1 || o.decision.chosen === 2));
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-concurrency-calibrate (V15.0 L)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
