#!/usr/bin/env node
"use strict";

/*
 * odg backup | restore — regression for the governed CLI surface (runtime/bin/odg-backup.js).
 * Verifies, on SYNTHETIC temporary stores only (no real/production store, no network, no provider):
 *   - backup of a synthetic store writes a manifest and is read-only on the source;
 *   - restore to a fresh synthetic target is byte-identical;
 *   - restore fails closed on a corrupted manifest (INTEGRITY_MISMATCH) and writes nothing;
 *   - restore refuses a non-empty target without --force (TARGET_NOT_EMPTY);
 *   - restore refuses missing --manifest/--target, and REFUSES the real production store as a target;
 *   - exit codes are honest (0 ok, 1 fail-closed, 2 bad-arg/forbidden).
 * Pure in-process CLI invocation (main) + child-process exit-code checks. Run: node runtime/bin/odg-backup.test.js
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const BIN = path.join(__dirname, "odg-backup.js");
const M = require("./odg-backup.js");

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); passed += 1; };

// Run the CLI as a child process; capture {code, out}. Never throws on non-zero exit.
function run(args, env) {
  try {
    const out = execFileSync("node", [BIN, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
}
const lastJson = (out) => { const lines = out.trim().split("\n").filter(Boolean); return JSON.parse(lines[lines.length - 1]); };

// --- synthetic store with 2 fake records (no secrets, no real data) -------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odgbk-"));
const store = path.join(tmp, "store");
fs.mkdirSync(path.join(store, "requests"), { recursive: true });
fs.writeFileSync(path.join(store, "requests", "r1.json"), JSON.stringify({ requestId: "r1", client: "ACME", status: "NEW" }));
fs.writeFileSync(path.join(store, "requests", "r2.json"), JSON.stringify({ requestId: "r2", client: "BETA", status: "HELD" }));
const srcHashes = () => execFileSync("bash", ["-c", `cd ${store} && find . -type f | sort | xargs sha256sum`]).toString();
const before = srcHashes();

// --- 1. backup writes a manifest, read-only on source ---------------------------------------------
const manifestFile = path.join(tmp, "backup.json");
const b = run(["backup", "--out", manifestFile], { ODG_CLIENT_STORE: store });
ok("backup exit 0", b.code === 0);
ok("backup wrote the manifest file", fs.existsSync(manifestFile));
ok("backup reports count 2 + hash", lastJson(b.out).count === 2 && typeof lastJson(b.out).manifestHash === "string");
ok("backup is read-only on the source (hashes unchanged)", srcHashes() === before);

// --- 2. restore to fresh synthetic target is byte-identical ---------------------------------------
const target = path.join(tmp, "restored");
const r = run(["restore", "--manifest", manifestFile, "--target", target]);
ok("restore exit 0 to fresh target", r.code === 0 && lastJson(r.out).ok === true);
const tgtHashes = execFileSync("bash", ["-c", `cd ${target} && find . -type f | sort | xargs sha256sum`]).toString();
ok("restore is byte-identical to source", tgtHashes === before);

// --- 3. corrupted manifest fails closed (INTEGRITY_MISMATCH), writes nothing ----------------------
const corrupt = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
corrupt.files[0].content = corrupt.files[0].content + "TAMPER"; // content no longer matches stored sha256
const corruptFile = path.join(tmp, "corrupt.json");
fs.writeFileSync(corruptFile, JSON.stringify(corrupt));
const corruptTarget = path.join(tmp, "restored-corrupt");
const rc = run(["restore", "--manifest", corruptFile, "--target", corruptTarget]);
ok("restore corrupted → exit 1 INTEGRITY_MISMATCH", rc.code === 1 && lastJson(rc.out).code === "INTEGRITY_MISMATCH");
ok("restore corrupted wrote NOTHING to target", !fs.existsSync(corruptTarget));

// --- 4. non-empty target refused without --force; accepted with explicit --force ------------------
const rne = run(["restore", "--manifest", manifestFile, "--target", target]); // target now non-empty
ok("restore non-empty target no-force → exit 1 TARGET_NOT_EMPTY", rne.code === 1 && lastJson(rne.out).code === "TARGET_NOT_EMPTY");
const rf = run(["restore", "--manifest", manifestFile, "--target", target, "--force"]);
ok("restore non-empty target WITH explicit --force → exit 0", rf.code === 0 && lastJson(rf.out).ok === true);

// --- 5. argument validation + production-store safety refusal (fail-closed, exit 2) ---------------
ok("restore missing --target → exit 2 TARGET_REQUIRED", (() => { const x = run(["restore", "--manifest", manifestFile]); return x.code === 2 && lastJson(x.out).code === "TARGET_REQUIRED"; })());
ok("restore missing --manifest → exit 2 MANIFEST_REQUIRED", (() => { const x = run(["restore", "--target", target]); return x.code === 2 && lastJson(x.out).code === "MANIFEST_REQUIRED"; })());
ok("restore into real production store REFUSED (exit 2, not overridden)", (() => { const x = run(["restore", "--manifest", manifestFile, "--target", "/var/lib/odg/clients"]); return x.code === 2 && lastJson(x.out).code === "TARGET_FORBIDDEN_PRODUCTION"; })());
ok("restore into configured $ODG_CLIENT_STORE REFUSED", (() => { const x = run(["restore", "--manifest", manifestFile, "--target", store], { ODG_CLIENT_STORE: store }); return x.code === 2 && lastJson(x.out).code === "TARGET_FORBIDDEN_PRODUCTION"; })());

// --- 6. isProdTarget unit (pure) ------------------------------------------------------------------
ok("isProdTarget true for /var/lib/odg/clients", M.isProdTarget("/var/lib/odg/clients") === true);
ok("isProdTarget true for a path inside the prod store", M.isProdTarget("/var/lib/odg/clients/requests") === true);
ok("isProdTarget false for a synthetic temp target", M.isProdTarget(target) === false);

// --- 7. backup fails closed when store not configured ---------------------------------------------
ok("backup unconfigured store → exit 1 STORE_NOT_READY", (() => { const x = run(["backup"], { ODG_CLIENT_STORE: "", NODE_ENV: "production" }); return x.code === 1 && lastJson(x.out).code === "STORE_NOT_READY"; })());

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort cleanup of own tmp */ }
console.log(`\nALL PASS — odg backup/restore (${passed} assertions)`);
process.exit(0);
