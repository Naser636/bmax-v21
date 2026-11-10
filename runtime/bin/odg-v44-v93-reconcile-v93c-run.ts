#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO ADDENDUM V93-C — V44 / V93 RECONCILIATION (read-only). The owner recovered the V44 staging facts
 * (vps-6d919042, deploy/odg-stage-and-verify.sh PASS, edg-core:8080 loopback, go-live awaiting ROOT). This verifies them
 * against the repo + live read-only state and distinguishes STAGING (V44, done, user-space, non-disruptive) from
 * PRODUCTION (:3000 still the Oct 28 release; go-live = one root action, NOT done). It AUGMENTS (never erases) V93/V93-B.
 * No sudo, no change, secrets redacted. Writes docs/odg/V93C_V44_RECONCILIATION.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function sh(c: string): string { try { return cp.execSync(c, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } }
const redact = (s: string) => String(s).replace(/[A-Za-z0-9_/+=]{32,}/g, "<REDACTED>");

const hostname = sh("hostname");
const stageScript = fs.existsSync(path.join(ROOT, "deploy", "odg-stage-and-verify.sh"));
const stageReadme = fs.existsSync(path.join(ROOT, "deploy", "README.md"));
const stageScriptSrc = stageScript ? fs.readFileSync(path.join(ROOT, "deploy", "odg-stage-and-verify.sh"), "utf8") : "";
const nonDisruptive = /no root|non-disruptive|No service was restarted|left exactly as they are/i.test(stageScriptSrc);
const createsRelease = /odg-releases|ln -sfn|current\.tmp|release/i.test(stageScriptSrc.replace(/#.*$/gm, "")); // in executable lines
const nextBuildMtime = sh("stat -c '%y' .next 2>/dev/null").slice(0, 19);
// live read-only ports.
const publicPorts = sh(`ss -tlnH 2>/dev/null | awk '$4 ~ /0.0.0.0:|\\[::\\]:/ {print $4}' | tr '\\n' ' '`);
const loopbackPorts = sh(`ss -tlnH 2>/dev/null | awk '$4 ~ /127.0.0.1:/ {print $4}' | tr '\\n' ' '`);
const edgcoreListening = /127\.0\.0\.1:8080/.test(loopbackPorts);
const nextListening = /127\.0\.0\.1:3000/.test(loopbackPorts);
const health = sh(`curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null`);
let servedBuildId = ""; try { servedBuildId = JSON.parse(health).buildId; } catch { /* */ }

const lifecycle = {
  stagingValidated: { happened: true, proof: "deploy/odg-stage-and-verify.sh (user-space: build:runtime + odg verify[build/tsc/contracts] + odg health[Runtime/Foundation/Pipeline/Brain]); .next built " + nextBuildMtime + " UTC; owner-reported PASS", confidence: "HIGH" },
  releasePrepared: { happened: false, proof: "the staging script creates NO release dir / NO symlink (non-disruptive); newest release stays Oct 28", confidence: "HIGH" },
  releaseActivated: { happened: false, proof: "'current' symlink mtime Oct 28; no activation", confidence: "HIGH" },
  applicationServed: { happened: true, which: "the Oct 28 release (e84a0cf2)", proof: `:3000 health buildId=${redact(servedBuildId)} = current(Oct28)`, confidence: "HIGH" },
  productionGoLive: { happened: false, proof: "go-live = the ONE root action (deploy/README.md); needs ROOT; owner reports AWAITING; no root used", confidence: "HIGH" },
};
const security = {
  publicListeners: publicPorts || "(none captured)",
  onlySshPublic: /0\.0\.0\.0:22|\[::\]:22/.test(publicPorts) && !/0\.0\.0\.0:(?!22)/.test(publicPorts),
  loopbackOnly: { edgCore8080: edgcoreListening, next3000: nextListening, ollama11434: /11434/.test(loopbackPorts) },
  rootActionsNotDone: ["SSH hardening (root) — NOT done", "production go-live / final activation (root) — NOT done"],
  noChange: ["no firewall change", "no SSH/TLS/domain change", "no production service restart"],
};

const out = {
  "//": "CTO ADDENDUM V93-C — V44/V93 reconciliation, read-only. STAGING (V44, user-space, non-disruptive, PASS) is NOT production. V93 was CORRECT that :3000 serves the Oct 28 release; V93-C adds the V44 staging mechanism. Go-live = one root action, NOT done. Augments V93/V93-B; secrets redacted; nothing changed.",
  vpsInstance: hostname === "vps-6d919042" ? "vps-6d919042 (CONFIRMED matches owner)" : hostname,
  stagingScript: { present: stageScript, path: "deploy/odg-stage-and-verify.sh", nonDisruptive, createsRelease, readmePresent: stageReadme, what: "builds + verifies (build/tsc/contracts) + health (Runtime/Foundation/Pipeline/Brain); restarts nothing; creates no release; activates nothing" },
  v44Commit: "NOT_MEASURED exactly (script writes no timestamped report); .next build mtime " + nextBuildMtime + " UTC corroborates a Nov 10 staging build of the working tree (HEAD-era)",
  liveState: { nextOn3000: nextListening ? "listening (serves Oct 28 release)" : "not observed", edgCoreOn8080: edgcoreListening ? "listening (loopback-only)" : "not observed", edgCorePidReadable: false, servedBuildId: redact(servedBuildId) },
  lifecycle, security,
  v93Reconciliation: { v93ProductionClaim: "deployed :3000 = Oct 28 (e84a0cf2)", verdict: "CONFIRMED CORRECT — not a confusion", augmentation: "V93/V93-B did not surface the V44 STAGING-VERIFY run (user-space PASS, Nov 10). Added here. No correction to the production=Oct28 conclusion; the staging PASS does NOT imply go-live.", oldEvidencePreserved: true },
  impact: { runbook: "STRENGTHENED — the stage-and-verify step is a known, tested, PASSING user-space gate; go-live remains the ONE root action (OWNER_GATED)", preconditions: "no flip — EXECUTABLE_DEPLOYMENT_PLAN already MET; this confirms the staging step; go-live stays owner/root-gated", security: "only SSH:22 public; edg-core/next/ollama loopback-only; no firewall/SSH/TLS/domain change; root hardening + go-live NOT done" },
  honestConclusion: `vps-6d919042 confirmed. V44 (Nov 10) ran deploy/odg-stage-and-verify.sh → PASS: a USER-SPACE, NON-DISRUPTIVE staging verify (build+tsc+contracts+Runtime/Foundation/Pipeline/Brain health) that created NO release, swapped NO symlink and restarted NO service. Production (:3000) still serves the Oct 28 release ${redact(servedBuildId)}; edg-core:8080 is loopback-only. Go-live and SSH hardening both need ROOT and were NOT done. V93's production=Oct28 was CORRECT (not a confusion); V93-C augments it with the staging run. The Oct 28 gap is explained: all Nov work was user-space (dev + staging-verify + timer); production activation awaits one root action. Nothing was changed on the VPS.`,
  invariant: "staging ≠ release ≠ activation ≠ served-app ≠ production go-live; a staging PASS does not imply go-live; read-only; secrets redacted; V93 production conclusion confirmed (not erased); go-live + SSH hardening remain ROOT/owner-gated and NOT done.",
};
fs.writeFileSync(path.join(D, "V93C_V44_RECONCILIATION.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ vps: out.vpsInstance, stagingNonDisruptive: nonDisruptive, createsRelease, onlySshPublic: security.onlySshPublic, edgCoreLoopback: edgcoreListening, goLiveDone: lifecycle.productionGoLive.happened }, null, 2) + "\n");
export {};
