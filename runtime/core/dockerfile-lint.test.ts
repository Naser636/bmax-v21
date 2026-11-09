#!/usr/bin/env node
"use strict";
const assert = require("assert");
const D = require("./dockerfile-lint");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 17 — DOCKERFILE SECURITY LINTER");

// a clean, hardened Dockerfile passes.
{
  const r = D.lintDockerfile("FROM node:22.22.1\nRUN apt-get install -y --no-install-recommends curl=7.88.1-10\nCOPY . /app\nUSER app\n");
  check(r.clean === true && r.highFindings === 0, "hardened Dockerfile ⇒ clean");
}

// unpinned base (:latest) ⇒ DL3007 HIGH.
{
  const r = D.lintDockerfile("FROM node:latest\nUSER app\n");
  check(!r.clean && r.findings.some((f: any) => f.rule === "DL3007" && f.severity === "HIGH"), ":latest base ⇒ DL3007 HIGH");
}

// no USER / root USER ⇒ DL3002 HIGH.
{
  check(D.lintDockerfile("FROM node:22.22.1\nCOPY . /app\n").findings.some((f: any) => f.rule === "DL3002"), "no USER ⇒ DL3002 (runs as root)");
  check(D.lintDockerfile("FROM node:22.22.1\nUSER root\n").findings.some((f: any) => f.rule === "DL3002"), "last USER root ⇒ DL3002");
}

// sudo in RUN ⇒ NO-SUDO HIGH.
{
  const r = D.lintDockerfile("FROM node:22.22.1\nRUN sudo apt-get update\nUSER app\n");
  check(r.findings.some((f: any) => f.rule === "NO-SUDO" && f.severity === "HIGH"), "sudo in RUN ⇒ NO-SUDO HIGH");
}

// secret in ENV ⇒ SECRET-IN-ENV HIGH.
{
  const r = D.lintDockerfile("FROM node:22.22.1\nENV AWS_SECRET_ACCESS_KEY=AKIAEXAMPLE\nUSER app\n");
  check(r.findings.some((f: any) => f.rule === "SECRET-IN-ENV" && f.severity === "HIGH") && !r.clean, "secret in ENV ⇒ SECRET-IN-ENV HIGH, not clean");
}

// ADD for local files ⇒ DL3020; apt without --no-install-recommends ⇒ DL3015.
{
  const r = D.lintDockerfile("FROM node:22.22.1\nADD ./x /app\nRUN apt-get install -y curl=1\nUSER app\n");
  check(r.findings.some((f: any) => f.rule === "DL3020") && r.findings.some((f: any) => f.rule === "DL3015"), "ADD local ⇒ DL3020; apt no --no-install-recommends ⇒ DL3015");
  // ADD with a remote URL is NOT flagged DL3020.
  check(!D.lintDockerfile("FROM node:22.22.1\nADD https://x/y /app\nUSER app\n").findings.some((f: any) => f.rule === "DL3020"), "ADD remote URL is not DL3020");
}

// repairDockerfile: safe fixes applied, judgment-dependent fixes only SUGGESTED (never guessed).
{
  const bad = "FROM node:latest\nRUN sudo apt-get install -y curl\nADD ./x /app\nENV API_KEY=AKIAEXAMPLE123\n";
  const rep = D.repairDockerfile(bad);
  // safe fixes applied: sudo removed, --no-install-recommends added, ADD→COPY.
  check(!/\bsudo\b/.test(rep.repaired), "repair: sudo removed (safe)");
  check(/--no-install-recommends/.test(rep.repaired), "repair: --no-install-recommends added (safe)");
  check(/^COPY \.\/x/m.test(rep.repaired) && !/^ADD \.\/x/m.test(rep.repaired), "repair: ADD → COPY for local files (safe)");
  check(rep.appliedFixes.some((f: any) => f.rule === "NO-SUDO") && rep.appliedFixes.some((f: any) => f.rule === "DL3015") && rep.appliedFixes.some((f: any) => f.rule === "DL3020"), "repair: the 3 safe fixes are recorded as applied");
  // judgment-dependent fixes are SUGGESTED, never auto-applied (fail-safe).
  check(/node:latest/.test(rep.repaired), "repair: base version NOT guessed (still :latest) — suggested only");
  check(/API_KEY=AKIAEXAMPLE123/.test(rep.repaired), "repair: baked secret NOT auto-stripped — suggested only");
  check(rep.suggestions.some((s: any) => s.rule === "DL3007") && rep.suggestions.some((s: any) => s.rule === "SECRET-IN-ENV") && rep.suggestions.some((s: any) => s.rule === "DL3002"), "repair: DL3007/SECRET/DL3002 are suggestions");
  // the repaired output genuinely lints cleaner than the input (the eval of the repair).
  check(D.lintDockerfile(rep.repaired).findingCount < D.lintDockerfile(bad).findingCount, "repair: repaired Dockerfile lints with fewer findings (safe improvement)");
  // a repair on a clean Dockerfile is a no-op.
  const clean = "FROM node:22.22.1\nUSER app\n";
  check(D.repairDockerfile(clean).appliedFixes.length === 0, "repair: clean Dockerfile ⇒ no changes applied");
}

check(D.DOCKERFILE_LINT_CONTRACT.invariants.some((i: any) => /no 3rd-party binary/.test(i)), "contract: no external binary, no sudo");
check(D.DOCKERFILE_LINT_CONTRACT.invariants.some((i: any) => /repairDockerfile applies ONLY safe/.test(i)), "contract: repair applies only safe fixes, suggests the rest");

console.log(failures === 0 ? "ALL PASS — SÉRIE 17 DOCKERFILE LINTER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
