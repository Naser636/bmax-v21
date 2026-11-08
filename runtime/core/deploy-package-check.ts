#!/usr/bin/env node
"use strict";

/*
 * V12.4 Phase-8 / Step-6 — DEPLOYMENT-PACKAGE STRUCTURAL CHECK. PURE given an injectable reader. Validates that the
 * prepared deployment package (deploy/) is well-formed and SAFE: scripts are strict-mode + non-destructive (no force-
 * push, no `reset --hard`, no restart of a running service), the systemd unit is a TEMPLATE (placeholders, not auto-
 * installed), and the README isolates the single root action. It asserts the package PREPARES deployment WITHOUT
 * claiming anything is deployed (root is denied in this environment). Fail-closed on any missing/unsafe artifact.
 * Dual export.
 */

const fs = require("fs");
const path = require("path");

function isStr(v: any): boolean { return typeof v === "string"; }

const REQUIRED = Object.freeze([
  { file: "deploy/odg-stage-and-verify.sh", must: ["set -euo pipefail", "build: true", "No service was restarted"], mustNot: ["systemctl restart", "kill -9", "git push", "reset --hard"] },
  { file: "deploy/odg-rollback.sh", must: ["set -euo pipefail", "no force"], mustNot: ["push --force", "reset --hard", "stash drop", "stash clear"] },
  { file: "deploy/odg.service.template", must: ["[Unit]", "[Service]", "[Install]", "<REPO_ABS_PATH>", "NoNewPrivileges=true"], mustNot: [] },
  { file: "deploy/README.md", must: ["ONE", "root", "sudo systemctl", "denies `sudo`"], mustNot: [] },
]);

/** checkPackage(opts?) -> { ok, missing, unsafe, present }. opts.readFile/root injectable for tests. */
function checkPackage(opts?: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const root = isStr(o.root) ? o.root : process.cwd();
  const read = typeof o.readFile === "function" ? o.readFile : ((p: string) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } });
  const missing: string[] = [];
  const unsafe: string[] = [];
  const present: string[] = [];
  for (const r of REQUIRED) {
    const body = read(path.join(root, r.file));
    if (!isStr(body)) { missing.push(r.file); continue; }
    present.push(r.file);
    for (const m of r.must) if (!body.includes(m)) missing.push(`${r.file}:missing "${m}"`);
    for (const n of r.mustNot) if (body.includes(n)) unsafe.push(`${r.file}:contains unsafe "${n}"`);
  }
  return Object.freeze({
    ok: missing.length === 0 && unsafe.length === 0 && present.length === REQUIRED.length,
    deployedAnything: false,   // honest: preparation only; nothing is deployed (root denied)
    present: Object.freeze(present), missing: Object.freeze(missing), unsafe: Object.freeze(unsafe),
  });
}

const DEPLOY_PACKAGE_CHECK_CONTRACT = Object.freeze({
  id: "V124-DEPLOY-PACKAGE-CHECK",
  source: "V12.4 Phase-8/Step-6 — deployment-preparation package structural + safety check",
  requiredArtifacts: REQUIRED.map((r) => r.file),
  notAuthority: "a structural safety check of the prepared deploy package; it deploys nothing and grants no root",
  invariants: Object.freeze([
    "every required deploy artifact is present (stage-and-verify + rollback scripts, systemd template, README)",
    "scripts are strict-mode and NON-destructive: no force-push, no reset --hard, no stash drop/clear, no live-service restart",
    "the systemd unit is a TEMPLATE (placeholders) — nothing auto-installed; root remains the single documented human action",
    "preparation ONLY — deployedAnything:false (root is denied in this environment; the refusal is not worked around)",
  ]),
});

module.exports = { REQUIRED, checkPackage, DEPLOY_PACKAGE_CHECK_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...DEPLOY_PACKAGE_CHECK_CONTRACT, check: checkPackage() }, null, 2) + "\n"); }

export {};
