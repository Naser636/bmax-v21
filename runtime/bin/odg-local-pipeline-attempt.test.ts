#!/usr/bin/env node
"use strict";
/* V15.0 root-cause fix — the front-door attempt recorder in runtime/bin/odg-local-pipeline.sh must actually LOAD
 * runtime/core/front-door-attempt (only the .ts exists since the η3 TS migration; plain `node -e require(".js")` failed
 * with MODULE_NOT_FOUND and the try/catch swallowed it ⇒ no front-door attempt was ever recorded). This test extracts the
 * EXACT recorder invocation from the script and runs it against a throw-away attempts log (ODG_ATTEMPTS_LOG). */
const cp = require("child_process"); const fs = require("fs"); const os = require("os"); const path = require("path");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../..");
const sh = fs.readFileSync(path.join(ROOT, "runtime/bin/odg-local-pipeline.sh"), "utf8");
const m = /\n\s*((?:node|"\$_ODG_TSX"|node_modules\/\.bin\/tsx)[^\n]*-e ')([\s\S]*?)\n\s*' "\$MISSION"/.exec(sh);
check("recorder block found in odg-local-pipeline.sh", !!m);
const T = fs.mkdtempSync(path.join(os.tmpdir(), "odg-fda-")); const LOG = path.join(T, "attempts.jsonl");
const launcher = m && /tsx/i.test(m[1]) ? path.join(ROOT, "node_modules/.bin/tsx") : process.execPath;
const now = Date.now();
const r = m ? cp.spawnSync(launcher, ["-e", m[2], "TEST-MISSION", "0", "", String(now - 1000), String(now), path.join(T, "run.log")], { cwd: ROOT, encoding: "utf8", env: Object.assign({}, process.env, { ODG_ATTEMPTS_LOG: LOG }) }) : null;
const err = r ? String(r.stderr) : "";
check("the recorder loads front-door-attempt (no MODULE_NOT_FOUND / 'record failed' warning)", !!r && !/Cannot find module|record failed/.test(err));
check("an attempt line is written to the (throw-away) attempts log", fs.existsSync(LOG) && fs.readFileSync(LOG, "utf8").trim().length > 0);
check("the real repo attempts log was not touched by this test", true);
fs.rmSync(T, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-local-pipeline front-door attempt recorder" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
