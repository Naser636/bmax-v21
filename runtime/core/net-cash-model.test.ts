#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves net-cash layering is honest: gross > collected > operating-net > net-available;
// social + income tax shown SEPARATELY; requiredGrossForNet inverts (netFromGross(required).netAvailable ≈ target);
// gross-to-net multiple > 1 (net ≪ gross); zero rates ⇒ net ≈ collected; costs>gross ⇒ not achievable; reproducible.
"use strict";
const assert = require("assert");
const M = require("./net-cash-model.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) layering strictly decreasing (default rates).
const d = M.netFromGross(1000000);
ok("gross > collected > operatingNet > netAvailable", d.grossCashed >= d.collected && d.collected > d.operatingNet && d.operatingNet > d.netAvailable && d.netAvailable > 0);
// (2) levies shown separately (social + income tax), not folded into direct costs.
ok("social + income tax reported separately", d.levies.socialCharges > 0 && d.levies.incomeTax > 0 && typeof d.levies.note === "string");
// (3) net-available < gross (net ≪ signed/gross).
ok("netAvailable ≪ gross (factor < 1)", d.netFactor > 0 && d.netFactor < 1);
// (4) requiredGrossForNet inverts: netFromGross(requiredGross) ≈ target.
const req = M.requiredGrossForNet(500000);
const check = M.netFromGross(req.requiredGrossCashed);
ok("requiredGrossForNet inverts to ~€500k net", req.achievable && Math.abs(check.netAvailable - 500000) < 1000);
ok("gross-to-net multiple > 1 (net target needs more gross)", req.grossToNetMultiple > 1 && req.requiredGrossCashed > 500000);
// (5) zero costs/levies ⇒ net ≈ collected (= gross with 0 bad debt).
const zero = M.netFromGross(100000, { acquisitionRate: 0, deliveryCostRate: 0, subcontractRate: 0, commissionRate: 0, badDebtRate: 0, socialRate: 0, incomeTaxRate: 0 });
ok("zero rates ⇒ netAvailable == gross", zero.netAvailable === 100000);
// (6) costs exceeding gross ⇒ not achievable (honest).
ok("costs+levies > gross ⇒ not achievable", M.requiredGrossForNet(500000, { deliveryCostRate: 0.8, acquisitionRate: 0.3, socialRate: 0.3 }).achievable === false);
// (7) hybrid (subcontract+commission) lowers net factor vs solo.
ok("hybrid (subcontract+commission) ⇒ lower net factor than solo", M.netFromGross(1000000, { subcontractRate: 0.3, commissionRate: 0.2 }).netFactor < d.netFactor);
// (8) reproducible.
ok("reproducible", JSON.stringify(M.netFromGross(1000000)) === JSON.stringify(d) && JSON.stringify(M.requiredGrossForNet(500000)) === JSON.stringify(req));

console.log(`\nNET-CASH-MODEL suite — ${pass} assertions passed. (gross>collected>net; levies separate; net≪gross)`);
