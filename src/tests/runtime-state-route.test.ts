// WI-2 REPAIR_BMAX_DASHBOARD_REAL_DATA_V1 — the read-only data bridge: /api/runtime-state.
// Proves the snapshot corresponds EXACTLY to the real governed artifacts, that the GET handler is
// read-only and returns 200 + no-store, and that missing artifacts degrade honestly (present:false,
// null everywhere) — never fabricated zeros. Offline: no network, no provider call.
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { GET, readRuntimeSnapshot } from "@/app/api/runtime-state/route";

let failures = 0;
function check(cond: boolean, label: string) {
  console.log(`  ${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) failures++;
}

const real = (name: string) => JSON.parse(readFileSync(resolve(process.cwd(), `runtime/generated/${name}`), "utf8"));

(async () => {
  const state = real("runtime-state.json");
  const queue = real("runtime-mission-queue.json");
  const caps = real("capability-registry.json");
  const auto = real("autonomy-rate.json");

  // --- 1. Correspondence to the REAL artifacts ---------------------------------------------------
  const snap = readRuntimeSnapshot();
  check(snap.present === true, "snapshot.present true (runtime-state.json readable)");
  check(snap.health.status === state.status, "health.status matches runtime-state.json");
  check(snap.missions.last === state.lastMission, "missions.last matches lastMission");
  check(snap.missions.next === state.nextMission, "missions.next matches nextMission");
  check(snap.queueCount === queue.queue.length, `queueCount (${snap.queueCount}) matches queue length (${queue.queue.length})`);
  check(snap.capabilities.total === caps.capabilities.length, "capabilities.total matches registry length");
  check(snap.capabilities.missing === caps.missingCapabilities.length, "capabilities.missing matches registry length");

  // --- 2. Honest autonomy signal -----------------------------------------------------------------
  check(snap.autonomy.measurable === (auto.measure.measurable === true), "autonomy.measurable matches the artifact");
  if (auto.measure.measurable !== true) {
    check(snap.autonomy.autonomyPercent === null, "autonomy NOT measurable ⇒ autonomyPercent is null (no fabricated number)");
  }

  // --- 3. GET handler: AUTH-GATED (V2 security), then read-only, 200, no-store -------------------
  // Anonymous / token-unset ⇒ internal state withheld (fail-closed). Authed ⇒ 200 + real snapshot.
  const prevTok = process.env.ODG_DASHBOARD_TOKEN;
  delete process.env.ODG_DASHBOARD_TOKEN;
  const denied = await GET(new Request("http://x/api/runtime-state"));
  check(denied.status === 503, "GET without configured token ⇒ 503 (internal state withheld, fail-closed)");
  process.env.ODG_DASHBOARD_TOKEN = "route-test-token";
  const anon = await GET(new Request("http://x/api/runtime-state"));
  check(anon.status === 401, "GET anonymous (token configured) ⇒ 401");
  const res = await GET(new Request("http://x/api/runtime-state", { headers: { authorization: "Bearer route-test-token" } }));
  check(res.status === 200, "GET authed returns 200");
  check(res.headers.get("cache-control") === "no-store", "GET sets cache-control: no-store (request-time)");
  const body = JSON.parse(await res.text());
  check(body.present === true && body.queueCount === queue.queue.length, "GET body reflects the real snapshot");
  if (prevTok === undefined) delete process.env.ODG_DASHBOARD_TOKEN; else process.env.ODG_DASHBOARD_TOKEN = prevTok;

  // --- 4. Graceful degrade: missing artifacts ⇒ honest nulls (never fabricated zeros) ------------
  // Run the reader from a cwd that has NO runtime/generated tree. Temp dir lives under the git-ignored
  // runtime/generated/ and is removed immediately — the tracked tree is never touched.
  const tmp = mkdtempSync(resolve(process.cwd(), "runtime", "generated", ".tmp-route-test-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmp);
    const empty = readRuntimeSnapshot();
    check(empty.present === false, "missing artifacts ⇒ present:false");
    check(empty.queueCount === 0 && empty.queue.length === 0, "missing queue ⇒ empty, not fabricated");
    check(empty.capabilities.total === null && empty.capabilities.missing === null, "missing registry ⇒ null counts (honest unknown, not 0)");
    check(empty.autonomy.autonomyPercent === null && empty.autonomy.measurable === false, "missing autonomy ⇒ null percent, not measurable");
    check(empty.sources.every((s) => s.present === false), "all sources reported absent honestly");
  } finally {
    process.chdir(prevCwd);
    rmSync(tmp, { recursive: true, force: true });
  }

  console.log(failures === 0 ? "ALL PASS — RUNTIME-STATE ROUTE" : `FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
