#!/usr/bin/env node
"use strict";
/* Tests for odg-concurrency-policy (V15.7). PURE fixtures. */
const P = require("./odg-concurrency-policy.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const NM = P.NOT_MEASURED;

const MEMINFO = (availKb: number, totalKb = 24000000) => `MemTotal:       ${totalKb} kB\nMemFree:          100000 kB\nMemAvailable:   ${availKb} kB\nBuffers: 1 kB\n`;
const snap = (agents: any[]) => ({ agents });
const ag = (id: string, state: string, extra: any = {}) => ({ id, state, kind: "WORKTREE", ...extra });
const H = 3600 * 1000;
const calm = (over: any = {}) => ({
  cpuCount: 8, loadavg: P.parseLoadavg("1.00 1.00 1.00 2/300 1"), meminfo: P.parseMeminfo(MEMINFO(16000000)),
  snapshot: snap([]), writesetConflicts: 0, refusal: { current: { refused: 1, total: 10 }, previous: { refused: 1, total: 10 } },
  ciQueue: { current: 1, previous: 1 }, inspectionQueue: { current: 0, previous: 0 }, changeReady: false, gitIntegrationActive: false, ...over,
});

function main(): void {
  // parsers — fail closed
  check("parseLoadavg reads /proc/loadavg", JSON.stringify(P.parseLoadavg("0.70 0.52 0.56 2/361 632169\n")) === JSON.stringify({ load1: 0.7, load5: 0.52, load15: 0.56 }));
  check("parseLoadavg: unreadable/truncated/garbage ⇒ NOT_MEASURED", [null, "", "0.7", "a b c", "-1 0 0"].every((t) => P.parseLoadavg(t) === NM));
  check("parseMeminfo reads MemAvailable", P.parseMeminfo(MEMINFO(2048000)).availableMb === 2000);
  check("parseMeminfo: truncated (no MemAvailable) ⇒ NOT_MEASURED (MemFree is not a substitute)", P.parseMeminfo("MemTotal: 100 kB\nMemFree: 50 kB\n") === NM && P.parseMeminfo(null) === NM && P.parseMeminfo("MemTotal: 10 kB\nMemAvailable: 20 kB\n") === NM);

  // defaults
  let d = P.decide(calm());
  check("defaults: coordinator 1, builders start 2 (max 3), inspectors 1, git 1", d.limits.coordinator === 1 && d.limits.builders === 2 && d.limits.inspectors === 1 && d.limits.gitIntegration === 1 && d.config.builders.max === 3);
  check("calm host, no throughput evidence ⇒ HOLD (scale-up needs a measured gain)", d.direction === "HOLD" && d.reasons.some((r: string) => /MEASURED gain/.test(r)));
  check("inspectors admitted only when a change is READY", d.admit.inspectors === 0 && P.decide(calm({ changeReady: true })).admit.inspectors === 1);
  check("git integration one at a time: active ⇒ 0, inactive ⇒ 1, unknown ⇒ 0", P.decide(calm({ gitIntegrationActive: true })).admit.gitIntegration === 0 && d.admit.gitIntegration === 1 && P.decide(calm({ gitIntegrationActive: undefined })).admit.gitIntegration === 0);

  // running counting
  const s = snap([ag("w1", "RUNNING", { role: "builder" }), ag("w2", "RUNNING"), ag("w3", "COMPLETED_NO_RESULT", { role: "builder" }), ag("w4", "ORPHAN"), { id: "claim:x", state: "RUNNING", kind: "CLAIM" }, ag("c", "RUNNING", { role: "coordinator" })]);
  d = P.decide(calm({ snapshot: s }));
  check("only supervisor-RUNNING agents count; unknown role counts as builder; CLAIM reported apart", d.running.builder === 2 && d.running.unclassifiedCountedAsBuilder === 1 && d.running.lockClaimsRunning === 1 && d.running.coordinator === 1);
  check("admit = limit − running (builders 2−2=0, coordinator 1−1=0)", d.admit.builders === 0 && d.admit.coordinator === 0);
  check("roleOf map overrides", P.decide(calm({ snapshot: snap([ag("w2", "RUNNING")]), roleOf: { w2: "inspector" } })).running.inspector === 1);
  d = P.decide(calm({ snapshot: null }));
  check("snapshot unavailable ⇒ admit 0 for every role (fail closed), running NOT_MEASURED", Object.values(d.admit).every((x) => x === 0) && d.running === NM && d.notMeasured.includes("supervisorSnapshot"));

  // scale down
  const downCases: Array<[string, any, RegExp]> = [
    ["load/cpu > 0.85", { loadavg: P.parseLoadavg("8.0 1 1 1/1 1") }, /LOAD_HIGH/],
    ["RAM low", { meminfo: P.parseMeminfo(MEMINFO(2500 * 1024)) }, /RAM_LOW/],
    ["write-set conflicts", { writesetConflicts: 2 }, /WRITESET_CONFLICTS/],
    ["refusal rate rising", { refusal: { current: { refused: 4, total: 10 }, previous: { refused: 1, total: 10 } } }, /REFUSAL_RATE_RISING/],
    ["CI queue growing", { ciQueue: { current: 5, previous: 2 } }, /CIQUEUE_GROWING/],
    ["inspection queue growing", { inspectionQueue: { current: 4, previous: 1 } }, /INSPECTIONQUEUE_GROWING/],
    ["loadavg unreadable", { loadavg: NM }, /HOST_LOAD_UNREADABLE/],
    ["meminfo unreadable", { meminfo: NM }, /MEMINFO_UNREADABLE/],
    ["cpuCount unknown", { cpuCount: null }, /HOST_LOAD_UNREADABLE/],
  ];
  for (const [n, over, re] of downCases) { d = P.decide(calm({ ...over, currentBuilderLimit: 3 })); check(`DOWN one step on ${n}`, d.direction === "DOWN" && d.limits.builders === 2 && d.reasons.some((r: string) => re.test(r))); }
  check("refusal rate rising but below refusalMin ⇒ no DOWN", P.decide(calm({ refusal: { current: { refused: 1, total: 10 }, previous: { refused: 0, total: 10 } } })).direction !== "DOWN");
  check("queue growing but below queueMin ⇒ no DOWN", P.decide(calm({ ciQueue: { current: 2, previous: 1 } })).direction !== "DOWN");
  d = P.decide(calm({ loadavg: P.parseLoadavg("16 1 1 1/1 1"), currentBuilderLimit: 3 }));
  check("critical load ⇒ admit 0 new builders", d.admit.builders === 0 && d.reasons.some((r: string) => /CRITICAL/.test(r)));
  d = P.decide(calm({ meminfo: P.parseMeminfo(MEMINFO(1000 * 1024)) }));
  check("critical RAM ⇒ admit 0 new builders", d.admit.builders === 0);
  d = P.decide(calm({ writesetConflicts: 1, currentBuilderLimit: 1 }));
  check("DOWN never goes below builders.min", d.limits.builders === 1);

  // scale up
  const tp = (a: number, b: number, dur = 2 * H) => [{ builderLimit: 1, completed: a, durationMs: dur }, { builderLimit: 2, completed: b, durationMs: dur }];
  d = P.decide(calm({ currentBuilderLimit: 2, throughput: tp(4, 6) }));
  check("measured gain 50% over (1→2) windows ⇒ UP one step to 3", d.direction === "UP" && d.limits.builders === 3);
  d = P.decide(calm({ currentBuilderLimit: 2, throughput: tp(4, 4.2) }));
  check("gain 5% < 10% ⇒ HOLD (diminishing returns)", d.direction === "HOLD" && d.limits.builders === 2);
  d = P.decide(calm({ currentBuilderLimit: 2, throughput: tp(4, 8, 10 * 60 * 1000) }));
  check("windows shorter than minWindowMs ⇒ HOLD", d.direction === "HOLD");
  d = P.decide(calm({ currentBuilderLimit: 2, throughput: [{ builderLimit: 2, completed: 1, durationMs: 2 * H }, { builderLimit: 2, completed: 9, durationMs: 2 * H }] }));
  check("windows not (limit-1 → limit) ⇒ HOLD", d.direction === "HOLD");
  d = P.decide(calm({ currentBuilderLimit: 3, throughput: [{ builderLimit: 2, completed: 1, durationMs: 2 * H }, { builderLimit: 3, completed: 9, durationMs: 2 * H }] }));
  check("at max ⇒ HOLD (never above builders.max)", d.direction === "HOLD" && d.limits.builders === 3);
  d = P.decide(calm({ currentBuilderLimit: 2, throughput: tp(4, 8), refusal: undefined }));
  check("NOT_MEASURED signal blocks UP and is never coerced to 0", d.direction === "HOLD" && d.signals.refusalRate === NM && d.notMeasured.includes("refusalRate"));
  d = P.decide(calm({ currentBuilderLimit: 2, throughput: tp(4, 8), writesetConflicts: 1 }));
  check("a down-signal wins over a measured gain", d.direction === "DOWN" && d.limits.builders === 1);
  d = P.decide(calm({ currentBuilderLimit: 2, throughput: [{ builderLimit: 1, completed: "x", durationMs: 1 }, { builderLimit: 2, completed: 5, durationMs: 2 * H }] }));
  check("malformed throughput window is ignored ⇒ HOLD", d.direction === "HOLD");

  // config
  d = P.decide(calm({ currentBuilderLimit: 5 }), { builders: { max: 4, min: 1, initial: 2 } });
  check("configurable max; out-of-range current is clamped", d.config.builders.max === 4 && d.previousBuilderLimit === 4);
  d = P.decide(calm(), { builders: { max: -1 }, coordinator: "x" });
  check("invalid config falls back to defaults", d.config.builders.max === 3 && d.config.coordinator === 1);
  check("decision is frozen", Object.isFrozen(d) && Object.isFrozen(d.limits));
  check("contract invariants name the fail-closed rules", P.CONCURRENCY_POLICY_CONTRACT.invariants.some((x: string) => /NOT_MEASURED is never coerced/.test(x)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
