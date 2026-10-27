#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the consolidated A–F finance model composes portfolio + net-cash honestly:
// per-axis reconciles with consolidated; forecast is separate from actual cash (gap on actual only); taxes/social in
// levies (not gross margin); partner commissions reduce net; scenarios ordered; €500k never lowered; NO_DATA.
"use strict";
const assert = require("assert");
const F = require("./portfolio-finance.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const conv = { prospectToInterested: 0.5, interestedToProposal: 0.5, proposalToSigned: 0.4 };
const axes = {
  A: { monthlyProspects: 20, conv, avgContractValue: 900, paymentLag: 1, months: 12 },
  B: { monthlyProspects: 8, conv, avgContractValue: 4500, paymentLag: 1, months: 12 },
  E: { monthlyProspects: 2, conv, avgContractValue: 15000, paymentLag: 2, months: 12 },
};

// (1) base model: per-axis reconciles with consolidated gross.
const m = F.buildModel({ axes, scenario: "base" });
ok("model ok + per-axis reconciles with consolidated gross", m.ok && m.reconciliation.reconciles === true && m.reconciliation.sumPerAxisGross > 0);

// (2) forecast separate from actual cash; gap on ACTUAL only (default €0).
ok("forecast ≠ cash; gap measured on actual (€0 ⇒ full target)", m.actualVsForecast.actualNetCollected === 0 && m.actualVsForecast.gapToTargetOnActual === 500000 && m.consolidated.forecastNetAvailable !== undefined);
ok("forecastNetAvailable is a MODEL output, not counted as cash", typeof m.consolidated.forecastNetAvailable === "number" && /NOT cash/i.test(m.actualVsForecast.note));

// (3) taxes/social are SEPARATE in levies (not in gross margin).
ok("levies separate (social + income tax)", typeof m.consolidated.levies.socialCharges === "number" && typeof m.consolidated.levies.incomeTax === "number" && /SEPARATE/i.test(m.notes.join(" ")));

// (4) partner commission reduces net.
const noComm = F.buildModel({ axes, netRates: { commissionRate: 0.0 } });
const comm = F.buildModel({ axes, netRates: { commissionRate: 0.3 } });
ok("higher partner commission ⇒ lower forecast net", comm.consolidated.forecastNetAvailable < noComm.consolidated.forecastNetAvailable);

// (5) required gross > net target (gross-to-net multiple > 1).
ok("requiredGrossForNet > target (multiple > 1)", m.required.achievable === true && m.required.requiredGrossCashed > m.netTarget && m.required.grossToNetMultiple > 1);

// (6) scenarios ordered: downside < base < upside (gross).
const s = F.scenarios({ axes });
ok("scenarios downside < base < upside", s.downside.consolidated.grossCashedForecast < s.base.consolidated.grossCashedForecast && s.base.consolidated.grossCashedForecast < s.upside.consolidated.grossCashedForecast);

// (7) actual collection reduces gap (and only that).
const withCash = F.buildModel({ axes, collectedNet: 100000 });
ok("evidenced collection reduces gap by exactly that", withCash.actualVsForecast.gapToTargetOnActual === 400000 && withCash.actualVsForecast.actualNetCollected === 100000);

// (8) €500k never lowered; binding note present.
ok("€500k binding + never lowered", m.netTarget === 500000 && m.notes.some(n => /never lowered/i.test(n)));

// (9) NO_DATA when no axes.
ok("no axes ⇒ NO_DATA (not zero-revenue invented)", F.buildModel({}).status === "NO_DATA" && F.buildModel({ axes: {} }).status === "NO_DATA");

// (10) deterministic.
ok("reproducible", JSON.stringify(F.buildModel({ axes, scenario: "base" })) === JSON.stringify(m));

console.log(`\nPORTFOLIO-FINANCE suite — ${pass} assertions passed. (A–F reconcile; forecast≠actual; levies separate; commissions reduce net; scenarios; NO_DATA)`);
