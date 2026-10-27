#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the dashboard links pipeline-ledger ↔ revenue-model ↔ €500k target honestly:
// no data ⇒ NO_DATA + full gap; cashed is the only revenue; signed-not-cashed never counts as met. No fabricated data.
"use strict";
const assert = require("assert");
const D = require("./revenue-dashboard.js");
const PL = require("./pipeline-ledger.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const AT = "2026-10-27";
const mk = (id, amt, upto) => { let x = PL.createEntry(id, amt, AT); for (const st of ["QUALIFIED", "PROPOSAL", "PILOT_SIGNED", "INVOICED", "CASHED"]) { if (PL.STAGES.indexOf(st) > PL.STAGES.indexOf(upto)) break; x = PL.advance(x, st, { at: AT }).entry; } return x; };

// (1) EMPTY ⇒ NO_DATA, full gap, honest note, €500k is a target not a result.
const empty = D.dashboard([], { target: 500000 });
ok("no entries ⇒ NO_DATA, gapCashed = full target, honest", empty.status === "NO_DATA" && empty.cashed === 0 && empty.gapCashed === 500000 && empty.notes.some(n => /TARGET, not a result/.test(n)) && /Status: NO_DATA/.test(empty.markdown));

// (2) some real entries ⇒ signed≥invoiced≥cashed; cashed is the only revenue; BEHIND.
const entries = [mk("a", 40000, "CASHED"), mk("b", 40000, "INVOICED"), mk("c", 40000, "PILOT_SIGNED")];
const d = D.dashboard(entries, { target: 500000, avgContractValue: 40000 });
ok("realized buckets correct + BEHIND (cashed €40k « €500k)", d.signed === 120000 && d.invoiced === 80000 && d.cashed === 40000 && d.status === "BEHIND" && d.gapCashed === 460000);
ok("contracts-still-needed maths (signed gap €380k / €40k = 10)", d.contractsStillNeeded === 10);
ok("weighted pipeline present + ≤ signed (expected-value, labelled hypothesis)", d.weightedPipeline <= d.signed && /HYPOTHESIS/.test(d.markdown));

// (3) signed ≥ target but NOT cashed ⇒ SIGNED_TARGET_MET_CASH_PENDING (NOT 'met'): cash is the only revenue.
const bigSigned = []; for (let i = 0; i < 13; i++) bigSigned.push(mk("s" + i, 40000, "PILOT_SIGNED")); // €520k signed, €0 cashed
const ds = D.dashboard(bigSigned, { target: 500000 });
ok("signed≥target but €0 cashed ⇒ NOT cash-met (honest)", ds.signed >= 500000 && ds.cashed === 0 && ds.status === "SIGNED_TARGET_MET_CASH_PENDING" && ds.notes.some(n => /only revenue that counts/.test(n)));

// (4) cashed ≥ target ⇒ CASH_TARGET_MET (only when genuinely cashed).
const bigCash = []; for (let i = 0; i < 13; i++) bigCash.push(mk("k" + i, 40000, "CASHED")); // €520k cashed
ok("cashed≥target ⇒ CASH_TARGET_MET", D.dashboard(bigCash, { target: 500000 }).status === "CASH_TARGET_MET");

// (5) reproducible render.
ok("reproducible dashboard render", D.dashboard(entries, { target: 500000, avgContractValue: 40000 }).markdown === d.markdown);

console.log(`\nREVENUE-DASHBOARD suite — ${pass} assertions passed. (no fabricated data; cashed = only revenue)`);
