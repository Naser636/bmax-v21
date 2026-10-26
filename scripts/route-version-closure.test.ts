#!/usr/bin/env node
// @ts-nocheck — L5/L6 bulk test migration: runtime-compat under tsx proven; this suppresses
// tsc typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/*
 * ROUTE / SCRIPT / VERSION CLOSURE GATE (CTO canonical-route mandate §3/§5).
 *
 * Fail-closed assertions that keep the deployed web application honest about its canonical wiring:
 *  - exactly ONE authoritative dashboard page (no duplicate/shadow dashboard route);
 *  - every canonical API route exists as a real handler (health, runtime-state, intake);
 *  - next.config declares standalone output and NO undocumented rewrite/redirect to a legacy route;
 *  - VERSION IDENTITY: if both .next/BUILD_ID and the standalone BUILD_ID exist, they MUST be equal
 *    (a drift means the running standalone was built from a different source than .next ⇒ FAIL);
 *  - launchers/producers referenced by package scripts + the runtime-state chain actually exist
 *    (no dangling build:runtime guard, no missing runtime-state producer).
 *
 * This is NOT a "ban every repeated string" test: it asserts the EXACT canonical contract and permits the
 * one governed JS rollback runtime + the one static-site catch-all. Pure filesystem + config inspection;
 * no network, no runtime mutation. Build-dependent checks SKIP (not FAIL) when .next is absent (unbuilt tree).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let passed = 0, skipped = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
function skip(name, why) { console.log("  skip -", name, "(" + why + ")"); skipped++; }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

// 1 — exactly ONE authoritative dashboard page (the canonical dashboard route is src/app/page.tsx).
{
  ok("canonical dashboard page src/app/page.tsx exists", exists("src/app/page.tsx"));
  // no competing top-level dashboard pages that would shadow the canonical one.
  for (const legacy of ["src/app/dashboard/page.tsx", "src/app/cockpit/page.tsx", "src/app/home/page.tsx"]) {
    ok(`no shadow dashboard route: ${legacy}`, !exists(legacy));
  }
}

// 2 — canonical API routes exist as real handlers; legacy API names are absent.
{
  for (const api of ["src/app/api/health/route.ts", "src/app/api/runtime-state/route.ts", "src/app/api/intake/route.ts"]) {
    ok(`canonical API present: ${api}`, exists(api));
  }
  for (const legacy of ["src/app/api/state/route.ts", "src/app/api/status/route.ts"]) {
    ok(`no legacy API alias: ${legacy}`, !exists(legacy));
  }
}

// 3 — next.config: standalone output, no undocumented rewrite/redirect to a legacy route.
{
  const cfg = ["next.config.ts", "next.config.js", "next.config.mjs"].find(exists);
  ok("next.config present", Boolean(cfg));
  const body = cfg ? read(cfg) : "";
  ok("output: standalone declared", /output:\s*["']standalone["']/.test(body));
  // rewrites/redirects are permitted ONLY if explicitly present AND documented; here the contract is: none.
  ok("no rewrites() escape hatch", !/async\s+rewrites\s*\(/.test(body) && !/\brewrites\s*:/.test(body));
  ok("no redirects() to a legacy route", !/async\s+redirects\s*\(/.test(body) && !/\bredirects\s*:/.test(body));
}

// 4 — VERSION IDENTITY: .next/BUILD_ID === standalone BUILD_ID (fail-closed on drift).
{
  const a = "/.next/BUILD_ID".slice(1); // avoid leading-slash join
  const nextId = exists(".next/BUILD_ID") ? read(".next/BUILD_ID").trim() : null;
  const standaloneId = exists(".next/standalone/.next/BUILD_ID") ? read(".next/standalone/.next/BUILD_ID").trim() : null;
  if (nextId && standaloneId) {
    ok("deployed-artifact identity: .next/BUILD_ID === standalone BUILD_ID (no drift)", nextId === standaloneId);
  } else {
    skip("BUILD_ID drift check", "unbuilt tree (.next or standalone absent)");
  }
}

// 5 — launchers / producers referenced by the canonical contract actually exist (no dangling wiring).
{
  const pkg = JSON.parse(read("package.json"));
  // build:runtime must point at a real guard script.
  const br = pkg.scripts["build:runtime"] || "";
  const m = br.match(/scripts\/[\w.-]+\.(ts|js|cjs|mjs)/);
  ok("build:runtime script target exists", Boolean(m) && exists(m[0]));
  // the runtime-state producer referenced by the dashboard chain exists (odg-state).
  ok("runtime-state producer odg-state.js exists", exists("runtime/bin/odg-state.js"));
  // canonical runtime front-door + both governed engine entrypoints exist (TS default + JS rollback).
  ok("front-door odg-local-pipeline.sh exists", exists("runtime/bin/odg-local-pipeline.sh"));
  ok("TS runtime entrypoint runtime/dist/bin/odg-run.js exists", exists("runtime/dist/bin/odg-run.js"));
  ok("JS rollback entrypoint runtime/bin/odg-run.js exists (ROLLBACK_ONLY, governed)", exists("runtime/bin/odg-run.js"));
}

// 6 — the compass auto-fire hook is wired into the single canonical completion point.
{
  const pipe = read("runtime/bin/odg-local-pipeline.sh");
  ok("compass auto-fire wired into pipeline completion", /compass-update\.js --from-report/.test(pipe));
  ok("compass recorder target exists", exists("scripts/compass-update.js"));
}

console.log(`\nroute/version closure — ${passed} assertions passed, ${skipped} skipped.`);
