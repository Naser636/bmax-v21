#!/usr/bin/env node
"use strict";

/*
 * Mission P0-R1 (from the V104 proposed-mission register) — REPAIR of the odg-monitor MODULE_NOT_FOUND. Records the
 * root cause, the canonical-source fix, the live evidence, and the closure criteria. ODG selects/closes; this dossier is
 * evidence FOR ODG, not a self-closure. NO production deploy: no service restart, no odg-release.sh, no odg-releases/
 * change. Live facts re-derived read-only. Writes docs/odg/R1_MONITOR_REPAIR.json.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function sh(c: string): string { try { return cp.execSync(c, { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e: any) { return String((e && e.stdout) || "").trim(); } }
function exists(p: string): boolean { return fs.existsSync(path.join(ROOT, p)); }

// reproduce: run the full monitor tick read-only and count MODULE_NOT_FOUND
const tick = sh(`bash ${path.join(ROOT, "scripts", "odg-monitor.sh")} 2>&1`);
const moduleNotFound = (tick.match(/Cannot find module/g) || []).length;
const exposureLine = (tick.match(/Exposure\s*:.*/) || [""])[0];
const maintenanceLine = (tick.match(/Maintenance\s*:.*/) || [""])[0];
const health = (() => { try { return JSON.parse(sh(`curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null`)); } catch { return {}; } })();
// §G supervision freshness — the regression the independent validator caught (status files feed odg-health §G).
const supervisionLine = (sh(`node ${path.join(ROOT, "runtime", "dist", "bin", "odg-health.js")} 2>/dev/null | grep -i Supervision`).match(/Supervision:.*/) || [""])[0];
const statusFilesFresh = fs.existsSync(path.join(ROOT, "runtime", "generated", "exposure-status.json")) && fs.existsSync(path.join(ROOT, "runtime", "generated", "maintenance-status.json"));

const out = {
  "//": "Mission P0-R1 — repair odg-monitor MODULE_NOT_FOUND. Canonical-source fix (TS CLIs recreated + build-config + script/README rewired). NO production deploy. Evidence FOR ODG to close; Claude Code does not self-close.",
  mission: { id: "P0-R1", source: "V104 proposed-mission register (docs/odg/V104_MASTER_CONTINUATION_RECONCILIATION.json)", family: "F7-RESILIENCE", level: "L2-local-reversible" },
  rootCause: {
    exact: "The zero-JS convergence (commit fba76c7 'remove the 148 source .js ports') RETIRED runtime/bin/odg-exposure-check.js and runtime/bin/odg-maintenance-check.js WITHOUT creating TS replacements. The pure core logic survived (runtime/core/exposure-audit.ts, maintenance-alerts.ts, both still gate-tested) but the thin CLI entrypoints odg-monitor.sh invokes were deleted. scripts/odg-monitor.sh still hard-coded the dead runtime/bin/*.js paths ⇒ MODULE_NOT_FOUND every ~10-min tick.",
    originalShippedIn: "6bbb851 (exposure/P3), ee6e42c (maintenance/P5)",
    retiredIn: "fba76c7 (zero-JS)",
    priorV104Imprecision: "V104 guessed the binaries lived in runtime/dist/bin/*.js; the true cause is they existed NOWHERE as source after retirement (corrected here).",
  },
  fix: {
    canonicalSourceAdded: ["runtime/bin/odg-exposure-check.ts", "runtime/bin/odg-maintenance-check.ts"],
    importsCoreNotDuplicated: "CLIs import classifyExposure / evaluateMaintenance+newAlerts from the surviving core modules — NO classification/threshold logic duplicated",
    buildConfig: "tsconfig.runtime-dist.json include += the 2 bin CLIs + the 2 core modules ⇒ build:runtime emits runtime/dist/bin/odg-*-check.js + runtime/dist/core/*.js",
    rewired: ["scripts/odg-monitor.sh → runtime/dist/bin/odg-*-check.js", "deploy/README-systemd.md → dist path"],
    statusWritesRestored: "both ports also write runtime/generated/{exposure,maintenance}-status.json every run (the single source odg-health §G Supervision reads) — faithful restoration of the retired behavior",
    regressionTest: "runtime/bin/odg-monitor-entrypoints.test.ts (behavioral: runs both entrypoints via tsx AND the compiled dist via node, asserts no MODULE_NOT_FOUND + verdict line + fresh status files; guards the dead path, the dropped-status regression, and the tsx-vs-dist gap); wired into package.json test:report",
  },
  independentValidation: {
    validator: "separate adversarial agent (general-purpose)",
    verdict: "FIX REAL but initially INCOMPLETE — confirmed root cause, canonical source, build, clean run, no deploy; REFUTED 'faithful' claim: the first port DROPPED the status-file writes feeding odg-health §G (reproduced live: §G STALE).",
    remediation: "status-file writes re-added to both ports; regression test extended to assert status freshness + exercise the dist/node artifact. Re-verified: §G now reports 'monitor fresh'.",
  },
  evidence: {
    monitorTickModuleNotFoundCount: moduleNotFound,
    monitorTickExposure: exposureLine,
    monitorTickMaintenance: maintenanceLine,
    sourceCLIsPresent: exists("runtime/bin/odg-exposure-check.ts") && exists("runtime/bin/odg-maintenance-check.ts"),
    compiledDistPresent: exists("runtime/dist/bin/odg-exposure-check.js") && exists("runtime/dist/bin/odg-maintenance-check.js"),
    deadPathGone: !/runtime\/bin\/odg-(exposure|maintenance)-check\.js/.test(fs.readFileSync(path.join(ROOT, "scripts", "odg-monitor.sh"), "utf8")),
    tscClean: "verified separately (tsc=0)",
    supervisionGFresh: supervisionLine,
    statusFilesPresent: statusFilesFresh,
    liveProductionUndisturbed: health.status === "ready" && health.buildId === "WEyqonrDYirNE0T99qGGC",
  },
  noProductionDeploy: { serviceRestarted: false, odgReleaseShRun: false, odgReleasesTouched: false, note: "monitor runs read-only from the repo working tree; it will pick up the repaired dist on its next normal tick — no deploy/activation performed" },
  closureCriteria: {
    rootCauseFound: true,
    canonicalSourceFixed: true,
    buildReproducesDist: true,
    regressionTestAdded: true,
    noMODULE_NOT_FOUND: moduleNotFound === 0,
    supervisionGFresh: /monitor fresh/.test(supervisionLine),
    productionUndisturbed: health.status === "ready",
    independentValidationPassed: "adversarial validator ran; found defect (dropped §G status writes) REMEDIATED + re-verified",
  },
  status: (moduleNotFound === 0 && statusFilesFresh && /monitor fresh/.test(supervisionLine)) ? "FIXED_independently_validated_pending_ODG_closure" : "NOT_FIXED",
  invariant: "root cause found + reproduced; canonical SOURCE fixed (not a generated file); core logic reused not duplicated; build:runtime reproduces the compiled dist; behavioral regression test guards the dead path; no production deploy/restart/odg-releases change; live app undisturbed; ODG closes on proof, Claude Code does not self-close.",
};
fs.writeFileSync(path.join(D, "R1_MONITOR_REPAIR.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: out.status, moduleNotFound, exposure: exposureLine, maintenance: maintenanceLine, productionHealthy: health.status === "ready" }, null, 2) + "\n");
export {};
