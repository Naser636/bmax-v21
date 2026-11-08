#!/usr/bin/env node
"use strict";
const assert = require("assert");
const DP = require("./deploy-package-check");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 Phase-8/Step-6 — DEPLOY PACKAGE CHECK");

// POSITIVE: the real deploy/ package is present, well-formed, and safe.
{
  const r = DP.checkPackage();
  check(r.ok === true, "real deploy package is present + well-formed + safe");
  check(r.present.length === DP.REQUIRED.length, "all required artifacts present");
  check(r.missing.length === 0 && r.unsafe.length === 0, "no missing field, no unsafe construct");
  check(r.deployedAnything === false, "honest: preparation only — nothing deployed (root denied)");
}

// NEGATIVE: a missing artifact ⇒ not ok (fail-closed).
{
  const r = DP.checkPackage({ readFile: (p: string) => (/README/.test(p) ? null : "set -euo pipefail\nbuild: true\nNo service was restarted\nno force\n[Unit][Service][Install]<REPO_ABS_PATH>NoNewPrivileges=true") });
  check(r.ok === false && r.missing.some((m: any) => /README/.test(m)), "NEGATIVE: missing README ⇒ fail-closed");
}

// ADVERSARIAL: an unsafe construct (force-push / reset --hard) ⇒ flagged unsafe.
{
  const unsafeBody = "set -euo pipefail\nbuild: true\nNo service was restarted\nno force\ngit push --force origin main\nreset --hard HEAD";
  const r = DP.checkPackage({ readFile: (_p: string) => unsafeBody });
  check(r.unsafe.length >= 1 && r.ok === false, "ADVERSARIAL: a script with force-push/reset --hard ⇒ flagged unsafe, not ok");
}

check(DP.DEPLOY_PACKAGE_CHECK_CONTRACT.invariants.some((i: any) => /deployedAnything:false|preparation ONLY/.test(i)), "contract documents preparation-only (nothing deployed)");

console.log(failures === 0 ? "ALL PASS — V12.4 Phase-8/Step-6 DEPLOY PACKAGE CHECK" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
