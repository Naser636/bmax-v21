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

check(D.DOCKERFILE_LINT_CONTRACT.invariants.some((i: any) => /no 3rd-party binary/.test(i)), "contract: no external binary, no sudo");

console.log(failures === 0 ? "ALL PASS — SÉRIE 17 DOCKERFILE LINTER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
