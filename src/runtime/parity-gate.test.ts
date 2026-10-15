// @ts-nocheck
/*
 * PARITY GATE WIRING LOCK (η3-B137).
 *
 * B133 built the cross-runtime parity harness (`npm run parity:runtimes`); B137 wires it into the
 * standard local validation path so a JS/TS divergence can no longer be ignored when the project is
 * validated normally. There is NO active CI in this repo (no .github/workflows, no husky) — the standard
 * path is the local `npm run validate` aggregator (npm test → tsc --noEmit → parity:runtimes), which
 * fails non-zero on any step including a parity divergence or a BLOCKED required class.
 *
 * This test is the WIRING LOCK: it runs inside the `npm test` glob (src/runtime/*.test.ts) and asserts
 * the parity gate stays wired into `validate`, so it cannot be silently removed. It does NOT re-run the
 * heavy parity harness (that is `validate`'s job — avoiding a redundant execution): it is a fast,
 * deterministic configuration lock. Reads package.json only; mutates no environment.
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
const scripts = pkg.scripts || {};
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok - " + name); passed += 1; }

console.log("PARITY GATE WIRING LOCK (B137)");

ok("the original parity entrypoint exists (B133)", scripts["parity:runtimes"] === "tsx scripts/cross-runtime-parity.ts");
ok("a standard validation aggregator `validate` exists", typeof scripts.validate === "string" && scripts.validate.length > 0);
const v = scripts.validate || "";
ok("validate runs the full test suite", /\bnpm test\b/.test(v));
ok("validate runs the TypeScript typecheck", /tsc --noEmit -p tsconfig\.json/.test(v));
ok("validate runs the cross-runtime parity gate", /\bnpm run parity:runtimes\b/.test(v));
// `&&` chaining ⇒ any non-zero step (incl. a parity divergence / BLOCKED exit 2) fails `validate`.
ok("validate chains steps with && (fails closed on any non-zero step)", /&&/.test(v) && v.indexOf("npm run parity:runtimes") > v.indexOf("npm test"));
// the harness file the gate depends on must be present (the gate cannot be a dangling reference).
ok("the parity harness script is present on disk", fs.existsSync(path.join(process.cwd(), "scripts", "cross-runtime-parity.ts")));
ok("the parity bench self-test is present on disk", fs.existsSync(path.join(process.cwd(), "runtime", "__bench__", "cross-runtime-parity.e2e.test.ts")));

console.log(`\nPARITY GATE WIRING LOCK — ${passed} assertions passed.`);
