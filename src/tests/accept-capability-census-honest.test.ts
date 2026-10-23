// @ts-nocheck — Acceptance: capability vs mission accounting is semantically SEPARATE (CTO §4).
// The dashboard/registry historically reported the proven-MISSION count under a "capabilities" label
// (the `definitionsWarning` overload documented in ODG_OPERATIONAL_CAPABILITY_REGISTER.json). This proves
// the generated capability-registry.json now distinguishes:
//   - provenMissionCount  — achievements (missions moved unproven→proven); NOT distinct capabilities
//   - wiredCapabilities    — the distinct REAL census: live capability executors + verification probes
// sourced from the canonical modules, and that the two notions are kept apart (a mission becoming proven
// must NOT be counted as a new capability). Fail-closed values stay honest (number, never fabricated).
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
const REPO = process.cwd();

console.log("ACCEPT — capability vs mission accounting (honest, non-conflated)");

// Regenerate the canonical state so the registry reflects HEAD (not a stale artifact).
execFileSync("node", ["runtime/bin/odg-state.js"], { cwd: REPO, stdio: "ignore" });
const reg = JSON.parse(fs.readFileSync(path.join(REPO, "runtime/generated/capability-registry.json"), "utf8"));

// The canonical live counts (ground truth from the modules themselves).
const EXECUTORS = require(path.join(REPO, "runtime/core/capability-executors.js")).EXECUTORS;
const PROBES = require(path.join(REPO, "runtime/core/capability-probes.js")).PROBES;
const executorCount = EXECUTORS.length;
const probeCount = Object.keys(PROBES).length;

// 1. The registry carries BOTH notions, explicitly named.
ok("registry exposes provenMissionCount (achievement count)", typeof reg.provenMissionCount === "number");
ok("registry exposes a wiredCapabilities census block", reg.wiredCapabilities && typeof reg.wiredCapabilities === "object");

// 2. The wired census matches the REAL modules (not invented, not the mission count).
ok("wiredCapabilities.executors === live EXECUTORS[].length", reg.wiredCapabilities.executors === executorCount);
ok("wiredCapabilities.probes === live PROBES count", reg.wiredCapabilities.probes === probeCount);

// 3. provenMissionCount is the proven-MISSION identifier set (achievements), distinct from capabilities.
ok("provenMissionCount === capabilities[] length (proven missions)", reg.provenMissionCount === reg.capabilities.length);
ok("proven missions are NOT equal to wired executors (notions are separate)", reg.provenMissionCount !== reg.wiredCapabilities.executors);
ok("distinct wired capabilities are FAR fewer than proven missions (no conflation)",
   reg.wiredCapabilities.executors + reg.wiredCapabilities.probes < reg.provenMissionCount);

// 4. The census carries an explicit anti-conflation note (truthful self-description).
ok("wiredCapabilities.note warns a proven mission is not a new capability",
   /not.*(proven|mission)|achievement, not a new capability/i.test(reg.wiredCapabilities.note || ""));

// 5. The dashboard route surfaces the distinct fields (so the UI can stop mislabelling).
const route = fs.readFileSync(path.join(REPO, "src/app/api/runtime-state/route.ts"), "utf8");
ok("route snapshot exposes provenMissions + wiredExecutors + wiredProbes",
   /provenMissions/.test(route) && /wiredExecutors/.test(route) && /wiredProbes/.test(route));
const dash = fs.readFileSync(path.join(REPO, "src/components/Dashboard.tsx"), "utf8");
ok("Dashboard labels the proven count as 'Proven missions' (no longer 'Registered' capabilities)",
   /Proven missions/.test(dash) && /Wired executors/.test(dash) && !/label="Registered"/.test(dash));

console.log(`\nACCEPT capability census — ${passed} assertions passed.`);
