// @ts-nocheck — runs under tsx. B-3 (V2 Pole B): the Foundation dashboard must show UNKNOWN for any ABSENT
// source, never a fabricated healthy default (Capabilities 0 / Missing 0 / Converged NO / Next SYSTEM_READY)
// that reads as "no gaps, system ready" when the artifacts were never built. render() is a PURE function.
"use strict";
const assert = require("assert");
const S = require("./odg-status.ts");
let n = 0;
const ok = (name, cond) => { assert.ok(cond, name); console.log("  ok -", name); n++; };

const txt = (artifacts) => S.render(artifacts).join("\n");

// (1) ALL sources absent ⇒ every field UNKNOWN, NO fabricated SYSTEM_READY / 0 / NO.
const none = txt({ status: null, state: null, caps: null, ledger: null, queue: null,
  available: { status: false, state: false, caps: false, ledger: false, queue: false }, classifiedLine: "UNKNOWN — capability-registry unavailable" });
ok("absent caps ⇒ Capabilities UNKNOWN, not 0", /Capabilities\s+: UNKNOWN/.test(none) && !/Capabilities\s+: 0\b/.test(none));
ok("absent caps ⇒ Missing UNKNOWN, not a fabricated 0", /Missing\s+: UNKNOWN/.test(none) && !/Missing\s+: 0\b/.test(none));
ok("absent status+state ⇒ Next Mission UNKNOWN, NOT a fabricated SYSTEM_READY", /Next Mission\s+: UNKNOWN/.test(none) && !/SYSTEM_READY/.test(none));
ok("absent state ⇒ Converged UNKNOWN, not a definite NO", /Converged\s+: UNKNOWN/.test(none) && !/Converged\s+: NO\b/.test(none));
ok("absent ledger+state ⇒ Last Mission UNKNOWN", /Last Mission\s+: UNKNOWN/.test(none));
ok("absent queue ⇒ Queue Remaining UNKNOWN", /Queue Remaining\s+: UNKNOWN/.test(none));
ok("absent state ⇒ Outstanding Gaps UNKNOWN, not a fabricated 0", /Outstanding Gaps\s+: UNKNOWN/.test(none));

// (2) all sources present + genuinely healthy ⇒ concrete values (no spurious UNKNOWN).
const healthy = txt({
  status: { runtime: "READY", foundation: "OK" },
  state: { converged: true, outstanding: [], nextMission: null },
  caps: { capabilities: ["a", "b", "c"], missingCapabilities: [] },
  ledger: { entries: [{ mission: "M-123" }] },
  queue: { queue: [{ mission: "M-200", status: "PENDING", objective: "obj", goal: "g" }] },
  available: { status: true, state: true, caps: true, ledger: true, queue: true },
  classifiedLine: "business=1 · mission-derived=2 · nl-generated=0 · coherent",
});
ok("present caps ⇒ concrete count", /Capabilities\s+: 3\b/.test(healthy));
ok("present caps ⇒ Missing concrete 0", /Missing\s+: 0\b/.test(healthy));
ok("pending queue mission is Next", /Next Mission\s+: M-200/.test(healthy));
ok("present ledger ⇒ Last Mission concrete", /Last Mission\s+: M-123/.test(healthy));
ok("present state converged ⇒ YES", /Converged\s+: YES/.test(healthy));

// (3) SYSTEM_READY is honest ONLY when a real source loaded and there is no pending mission.
const readyFromState = txt({ status: { runtime: "READY" }, state: { converged: true, outstanding: [] }, caps: { capabilities: [], missingCapabilities: [] }, ledger: { entries: [] }, queue: { queue: [] },
  available: { status: true, state: true, caps: true, ledger: true, queue: true }, classifiedLine: "business=0 · mission-derived=0 · nl-generated=0 · coherent" });
ok("status/state loaded + no pending ⇒ SYSTEM_READY is legitimate", /Next Mission\s+: SYSTEM_READY/.test(readyFromState));

console.log(`\nALL PASS — odg-status fail-visible dashboard (${n} assertions)`);
