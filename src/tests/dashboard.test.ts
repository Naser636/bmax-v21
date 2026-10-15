// WI-2 REPAIR_BMAX_DASHBOARD_REAL_DATA_V1 — render-level honesty of the BMAX dashboard.
// Proves the component renders the REAL governed runtime snapshot, carries the correct BMAX identity,
// drops the old stub sections, and NEVER synthesizes an autonomy percentage when it is not measurable.
// Pure + offline: static markup render, no browser, no network, no live provider call.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Dashboard from "@/components/Dashboard";
import { readRuntimeSnapshot, type RuntimeSnapshot } from "@/app/api/runtime-state/route";

let failures = 0;
function check(cond: boolean, label: string) {
  console.log(`  ${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) failures++;
}

const realState = JSON.parse(readFileSync(resolve(process.cwd(), "runtime/generated/runtime-state.json"), "utf8"));
const realQueue = JSON.parse(readFileSync(resolve(process.cwd(), "runtime/generated/runtime-mission-queue.json"), "utf8"));

// --- 1. Render the REAL snapshot ----------------------------------------------------------------
const snapshot = readRuntimeSnapshot();
const html = renderToStaticMarkup(React.createElement(Dashboard, { snapshot }));

check(html.includes("BMAX v21"), "identity: renders BMAX v21");
check(!html.includes("ODG v1.0"), "identity: the old 'ODG v1.0' mislabel is gone");
check(typeof realState.lastMission === "string" && html.includes(realState.lastMission), "real data: renders the real lastMission from runtime-state.json");
check(typeof realState.nextMission === "string" && html.includes(realState.nextMission), "real data: renders the real nextMission");
check(realQueue.queue.length > 0 && html.includes(realQueue.queue[0].mission), "real data: renders a real queued mission name");

// --- 2. Old stub sections removed (no permanently-empty-registry zeros) --------------------------
check(!html.includes("Value Metrics") && !html.includes("Knowledge Base") && !html.includes("Memory Store"), "stub removed: no empty-registry sections");

// --- 3. Honest autonomy from the real artifact (currently measurable:false) ----------------------
if (snapshot.autonomy.measurable === false) {
  check(html.includes("not yet measurable"), "honesty: non-measurable autonomy shown as 'not yet measurable'");
  check(!/\d+%/.test(html), "honesty: NO fabricated percentage rendered when not measurable");
}

// --- 4. Hostile snapshot: measurable:false MUST never print a percentage even if one leaks in -----
{
  const hostile: RuntimeSnapshot = {
    ...snapshot,
    autonomy: { present: true, measurable: false, autonomyPercent: 99, reason: "incomplete", counts: null, total: null },
  };
  const hostileHtml = renderToStaticMarkup(React.createElement(Dashboard, { snapshot: hostile }));
  check(!hostileHtml.includes("99"), "honesty: measurable:false ignores a leaked autonomyPercent (no '99')");
  check(hostileHtml.includes("not yet measurable"), "honesty: hostile case still shows 'not yet measurable'");
}

// --- 5. Honest unavailable: absent snapshot renders the alert, never fabricated data --------------
{
  const empty: RuntimeSnapshot = {
    present: false,
    generatedAt: null,
    health: { status: null, runtime: null, foundation: null, pipeline: null, brain: null, converged: null },
    missions: { last: null, next: null, lastRun: null, outstanding: [] },
    autonomy: { present: false, measurable: false, autonomyPercent: null, reason: null, counts: null, total: null },
    queue: [],
    queueCount: 0,
    capabilities: { present: false, total: null, missing: null },
    sources: [{ path: "runtime/generated/runtime-state.json", present: false }],
  };
  const emptyHtml = renderToStaticMarkup(React.createElement(Dashboard, { snapshot: empty }));
  check(emptyHtml.includes("unavailable"), "honesty: absent snapshot renders an explicit 'unavailable' state");
  check(emptyHtml.includes("—"), "honesty: unknown values render as em-dash, not 0");
}

console.log(failures === 0 ? "ALL PASS — BMAX DASHBOARD REAL-DATA RENDER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
