/**
 * unit-economics — ODG_AUTONOMOUS_UNIT_ECONOMICS_V1. Per-engagement unit economics that SEPARATES the four
 * time buckets the CTO requires and NEVER imputes human time for work ODG does itself. COMPOSES existing
 * primitives (economic-unit for money Quantities; mirrors revenue-model's capacity discipline) — it adds NO
 * parallel money math (no multiply/percent inside economic-unit; ratios are computed on integer minor units
 * here and clearly labelled DERIVED).
 *
 * Honest rules enforced: compute time is NOT free; elapsed ≠ CPU ≠ ODG-active ≠ human time; revenue ≠ profit;
 * a per-field `basis` (MEASURED | ESTIMATED) is carried so unmeasured inputs can never masquerade as measured;
 * delivery capacity is the BINDING constraint (ODG throughput vs scarce residual-human time vs rate limit).
 */
const EU = require("./economic-unit.js");
const POLICY = require("./autonomous-execution-policy.js");

const q = (minor: any): any => EU.quantity("EUR", "ASSET", Math.round(Number(minor) || 0), 2);
const minorOf = (quantity: any): any => (quantity && typeof quantity.minor === "number" ? quantity.minor : 0);
const eur = (minor: any): any => EU.format(q(minor));

/**
 * input: {
 *   priceMinor,                                  // sale price (cents)
 *   directCosts: [{label, minor, basis}],        // compute/API/software/subcontracting (cents each)
 *   time: { odgActiveMin, odgWaitMin, residualHumanMin, basis:{odgActive,residualHuman,...} },
 *   rates: { odgActiveCostPerHourMinor, humanCostPerHourMinor },   // odgActive NOT free (default must be >=0 explicit)
 *   capacity: { humanHoursPerDay, odgActiveHoursPerDay, odgParallelism, rateLimitPerDay, workingDaysPerMonth },
 * }
 */
function computeUnitEconomics(input: any): any {
  const i = input && typeof input === "object" ? input : {};
  const warnings: string[] = [];
  const t = i.time || {};
  // LOT A — when a per-step work breakdown is supplied, the autonomous-execution policy DERIVES the time split
  // AUTHORITATIVELY: ODG-automatable work is ODG's (never charged as CTO time); residual-human counts ONLY
  // genuinely-human steps; automatable work imputed to a human is FLAGGED. Enforces the rule in the calculator.
  let policyAudit: any = null;
  if (Array.isArray(i.steps) && i.steps.length) {
    policyAudit = POLICY.auditImputation(i.steps);
    for (const f of policyAudit.flags) warnings.push(`${f.code}: ${f.label} (${f.minutes}min) — ${f.detail}`);
    if (policyAudit.externalGatedMinutes > 0) warnings.push(`${policyAudit.externalGatedMinutes}min are EXTERNAL_GATED (dependency) — neither ODG-billable nor CTO-residual.`);
  }
  const odgActiveMin = policyAudit ? policyAudit.odgMinutes : (Number(t.odgActiveMin) || 0);
  const odgWaitMin = Number(t.odgWaitMin) || 0;
  const residualHumanMin = policyAudit ? policyAudit.residualHumanMinutes : (Number(t.residualHumanMin) || 0);
  const totalElapsedMin = Number.isFinite(t.totalElapsedMin) ? Number(t.totalElapsedMin) : (odgActiveMin + odgWaitMin + residualHumanMin);
  const basis = t.basis || {};

  const rates = i.rates || {};
  const odgRate = Number(rates.odgActiveCostPerHourMinor);
  if (!Number.isFinite(odgRate)) warnings.push("odgActiveCostPerHourMinor not supplied — compute time MUST NOT be assumed free; set it explicitly");
  const odgCostPerHour = Number.isFinite(odgRate) ? odgRate : 0;
  const humanRate = Number(rates.humanCostPerHourMinor) || 0;

  // Direct costs (sum of Quantities via economic-unit; no implicit money math).
  const dc = Array.isArray(i.directCosts) ? i.directCosts : [];
  let directTotal = q(0);
  for (const c of dc) {
    if (!c || !Number.isFinite(Number(c.minor))) warnings.push(`OMITTED_COST: direct cost "${(c && c.label) || "(unnamed)"}" has no finite amount — not counted (fix or confirm €0).`);
    else directTotal = EU.add(directTotal, q(c.minor));
  }
  // Marginal cost of ODG active time + residual human cost (reported SEPARATELY).
  const odgActiveMarginal = q((odgActiveMin / 60) * odgCostPerHour);
  const residualHumanCost = q((residualHumanMin / 60) * humanRate);

  const price = q(i.priceMinor);
  // Contribution margin = price − direct − ODG active marginal (human reported separately, it is the scarce input).
  const contributionMargin = EU.sub(EU.sub(price, directTotal), odgActiveMarginal);
  const marginIncludingHuman = EU.sub(contributionMargin, residualHumanCost);

  // DERIVED per-hour ratios (integer minor ÷ hours — NOT an economic-unit op; labelled derived).
  const humanHours = residualHumanMin / 60, odgHours = odgActiveMin / 60;
  const perHour = {
    revenuePerResidualHumanHour: humanHours > 0 ? eur(minorOf(price) / humanHours) : null,
    marginPerResidualHumanHour: humanHours > 0 ? eur(minorOf(marginIncludingHuman) / humanHours) : null,
    revenuePerOdgActiveHour: odgHours > 0 ? eur(minorOf(price) / odgHours) : null,
    marginPerOdgActiveHour: odgHours > 0 ? eur(minorOf(contributionMargin) / odgHours) : null,
    note: "DERIVED ratios (margin/price per hour); the residual-human-hour metric is the scarce-resource view.",
  };

  // Capacity — the BINDING constraint across ODG throughput, scarce human time, and rate limits.
  const cap = i.capacity || {};
  const workDays = Number(cap.workingDaysPerMonth) || 21;
  const perDayBounds: any = {};
  if (odgActiveMin > 0 && Number.isFinite(cap.odgActiveHoursPerDay)) {
    const parallel = Number.isFinite(cap.odgParallelism) ? cap.odgParallelism : 1;
    perDayBounds.odgBound = Math.floor((Number(cap.odgActiveHoursPerDay) * parallel) / (odgActiveMin / 60));
  }
  if (residualHumanMin > 0 && Number.isFinite(cap.humanHoursPerDay)) {
    perDayBounds.humanBound = Math.floor(Number(cap.humanHoursPerDay) / (residualHumanMin / 60));
  }
  if (Number.isFinite(cap.rateLimitPerDay)) perDayBounds.rateLimit = Number(cap.rateLimitPerDay);
  const boundVals: number[] = (Object.values(perDayBounds) as any[]).filter((x) => Number.isFinite(x));
  const deliveriesPerDay = boundVals.length ? Math.min(...boundVals) : null;
  const bindingConstraint = deliveriesPerDay === null ? "UNKNOWN (insufficient capacity inputs)"
    : Object.keys(perDayBounds).find((k) => perDayBounds[k] === deliveriesPerDay);
  const deliveriesPerMonth = deliveriesPerDay === null ? null : deliveriesPerDay * workDays;
  const durationsMeasured = basis && basis.odgActive === "MEASURED" && (residualHumanMin === 0 || basis.residualHuman === "MEASURED");
  const capacityBasis = deliveriesPerDay === null ? "UNKNOWN" : (durationsMeasured ? "MEASURED" : "ESTIMATED");
  if (deliveriesPerDay !== null && !durationsMeasured) warnings.push("CAPACITY_UNPROVEN: deliveries/day derived from ESTIMATED durations — an estimate, not a demonstrated SLA (measure real missions to confirm).");

  return {
    _type: "odg/unit-economics/v1",
    rule: "autonomous-execution-policy: ODG executes what it can; CTO time imputed ONLY to genuinely-human steps; automatable work left to a human is flagged.",
    policyAudit,
    time: { odgActiveMin, odgWaitMin, residualHumanMin, totalElapsedMin, basis },
    costs: { direct: EU.format(directTotal), odgActiveMarginal: EU.format(odgActiveMarginal), residualHuman: EU.format(residualHumanCost), odgActiveNotFree: Number.isFinite(odgRate) },
    price: EU.format(price),
    contributionMargin: EU.format(contributionMargin),
    marginIncludingHuman: EU.format(marginIncludingHuman),
    perHour,
    capacity: { bindingConstraint, deliveriesPerDay, deliveriesPerMonth, perDayBounds, workingDaysPerMonth: workDays, basis: capacityBasis },
    warnings,
    disclaimer: "ESTIMATION unless every input carries basis MEASURED. Revenue ≠ profit. ODG active time is NOT free. Residual human time counts ONLY genuinely human steps (approval/signature/reserved decision); it is reported separately because it is the scarce input. Capacity is the binding constraint, not an extrapolation from one run.",
  };
}

module.exports = { computeUnitEconomics };
export {};
