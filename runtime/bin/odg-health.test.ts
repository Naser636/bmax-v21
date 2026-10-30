#!/usr/bin/env node
// @ts-nocheck — runs under tsx. INTEGRATION test of the COMPILED dist dashboards (the production path: the `odg` CLI
// runs `node runtime/dist/bin/odg-health.js` / `odg-status.js` with NO tsx fallback). Regression lock for a real
// observability defect: the §G Supervision line was SILENTLY dropped in dist (its source-path require resolved to a
// non-existent runtime/core/*.js under zero-JS), and §F Compass / CM-4 classified were silently dropped too. Now:
// Supervision is RESTORED (supervision-summary compiled into dist), and Compass/classified are FAIL-VISIBLE (UNAVAILABLE)
// rather than silently absent. These lines must NEVER vanish. Spawns the real compiled bins; read-only (no repo mutation).
"use strict";
const assert = require("assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const ROOT = process.cwd();
const HEALTH = path.join(ROOT, "runtime", "dist", "bin", "odg-health.js");
const STATUS = path.join(ROOT, "runtime", "dist", "bin", "odg-status.js");
// pretest runs build:runtime, so the dist bins exist in CI. If somehow absent, fail LOUD (never skip silently).
ok("compiled dist dashboards exist (built by pretest)", fs.existsSync(HEALTH) && fs.existsSync(STATUS));

const health = spawnSync("node", [HEALTH], { cwd: ROOT, encoding: "utf8" });
const hout = (health.stdout || "") + (health.stderr || "");
const status = spawnSync("node", [STATUS], { cwd: ROOT, encoding: "utf8" });
const sout = (status.stdout || "") + (status.stderr || "");

// §G Supervision: RESTORED — the line is present AND actually computed (not UNAVAILABLE) because supervision-summary
// is now compiled into dist and dist-resolved. This assertion FAILS on the pre-fix code (line was absent). Non-vacuous.
const supLine = hout.split("\n").find((l) => /^Supervision\s*:/.test(l)) || "";
ok("dist odg-health prints a Supervision line (§G observable never silently dropped)", /^Supervision\s*:/m.test(hout));
ok("dist Supervision is RESTORED (computed, not UNAVAILABLE) — supervision-summary loads from dist", supLine !== "" && !/UNAVAILABLE/.test(supLine));

// §F Compass: RESTORED (Phase-2A) — compass-update is now compiled into runtime/dist/scripts and dist-resolved, so the
// line is present AND actually computed (not UNAVAILABLE). FAILS on the pre-Phase-2A code (it printed UNAVAILABLE). Non-vacuous.
const compassLine = hout.split("\n").find((l) => /^Compass\s*:/.test(l)) || "";
ok("dist odg-health prints a Compass line (§F observable never silently dropped)", /^Compass\s*:/m.test(hout));
ok("dist Compass is RESTORED (computed, not UNAVAILABLE) — compass-update loads from dist", compassLine !== "" && !/UNAVAILABLE/.test(compassLine));

// CM-4 classified: RESTORED (Phase-2A) — capability-classify compiled into runtime/dist/scripts and dist-resolved, so the
// line is present AND actually computed (not UNAVAILABLE). FAILS on the pre-Phase-2A code (UNAVAILABLE). Non-vacuous.
const classifiedLine = sout.split("\n").find((l) => /classified\s*:/.test(l)) || "";
ok("dist odg-status prints a classified line (never silently dropped)", /classified\s*:/m.test(sout));
ok("dist classified is RESTORED (computed, not UNAVAILABLE) — capability-classify loads from dist", classifiedLine !== "" && !/UNAVAILABLE/.test(classifiedLine));

// read-only: spawning the dashboards must not mutate the tracked tree (sanity — they are health/status probes).
ok("dashboards exited (health/status produced output)", hout.length > 0 && sout.length > 0);

// FAIL-VISIBLE on ABSENT capability-registry (fixes an audited fabricated-health): run the real compiled dashboard
// from an EMPTY cwd (no runtime/generated/*). It must NOT claim "Completion 100%" / "BLOCKERS: None — all present"
// (absence masquerading as a perfect, zero-blocker state) — it must say UNKNOWN. FAILS on the pre-fix code (which
// rendered 100% / None from the empty fallback). Non-vacuous.
{
  const empty = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "odg-health-empty-"));
  const h = spawnSync("node", [HEALTH], { cwd: empty, encoding: "utf8" });
  const o = (h.stdout || "") + (h.stderr || "");
  const compLine = o.split("\n").find((l) => /^\s*Completion\s*:/.test(l)) || "";
  const blockLine = o.split("\n").findIndex((l) => /^BLOCKERS/.test(l));
  const blockBody = blockLine >= 0 ? (o.split("\n")[blockLine + 1] || "") : "";
  // The fabrication was a rendered progress bar "[####…] NN%"; match that, not the bare substring (our UNKNOWN
  // message itself contains the words "100%").
  ok("absent capability-registry ⇒ Completion is UNKNOWN, not a fabricated progress bar", /UNKNOWN/.test(compLine) && !/\]\s*\d+%/.test(compLine));
  ok("absent capability-registry ⇒ BLOCKERS is UNKNOWN, not fabricated 'None — all present'", /UNKNOWN/.test(blockBody) && !/None — all/.test(blockBody));
  // F2b: the other absent-source fabrications must also be fail-visible, never a benign default.
  const missionsLine = o.split("\n").find((l) => /^\s*Missions\s*:/.test(l)) || "";
  ok("absent mission-ledger ⇒ Missions is UNKNOWN, not a fabricated '0 recorded'", /UNKNOWN/.test(missionsLine) && !/\d+\s*recorded/.test(missionsLine));
  const naIdx = o.split("\n").findIndex((l) => /^NEXT ACTION/.test(l));
  const naBody = naIdx >= 0 ? (o.split("\n")[naIdx + 1] || "") : "";
  ok("absent status+state ⇒ NEXT ACTION is UNKNOWN, not a fabricated 'SYSTEM_READY'", /UNKNOWN/.test(naBody) && !/SYSTEM_READY/.test(naBody));
  const wrLine = o.split("\n").find((l) => /^WORKING RULES/.test(l)) || "";
  ok("absent constitution ⇒ WORKING RULES labelled as defaults (not presented as the loaded constitution)", /defaults.*unavailable/.test(wrLine));
  // F2c: Last Mission is UNKNOWN (not the ambiguous "N/A (?)") when both ledger and state are absent.
  const lmLine = o.split("\n").find((l) => /^\s*Last Mission\s*:/.test(l)) || "";
  ok("absent ledger+state ⇒ Last Mission is UNKNOWN, not ambiguous 'N/A (?)'", /UNKNOWN/.test(lmLine) && !/N\/A/.test(lmLine));
  fs.rmSync(empty, { recursive: true, force: true });
}

// render() unit: no caps + no capsAvailable flag ⇒ fail-visible (the exact render({}) the recon used to fabricate 100%).
{
  const { render } = require(HEALTH);
  const o = render({});
  const compLine = o.split("\n").find((l) => /^\s*Completion\s*:/.test(l)) || "";
  ok("render({}) ⇒ Completion UNKNOWN (not a fabricated progress bar)", /UNKNOWN/.test(compLine) && !/\]\s*\d+%/.test(compLine));
  // A genuinely-present registry still renders real data (not over-blocked into UNKNOWN).
  const o2 = render({ caps: { capabilities: ["a", "b"], missingCapabilities: [] }, capsAvailable: true });
  const comp2 = o2.split("\n").find((l) => /^\s*Completion\s*:/.test(l)) || "";
  ok("render(present registry) ⇒ real progress bar (capsAvailable not over-blocking)", /\]\s*\d+%/.test(comp2) && !/UNKNOWN/.test(comp2));
}

// F2b present-case (no over-block): from the real repo root (sources present) the Missions line is a real count and
// NEXT ACTION is not UNKNOWN — the availability flags must not force a loaded source into UNKNOWN.
{
  const missionsReal = hout.split("\n").find((l) => /^\s*Missions\s*:/.test(l)) || "";
  ok("present mission-ledger ⇒ Missions shows a real recorded count (not over-blocked to UNKNOWN)", /\d+\s*recorded/.test(missionsReal) && !/UNKNOWN/.test(missionsReal));
}

console.log(`\nODG-HEALTH/STATUS dist integration — ${pass} assertions passed. (production dist dashboards; §G Supervision restored; §F Compass + CM-4 classified fail-VISIBLE not silently dropped; absent capability-registry ⇒ UNKNOWN not fabricated 100%/None; read-only)`);
