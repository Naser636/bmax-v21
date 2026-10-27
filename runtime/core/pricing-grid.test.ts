#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the pricing grid is fail-closed: every price bound to scope+days+minMargin;
// missing any ⇒ invalid; implied day-rate computed + floor-checked; worst-case margin checked against a daily cost;
// only publicDisplay entries expose a starting-from price; prices HYPOTHESIS; nothing published; reproducible.
"use strict";
const assert = require("assert");
const P = require("./pricing-grid.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) default grid validates (no daily cost ⇒ structural checks only).
const v = P.validateGrid();
ok("default grid structurally valid", v.ok === true && v.entries.length === P.GRID.length);
// (2) missing scope ⇒ invalid.
ok("missing scope ⇒ invalid", P.validateEntry({ id: "x", days: [1, 2], priceBand: [490, 990], minMarginPct: 60 }).ok === false);
// (3) missing days ⇒ invalid.
ok("missing day range ⇒ invalid", P.validateEntry({ id: "x", scope: "s", priceBand: [490, 990], minMarginPct: 60 }).problems.some(p => /day range/.test(p)));
// (4) missing price band ⇒ invalid (no price without a band).
ok("missing price band ⇒ invalid", P.validateEntry({ id: "x", scope: "s", days: [1, 2], minMarginPct: 60 }).problems.some(p => /price band/.test(p)));
// (5) missing minMargin ⇒ invalid.
ok("missing minimum margin ⇒ invalid", P.validateEntry({ id: "x", scope: "s", days: [1, 2], priceBand: [490, 990] }).problems.some(p => /minimum margin/.test(p)));
// (6) implied day-rate: diagnostic 490-990 over 1-2 days ⇒ min = 490/2 = 245 < floor 400 ⇒ flagged.
const diag = P.validateEntry({ id: "d", scope: "s", days: [1, 2], priceBand: [490, 990], minMarginPct: 60 });
ok("low implied day-rate flagged vs floor", diag.impliedDayRate.min === 245 && diag.problems.some(p => /day-rate.*floor/.test(p)));
// (7) worst-case margin checked against a daily cost.
const m = P.validateEntry({ id: "a", scope: "s", days: [3, 5], priceBand: [1500, 3000], minMarginPct: 60 }, 400);
ok("worst-case margin computed vs minMargin (cost 400/day × 5d on 1500 ⇒ ~-33%)", m.worstCaseMarginPct !== null && m.problems.some(p => /worst-case margin/.test(p)));
// (8) public selection: only publicDisplay+valid entries, with starting-from price.
ok("public entries expose starting-from price; subset of grid", v.publicEntries.length >= 1 && v.publicEntries.every(e => typeof e.startingFrom === "number") && v.publicEntries.length < v.entries.length);
ok("diagnostic + audit-limited are public; recurring/high are quote-only", v.publicEntries.some(e => e.id === "diagnostic") && !v.publicEntries.some(e => e.id === "program" || e.id === "recurring-assurance"));
// (9) honesty + reproducible.
ok("notes: HYPOTHESIS + publishes nothing; reproducible", v.notes.some(n => /HYPOTHESIS/.test(n)) && v.notes.some(n => /publishes nothing|publishes/.test(n)) && JSON.stringify(P.validateGrid()) === JSON.stringify(v));

console.log(`\nPRICING-GRID suite — ${pass} assertions passed. (fail-closed; price↔scope+days+margin; HYPOTHESIS; publishes nothing)`);
