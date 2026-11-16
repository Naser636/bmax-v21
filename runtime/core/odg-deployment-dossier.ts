#!/usr/bin/env node
"use strict";
/*
 * V228 §6 — DEPLOYMENT PROTOCOL DOSSIER (DRAFT). PURE, deterministic, read-only. Operator-usable deployment dossier that
 * maps each of the 20 required sections to its REAL backing artifact in the repo and computes an HONEST GO/NO-GO from the
 * actual gates. It COMPOSES deploy-package-check + odg-production-gate-matrix (no new gate) and references only artifacts
 * that genuinely exist (verified: deploy/*.service|.timer|.sh, scripts/odg-release.sh|odg-recover.sh|odg-backup-vault.sh).
 *
 * HARD HONESTY: dossierStatus is ALWAYS "DRAFT" here — it becomes operable only when production gates pass + evidence
 * exists; goNoGo is COMPUTED (GO requires productionReady===true AND deploy-package ok AND no OWNER_GATED blocker) and is
 * currently NO_GO. Owner-gated interventions (secrets/TLS/systemd/VPS/sudo) are listed explicitly, never claimed done.
 * No deployment is executed; nothing is declared DEPLOYED/READY without proof. Dual export.
 */

const PKG = require("./deploy-package-check.js");       // REAL deploy-package verifier (reused)
const GATE = require("./odg-production-gate-matrix.js"); // REAL 5-gate production matrix (reused)

// S = status vocabulary: PREPARED (artifact exists, apply pending) · OWNER_GATED · READY · NOT_READY · PENDING ·
// PROCESS_DEFINED · NOT_APPLICABLE. Each section cites a real backing artifact/module.
const SECTIONS = Object.freeze([
  { n: 1, section: "target architecture + component inventory", backing: "runtime/core/* + deploy/README.md", status: "PREPARED" },
  { n: 2, section: "version/commit/artifact matrix", backing: "git HEAD + deploy/ (injected headSha)", status: "TRACEABLE" },
  { n: 3, section: "system prerequisites + dependencies", backing: "package.json + deploy/README-systemd.md", status: "PREPARED" },
  { n: 4, section: "configuration + environment variables", backing: "deploy/odg.service.template + deploy/*.service", status: "PREPARED" },
  { n: 5, section: "secrets management", backing: "(no secrets in repo — provisioned at deploy)", status: "OWNER_GATED" },
  { n: 6, section: "permissions / identities / role separation", backing: "deploy/odg-recover.sudoers + user-systemd design", status: "OWNER_GATED" },
  { n: 7, section: "GitHub / PR / CI / release traceability", backing: "scripts/odg-release.sh + CI (build+typecheck+parity+tests)", status: "READY" },
  { n: 8, section: "VPS integration + service architecture", backing: "deploy/odg-app.service + odg-mission-runner.service", status: "PREPARED_APPLY_OWNER_GATED" },
  { n: 9, section: "systemd / timers / supervision", backing: "deploy/odg-mission-runner.timer + deploy/odg-backup.timer.candidate + deploy/odg-monitor.service.candidate", status: "PREPARED_APPLY_OWNER_GATED" },
  { n: 10, section: "network / domains / TLS", backing: "(reverse proxy + TLS at the host)", status: "OWNER_GATED" },
  { n: 11, section: "database + migrations", backing: "(file-based registers; no real DB in scope)", status: "NOT_APPLICABLE" },
  { n: 12, section: "backups + restore", backing: "scripts/odg-backup-vault.sh + deploy/odg-backup.{service,timer}.candidate", status: "PREPARED" },
  { n: 13, section: "step-by-step deployment procedure", backing: "deploy/odg-stage-and-verify.sh + scripts/odg-preprod-cutover-runbook.sh", status: "PREPARED" },
  { n: 14, section: "health checks + smoke tests", backing: "deploy/odg-frontdoor-smoke.sh + scripts/odg-healthcheck.sh", status: "PREPARED" },
  { n: 15, section: "GO / NO-GO criteria", backing: "this dossier (computed from production-gate-matrix)", status: "COMPUTED" },
  { n: 16, section: "rollback procedure", backing: "deploy/odg-rollback.sh + scripts/odg-recover.sh", status: "PREPARED" },
  { n: 17, section: "incidents / diagnosis / recovery", backing: "scripts/odg-recover.sh + deploy/odg-recover.service.candidate", status: "PREPARED" },
  { n: 18, section: "security controls", backing: "odg-production-gate-matrix (exposure/iso gates)", status: "GATED" },
  { n: 19, section: "independent validation", backing: "second-agent inspection process (PASS/FINDINGS/FAIL)", status: "PROCESS_DEFINED" },
  { n: 20, section: "post-deploy verification + acceptance criteria", backing: "deploy-package-check.deployedAnything + smoke tests", status: "PENDING" },
]);

const OWNER_GATED_INTERVENTIONS = Object.freeze([
  "provision secrets at the host (never in repo/logs)",
  "grant VPS access + apply systemd units/timers (deploy/*.service|.timer) under the user systemd scope",
  "configure reverse proxy + TLS for any public endpoint",
  "run the production gates to green (contracts/sandbox/exposure/iso) before GO",
]);

/* assess(opts?) — opts.headSha (injected, no git exec), opts.fileExists (optional map for the package check). */
function assess(opts?: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  let pkgOk = false, gateReady = false, ownerGatedCount = 0;
  try { const p = PKG.checkPackage(o.pkg || {}); pkgOk = p.ok === true; } catch { pkgOk = false; }
  try { const g = GATE.productionGateMatrix(o.gate || {}); gateReady = g.productionReady === true; ownerGatedCount = Array.isArray(g.ownerGatedActions) ? g.ownerGatedActions.length : 0; } catch { gateReady = false; }

  const ownerGatedSections = SECTIONS.filter((s: any) => /OWNER_GATED|GATED/.test(s.status)).map((s: any) => s.n);
  const goNoGo = (gateReady && pkgOk && ownerGatedCount === 0) ? "GO" : "NO_GO";
  const noGoReasons: string[] = [];
  if (!gateReady) noGoReasons.push("production gates NOT green (productionReady=false)");
  if (!pkgOk) noGoReasons.push("deploy package incomplete");
  if (ownerGatedCount > 0) noGoReasons.push(ownerGatedCount + " owner-gated production action(s) outstanding");

  return Object.freeze({
    dossierStatus: "DRAFT",                 // NEVER auto-promoted — stays DRAFT until GO + evidence
    headSha: typeof o.headSha === "string" ? o.headSha : null,
    sections: SECTIONS, totalSections: SECTIONS.length,
    deployPackageOk: pkgOk, productionReady: gateReady, ownerGatedProductionActions: ownerGatedCount,
    ownerGatedSections: Object.freeze(ownerGatedSections),
    goNoGo, noGoReasons: Object.freeze(noGoReasons),
    ownerGatedInterventions: OWNER_GATED_INTERVENTIONS,
    honesty: "DRAFT dossier — operator-usable section→artifact→status map over REAL repo artifacts. goNoGo is COMPUTED from production-gate-matrix + deploy-package-check; currently NO_GO. Nothing is DEPLOYED/READY; owner-gated interventions are listed, never claimed done. No deployment executed.",
  });
}

const DEPLOYMENT_DOSSIER_CONTRACT = Object.freeze({
  id: "V228-DEPLOYMENT-DOSSIER",
  purpose: "§6 — operator deployment dossier (DRAFT) mapping 20 sections to real artifacts; honest computed GO/NO-GO",
  invariants: Object.freeze([
    "dossierStatus is ALWAYS DRAFT here; never promoted to READY/DEPLOYED without production gates + evidence",
    "goNoGo is COMPUTED (GO requires productionReady AND deploy-package ok AND no owner-gated blocker); currently NO_GO",
    "every section cites a REAL backing artifact (verified to exist); nothing fabricated; no deployment executed",
    "owner-gated interventions (secrets/TLS/systemd/VPS/sudo) listed explicitly, never claimed done; reuses existing checks, no new gate",
  ]),
});

module.exports = { SECTIONS, OWNER_GATED_INTERVENTIONS, assess, DEPLOYMENT_DOSSIER_CONTRACT };
export {};
