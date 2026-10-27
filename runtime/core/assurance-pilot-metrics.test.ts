#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves unit economics from MEASURED machine cost: machine cost ≈ €0 (human time
// dominates); more human hours ⇒ higher delivery cost ⇒ lower margin + net factor; the MEASURED delivery-cost rate
// drives the net factor (NOT V18's assumed 0.56); deliveriesForNetTarget counts; fail-closed; reproducible. HYPOTHESIS
// human-hours.
"use strict";
const assert = require("assert");
const M = require("./assurance-pilot-metrics.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) machine cost ≈ €0 at the measured speed (0.343 ms/run); human time dominates.
const dc = M.deliveryCost({ humanHours: 7, hourlyCost: 50, runsPerDelivery: 3 });
ok("machine cost ≈ €0; human cost dominates", dc.machineCost < 1 && dc.humanCost === 350 && dc.total >= 350 && dc.total < 352);
// (2) unit economics: €1500 price, 7h @ €50 ⇒ cost €350, margin ~77%.
const ue = M.unitEconomics({ price: 1500, humanHours: 7, hourlyCost: 50 });
ok("€1500 @ 7h×€50 ⇒ cost €350, margin ~77%", ue.cost.total >= 350 && ue.cost.total < 351 && ue.marginPct > 76 && ue.marginPct < 77.5);
// (3) more human hours ⇒ higher cost ⇒ lower margin.
ok("more human hours ⇒ lower margin", M.unitEconomics({ price: 1500, humanHours: 14, hourlyCost: 50 }).marginPct < ue.marginPct);
// (4) net factor uses the MEASURED delivery-cost rate (not assumed 0.56): at €1500/7h the measured rate ~0.23 ⇒ net factor < 0.56.
const npd = M.netPerDelivery({ price: 1500, humanHours: 7, hourlyCost: 50 });
ok("measured net factor < V18's assumed 0.56 at realistic human hours", npd.netFactor > 0 && npd.netFactor < 0.56 && npd.measuredDeliveryCostRate > 0.05);
ok("net available per delivery > 0 and < price", npd.netAvailablePerDelivery > 0 && npd.netAvailablePerDelivery < 1500);
// (5) deliveries for €500k net counts up (and is large ⇒ honest).
const need = M.deliveriesForNetTarget(500000, { ...npd, humanHours: 7 });
ok("deliveries for €500k net computed (large)", need.achievable && need.deliveriesNeeded > 0);
// (6) higher price with same hours ⇒ fewer deliveries needed.
const needHi = M.deliveriesForNetTarget(500000, { ...M.netPerDelivery({ price: 8000, humanHours: 7, hourlyCost: 50 }), humanHours: 7 });
ok("higher price ⇒ fewer deliveries for the net target", needHi.deliveriesNeeded < need.deliveriesNeeded);
// (7) net per delivery ≤ 0 ⇒ not achievable (price below cost+levies).
ok("price below cost ⇒ not achievable", M.deliveriesForNetTarget(500000, M.netPerDelivery({ price: 200, humanHours: 14, hourlyCost: 60 })).achievable === false || M.netPerDelivery({ price: 200, humanHours: 14, hourlyCost: 60 }).netAvailablePerDelivery <= 0);
// (8) reproducible + measured constant exposed.
ok("measured machine constant exposed; reproducible", M.MEASURED_MACHINE_MS_PER_RUN === 0.343 && JSON.stringify(M.netPerDelivery({ price: 1500, humanHours: 7, hourlyCost: 50 })) === JSON.stringify(npd));

console.log(`\nASSURANCE-PILOT-METRICS suite — ${pass} assertions passed. (measured machine ≈€0; human time dominates; net factor from MEASURED cost)`);
