#!/usr/bin/env node
// @ts-nocheck — behavioural security test (runs under tsx / compiled JS unchanged); suppresses tsc typechecking only.

/*
 * ts-project-check — SANDBOX CONFINEMENT regression (fixes an audited arbitrary-host-file-read + exfiltration).
 *
 * Black-box over the REAL checkTsProject(): a reviewed TypeScript project is untrusted input, and a plain `tsc`
 * follows `/// <reference path="…">` / imports to ANY host file the process can read, echoing its CONTENT into
 * diagnostics (→ the review's `evidence`). checkTsProject now runs tsc CONFINED in bubblewrap (project bound at a
 * fixed /project path; nothing else of the host FS present), FAIL-CLOSED if bwrap is unavailable. Proven here:
 *   - an out-of-project `/// <reference>` NEVER leaks the referenced file's content (the core security property),
 *     whether confined (TS6053 "not found") or fail-closed (BLOCKED) — a leak is impossible either way;
 *   - a legit clean project still PASSes and a real type error still FAILs with diagnostics (no over-block),
 *     asserted only when a real confined compiler is actually available on the host.
 * Hermetic: each case uses its OWN os.tmpdir() mkdtemp project + a separate out-of-project "secret" dir; paths are
 * computed (path.join), never literal "runtime/…" strings, so the suite is parallel-pool safe.
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const { checkTsProject } = require("./ts-project-check.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const SECRET = "p4ssw0rd-CI-SECRET-" + "abcdef123456";
const bwrapAvailable = (() => {
  try { const r = cp.spawnSync("/usr/bin/env", ["sh", "-c", "command -v bwrap"], { encoding: "utf8" }); return r && r.status === 0 && String(r.stdout || "").trim().length > 0; }
  catch { return false; }
})();
console.log(`ts-project-check confinement — bubblewrap ${bwrapAvailable ? "PRESENT (confined path)" : "ABSENT (fail-closed path)"}`);

function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

// 1. Out-of-project reference must NOT leak the referenced file's content, and must NOT be a PASS.
{
  const base = tmp("tsc-conf-");
  const proj = path.join(base, "attacker"); const secret = path.join(base, "secret");
  fs.mkdirSync(proj, { recursive: true }); fs.mkdirSync(secret, { recursive: true });
  fs.writeFileSync(path.join(secret, "s.ts"), `const PROD_DB_PASSWORD = "${SECRET}";\n`);
  fs.writeFileSync(path.join(proj, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, strict: true } }));
  fs.writeFileSync(path.join(proj, "evil.ts"), `/// <reference path="${path.join(secret, "s.ts")}" />\nconst leaked: 42 = PROD_DB_PASSWORD;\n`);
  const r = checkTsProject({ projectDir: proj });
  const blob = JSON.stringify(r);
  ok("1 out-of-project reference: secret CONTENT never appears in the result", !blob.includes(SECRET));
  ok("1 out-of-project reference: never reported as PASS", r.status !== "PASS");
  if (bwrapAvailable) ok("1 confined: the out-of-project file is unreadable (TS6053 not-found), not read", /TS6053|not found/.test(String(r.diagnostics || "")) || r.status === "FAIL");
  else ok("1 fail-closed: no bwrap ⇒ BLOCKED (never an unconfined run)", r.status === "BLOCKED");
  fs.rmSync(base, { recursive: true, force: true });
}

// 2. Legit clean project ⇒ PASS (no over-block) — only meaningful with a real confined compiler.
if (bwrapAvailable) {
  const proj = tmp("tsc-conf-clean-");
  fs.writeFileSync(path.join(proj, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, strict: true } }));
  fs.writeFileSync(path.join(proj, "a.ts"), "export const x: number = 1;\n");
  const r = checkTsProject({ projectDir: proj });
  ok("2 legit clean project ⇒ PASS (confinement does not over-block)", r.status === "PASS");
  fs.rmSync(proj, { recursive: true, force: true });
}

// 3. Legit project with a REAL type error ⇒ FAIL with diagnostics (its own content, not an external read).
if (bwrapAvailable) {
  const proj = tmp("tsc-conf-err-");
  fs.writeFileSync(path.join(proj, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, strict: true } }));
  fs.writeFileSync(path.join(proj, "a.ts"), "export const x: number = 1;\nconst y: string = x;\n");
  const r = checkTsProject({ projectDir: proj });
  ok("3 legit type error ⇒ FAIL", r.status === "FAIL");
  ok("3 legit type error ⇒ diagnostics name the in-project file + a TS error code", /a\.ts/.test(String(r.diagnostics || "")) && /error TS\d+/.test(String(r.diagnostics || "")));
  fs.rmSync(proj, { recursive: true, force: true });
}

// 4. A tsconfig OUTSIDE the project dir cannot be confined ⇒ BLOCKED (never PASS, never an unconfined run).
{
  const base = tmp("tsc-conf-out-");
  const proj = path.join(base, "proj"); fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(base, "outside-tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true } }));
  const r = checkTsProject({ projectDir: proj, tsconfig: path.join(base, "outside-tsconfig.json") });
  ok("4 tsconfig outside projectDir ⇒ BLOCKED (not confinable)", r.status === "BLOCKED");
  fs.rmSync(base, { recursive: true, force: true });
}

console.log(`\nts-project-check confinement — ${passed} assertions passed.`);
