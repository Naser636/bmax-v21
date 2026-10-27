#!/usr/bin/env node
// @ts-nocheck — runs under tsx. REGRESSION GUARD for the CTO six-axis invariant (V23 A-D + V24 E,F): this suite
// FAILS if the axis set is reduced, an axis is removed/renamed, or the program collapses to one active axis while
// other authorized work is runnable. A blocked axis with a recorded blocker is allowed (the others continue).
"use strict";
const assert = require("assert");
const PA = require("./portfolio-axes.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) canonical set is EXACTLY A,B,C,D,E,F — this assertion fails if an axis is ever dropped or added silently.
ok("exactly six axes A,B,C,D,E,F (regression guard)", PA.REQUIRED_AXIS_IDS.join(",") === "A,B,C,D,E,F" && PA.AXES.length === 6);
ok("E is the €50k high-value missions axis; F is ISO/certification readiness", PA.AXES.find(a => a.id === "E").name === "HIGH_VALUE_MISSIONS_50K" && PA.AXES.find(a => a.id === "F").name === "ISO_CERTIFICATION_READINESS");
ok("F readiness vocabulary includes readiness≠certification states", PA.READINESS_STATES.includes("INTERNALLY_VERIFIED") && PA.READINESS_STATES.includes("EXTERNALLY_CERTIFIED") && PA.READINESS_STATES.includes("GAP"));

// A full, healthy portfolio: all six present, each with a concrete nextAction.
const full = ["A", "B", "C", "D", "E", "F"].map(id => ({ axis: id, status: "ACTIVE", objective: `obj ${id}`, nextAction: `do ${id}`, dependencies: [], blockers: [], evidence: [], reviewTrigger: "weekly" }));

// (2) healthy portfolio ⇒ ok, no violations, 6 runnable.
const r = PA.assessWorkstreams(full);
ok("healthy six-axis portfolio ⇒ ok, 6 runnable, 0 violations", r.ok && r.runnable.length === 6 && r.violations.length === 0 && r.axisCount === 6);

// (3) REMOVING an axis ⇒ MISSING_AXIS violation (the core regression this test exists to catch).
const missingF = full.filter(w => w.axis !== "F");
const rm = PA.assessWorkstreams(missingF);
ok("removing an axis ⇒ MISSING_AXIS violation, not ok", !rm.ok && rm.violations.some(v => v.code === "MISSING_AXIS" && v.axis === "F"));

// (4) an axis DORMANT (no nextAction, no blocker) while others runnable ⇒ DORMANT_AXIS violation.
const dormantE = full.map(w => w.axis === "E" ? { ...w, nextAction: "" } : w);
const rd = PA.assessWorkstreams(dormantE);
ok("dormant axis (no action, no blocker) ⇒ DORMANT_AXIS violation", !rd.ok && rd.violations.some(v => v.code === "DORMANT_AXIS" && v.axis === "E"));

// (5) a genuinely BLOCKED axis (recorded blocker) is NOT a violation — the other five continue.
const blockedD = full.map(w => w.axis === "D" ? { ...w, nextAction: "", blockers: ["awaiting partner legal review (human)"] } : w);
const rb = PA.assessWorkstreams(blockedD);
ok("blocked axis with recorded blocker ⇒ allowed (no violation), others runnable", rb.ok && rb.blocked.includes("D") && rb.runnable.length === 5);

// (6) SINGLE_AXIS_COLLAPSE — only one axis runnable while others are unblocked (dormant) ⇒ violation.
const collapse = full.map(w => w.axis === "A" ? w : { ...w, nextAction: "" });
const rc = PA.assessWorkstreams(collapse);
ok("collapse to 1 runnable while others unblocked ⇒ SINGLE_AXIS_COLLAPSE", !rc.ok && rc.violations.some(v => v.code === "SINGLE_AXIS_COLLAPSE"));

// (7) collapse is NOT falsely flagged when the other axes are genuinely blocked (allowed to idle).
const oneRunnableRestBlocked = full.map(w => w.axis === "A" ? w : { ...w, nextAction: "", blockers: ["human authorization required"] });
const rok = PA.assessWorkstreams(oneRunnableRestBlocked);
ok("1 runnable + rest genuinely blocked ⇒ no collapse violation", !rok.violations.some(v => v.code === "SINGLE_AXIS_COLLAPSE") && rok.blocked.length === 5);

// (8) object-map input form supported.
const asMap = {}; for (const w of full) asMap[w.axis] = w;
ok("object-map input supported", PA.assessWorkstreams(asMap).ok === true);

// (9) pure helpers.
ok("hasRunnableAction / isBlocked / isDormant", PA.hasRunnableAction({ nextAction: "x", blockers: [] }) === true && PA.isBlocked({ blockers: ["b"] }) === true && PA.isDormant({ nextAction: "", blockers: [] }) === true);

// (10) fail-closed input.
ok("fail-closed: non-array/object ⇒ INVALID_INPUT", PA.assessWorkstreams(42).code === "INVALID_INPUT" && PA.assessWorkstreams(null).code === "INVALID_INPUT");

console.log(`\nPORTFOLIO-AXES suite — ${pass} assertions passed. (six-axis invariant A–F: missing/dormant/single-axis-collapse FAIL; blocked-with-reason allowed)`);
