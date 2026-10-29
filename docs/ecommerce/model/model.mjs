// ODG deterministic financial model — recomputable, no double-count, cash/stock/profit separated.
// All unit inputs are ESTIMATED/NON_VERIFIED (need supplier quotes + marketplace pulls); the MODEL LOGIC is
// what is verified here (recomputes, respects the 10k cap, reconciles cash+stock). cwd=sandbox; writes a JSON.
// Recommended niche: premium indoor-cat enrichment accessories; channel: Amazon.fr FBM (self-ship) first.

const CAP = 10000;                 // hard capital cap (EUR), all-in
const UNIT_COST = 8.0;             // wholesale cost/unit TTC (franchise-en-base: input VAT NOT reclaimable) [NON_VERIFIED→quote]
const FIXED = { amazonPro: 39, tools: 20, claudeAlloc: 25 }; // EUR/month; claudeAlloc = incremental allocation (see technical-cost doc)
const SHIP_PACK = 4.5;             // self-ship + packaging per unit sold (Colissimo/Mondial Relay small parcel) [ESTIMATED]
const AMAZON_FEE = 0.15;           // referral fee fraction (pet ~15%) [SOURCED range]
const COTIS = 0.123;               // micro-social cotisations on revenue, sale-of-goods ~12.3% [ESTIMATED, 2026 exact NON_VERIFIED]
const PAYOUT_DELAY_FRAC = 0.5;     // half of a month's sales cash collected within the month, half next month (~14-day payout)

// Scenarios differ on ASP, monthly sell-through of AVAILABLE stock, returns, and ad spend.
const SC = {
  prudent:   { asp: 20, sell: 0.40, ret: 0.08, ads: 50,  initStock: 3200 },
  central:   { asp: 22, sell: 0.60, ret: 0.05, ads: 150, initStock: 4000 },
  favorable: { asp: 24, sell: 0.80, ret: 0.03, ads: 300, initStock: 4800 },
};
const round = (x) => Math.round(x * 100) / 100;

function run(name, p) {
  const fixedMo = FIXED.amazonPro + FIXED.tools + FIXED.claudeAlloc;
  // Initial allocation: stock + a one-off setup (photos/tools) + reserve. Buy initial stock in M1.
  let cash = CAP;
  let unitsOnHand = Math.floor(p.initStock / UNIT_COST);
  const initStockSpend = unitsOnHand * UNIT_COST;
  cash -= initStockSpend;                 // stock purchase: cash -> inventory (NOT an expense, NOT profit)
  let stockValue = initStockSpend;
  let deferredCollections = 0;            // sales revenue not yet paid out (payout delay)
  const months = [];
  let cumAccountingResult = 0;

  for (let m = 1; m <= 3; m++) {
    const startCash = cash;
    // Reorder: from M2, buy more stock IF cash allows, capped so we never exceed CAP cumulatively and keep reserve.
    let reorderSpend = 0;
    if (m >= 2) {
      const targetReorder = Math.min(2000, Math.max(0, cash - 1500)); // keep >=1500 reserve
      const reorderUnits = Math.floor(targetReorder / UNIT_COST);
      reorderSpend = reorderUnits * UNIT_COST;
      cash -= reorderSpend; stockValue += reorderSpend; unitsOnHand += reorderUnits;
    }
    const unitsSold = Math.floor(unitsOnHand * p.sell);
    const revenue = unitsSold * p.asp;
    const cogs = unitsSold * UNIT_COST;                 // cost of units SOLD (from inventory)
    const platformFees = revenue * AMAZON_FEE;
    const shipPack = unitsSold * SHIP_PACK;
    const refunds = revenue * p.ret;                     // refunded revenue (returns)
    const returnShipLoss = unitsSold * p.ret * SHIP_PACK; // lost shipping on returns
    const cotis = revenue * COTIS;
    const ads = p.ads;
    const fixed = fixedMo;

    // Accounting result (P&L) for the month — NOT cash:
    const contributiveMargin = revenue - cogs - platformFees - shipPack - refunds - returnShipLoss - cotis - ads;
    const accountingResult = contributiveMargin - fixed;
    cumAccountingResult += accountingResult;

    // Inventory: units sold leave stock; returned units (restockable) partially return — assume refunded units are lost (conservative).
    unitsOnHand -= unitsSold;
    stockValue -= cogs;

    // CASH: collections subject to payout delay. Cash expenses paid in-month.
    const grossCashFromSales = revenue - platformFees - refunds; // net marketplace payout basis
    const collectedNow = grossCashFromSales * PAYOUT_DELAY_FRAC + deferredCollections;
    deferredCollections = grossCashFromSales * (1 - PAYOUT_DELAY_FRAC);
    const cashOut = shipPack + returnShipLoss + cotis + ads + fixed;
    cash = cash + collectedNow - cashOut;

    months.push({
      month: m, startCash: round(startCash), reorderSpend: round(reorderSpend),
      unitsAvail: unitsSold + unitsOnHand, unitsSold, asp: p.asp, revenue: round(revenue),
      cogs: round(cogs), platformFees: round(platformFees), shipPack: round(shipPack),
      refunds: round(refunds), returnShipLoss: round(returnShipLoss), cotis: round(cotis), ads, fixed,
      contributiveMargin: round(contributiveMargin), accountingResult: round(accountingResult),
      endCash: round(cash), stockValueEnd: round(stockValue), unitsOnHandEnd: unitsOnHand,
      deferredCollections: round(deferredCollections),
    });
  }
  // Breakeven units/month (cover monthly fixed at central contributive-margin-per-unit):
  const cmPerUnit = p.asp * (1 - AMAZON_FEE - COTIS - p.ret) - UNIT_COST - SHIP_PACK;
  const breakevenUnits = cmPerUnit > 0 ? Math.ceil(fixedMo / cmPerUnit) : Infinity;

  return { name, initUnits: Math.floor(p.initStock / UNIT_COST), initStockSpend: round(initStockSpend),
    months, cumAccountingResult: round(cumAccountingResult),
    endCash: round(cash), endStockValue: round(stockValue), endUnits: unitsOnHand,
    cashPlusStockEnd: round(cash + stockValue + deferredCollections),
    cmPerUnit: round(cmPerUnit), breakevenUnitsPerMonth: breakevenUnits };
}

// ---- INVARIANT CHECKS (ODG verification) ----
const results = {};
let checks = [], ok = 0, bad = 0;
const assert = (n, c) => { checks.push((c?"PASS ":"FAIL ")+n); c?ok++:bad++; };
for (const [name, p] of Object.entries(SC)) {
  const r = run(name, p);
  results[name] = r;
  assert(`${name}: initial stock spend <= CAP`, r.initStockSpend <= CAP);
  assert(`${name}: never spends beyond CAP (initial stock + reorders <= CAP)`, r.initStockSpend + r.months.reduce((s,m)=>s+m.reorderSpend,0) <= CAP + 1e-6);
  assert(`${name}: end cash never negative`, r.months.every(m=>m.endCash >= -1e-6));
  // cash+stock+deferred should be <= CAP + cumulative accounting result (money only grows via profit)
  assert(`${name}: cash+stock+deferred ~= CAP + cumulative result (no money invented)`, Math.abs(r.cashPlusStockEnd - (CAP + r.cumAccountingResult)) < 1.0);
}
const out = { generatedFor: "ODG_ECOMMERCE_OPPORTUNITY_TO_CASH_V1", cap: CAP,
  inputs: { UNIT_COST, FIXED, SHIP_PACK, AMAZON_FEE, COTIS, PAYOUT_DELAY_FRAC, SC },
  results, checks, verify: bad===0?"PASS":"FAIL" };
console.log(JSON.stringify(out, null, 1));
console.log("\nINVARIANTS: " + checks.join(" | "));
console.log(`MODEL VERIFY: ${bad===0?"PASS":"FAIL"} (pass=${ok} fail=${bad})`);
