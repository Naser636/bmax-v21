#!/usr/bin/env node
"use strict";
/* Tests for odg-amortissement (depreciation schedule, linéaire + dégressif, prorata). PURE. Invariant-checked. */
const M = require("./odg-amortissement.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const deps = (r: any) => r.rows.map((x: any) => x.depreciationMinor);
// INVARIANTS every valid schedule must satisfy
function invariants(r: any, basis: number, residual: number): boolean {
  if (!r.ok) return false;
  const sum = r.rows.reduce((a: number, x: any) => a + x.depreciationMinor, 0);
  if (sum !== basis - residual) return false;
  if (r.totalDepreciatedMinor !== basis - residual) return false;
  if (r.rows[r.rows.length - 1].closingMinor !== residual) return false;
  let acc = 0, open = basis;
  for (const x of r.rows) {
    if (x.openingMinor !== open) return false;
    if (x.openingMinor - x.depreciationMinor !== x.closingMinor) return false;
    acc += x.depreciationMinor;
    if (x.accumulatedMinor !== acc) return false;
    open = x.closingMinor;
  }
  return true;
}

function main(): void {
  // A — linear, 12 000,00 basis, 5y, no residual, no prorata ⇒ 5× 2 400,00
  const A = M.computeDepreciationSchedule({ basisMinor: 1200000, method: "linear", usefulLifeYears: 5 });
  check("A linear: 5 rows of 240000, closing 0", JSON.stringify(deps(A)) === JSON.stringify([240000, 240000, 240000, 240000, 240000]) && A.rows[4].closingMinor === 0);
  check("A invariants (Σ = basis, closing = residual, monotone)", invariants(A, 1200000, 0));

  // B — linear prorata 0.5 ⇒ Y1 120000, Y2-5 240000, Y6 120000 (6 rows)
  const B = M.computeDepreciationSchedule({ basisMinor: 1200000, method: "linear", usefulLifeYears: 5, firstYearProrataRatio: 0.5 });
  check("B linear prorata 0.5: 6 rows [120000,240000×4,120000]", JSON.stringify(deps(B)) === JSON.stringify([120000, 240000, 240000, 240000, 240000, 120000]));
  check("B invariants", invariants(B, 1200000, 0));

  // C — declining coeff 1.75 (rate 35%) ⇒ last row absorbs; Σ exact
  const C = M.computeDepreciationSchedule({ basisMinor: 1200000, method: "declining", usefulLifeYears: 5, decliningCoefficient: 1.75 });
  check("C declining: Y1 420000, Y2 273000, Y3 177450, last row absorbs, closing 0", C.rows[0].depreciationMinor === 420000 && C.rows[1].depreciationMinor === 273000 && C.rows[2].depreciationMinor === 177450 && C.rows[4].closingMinor === 0);
  check("C declining is front-loaded (Y1 > Y2 > Y3)", C.rows[0].depreciationMinor > C.rows[1].depreciationMinor && C.rows[1].depreciationMinor > C.rows[2].depreciationMinor);
  check("C invariants (Σ exact despite per-year rounding)", invariants(C, 1200000, 0));

  // D — linear with residual 100000, 3y ⇒ 3× 300000, closing = residual
  const D = M.computeDepreciationSchedule({ basisMinor: 1000000, method: "linear", usefulLifeYears: 3, residualMinor: 100000 });
  check("D linear + residual: 3× 300000, final closing = 100000 (residual), total = 900000", JSON.stringify(deps(D)) === JSON.stringify([300000, 300000, 300000]) && D.rows[2].closingMinor === 100000 && D.totalDepreciatedMinor === 900000);
  check("D invariants", invariants(D, 1000000, 100000));

  // declining with residual: Σ == basis − residual, closing lands exactly on residual
  const Cr = M.computeDepreciationSchedule({ basisMinor: 1000000, method: "declining", usefulLifeYears: 4, decliningCoefficient: 2, residualMinor: 50000 });
  check("declining + residual: closing lands on residual, Σ exact", invariants(Cr, 1000000, 50000) && Cr.rows[Cr.rows.length - 1].closingMinor === 50000);

  // switch-to-linear: once SL-on-remaining beats declining, switch (more depreciation sooner)
  const sw = M.computeDepreciationSchedule({ basisMinor: 1200000, method: "declining", usefulLifeYears: 5, decliningCoefficient: 1.75, switchToLinearWhenBetter: true });
  check("switchToLinear: Y4 switches to straight-line-on-remaining (164775), Σ exact", sw.rows[3].depreciationMinor === 164775 && invariants(sw, 1200000, 0));
  // odd rounding basis: Σ still exact (final row absorbs drift)
  const odd = M.computeDepreciationSchedule({ basisMinor: 1000003, method: "linear", usefulLifeYears: 3 });
  check("non-divisible basis ⇒ Σ still exactly basis (final row absorbs drift)", invariants(odd, 1000003, 0));

  // REGRESSION (inspector fuzz): small depreciable base over a long life must NOT produce a negative row
  const longLife = M.computeDepreciationSchedule({ basisMinor: 100, method: "linear", usefulLifeYears: 40 });
  check("basis 100 / life 40 ⇒ NO negative depreciation, NO balance below residual, Σ exact (largest-remainder)",
    longLife.rows.every((x: any) => x.depreciationMinor >= 0 && x.closingMinor >= 0) && invariants(longLife, 100, 0));
  check("basis 100 / life 40 ⇒ rows are 3s then 2s (apportioned), not a negative final row", longLife.rows[0].depreciationMinor === 3 && longLife.rows[39].depreciationMinor === 2);

  // DETERMINISTIC fuzz-lite: invariants + non-negativity across many shapes (incl. asset-near-residual, long life)
  let fuzzBad = 0; let fuzzN = 0;
  for (let basis = 7; basis <= 300000; basis += 4999) {
    for (const life of [1, 2, 3, 7, 12, 33, 40]) {
      for (const residual of [0, Math.floor(basis * 0.3), basis - 1]) {
        if (!(residual >= 0 && residual < basis)) continue;
        for (const method of ["linear", "declining"]) {
          for (const prorata of [1, 0.5, 0.771]) {
            const inp: any = { basisMinor: basis, method, usefulLifeYears: life, residualMinor: residual, firstYearProrataRatio: prorata };
            if (method === "declining") inp.decliningCoefficient = 1.75;
            const r = M.computeDepreciationSchedule(inp);
            fuzzN++;
            if (!invariants(r, basis, residual) || r.rows.some((x: any) => x.depreciationMinor < 0 || x.closingMinor < residual || !Number.isFinite(x.depreciationMinor))) fuzzBad++;
          }
        }
      }
    }
  }
  check(`fuzz-lite: ${fuzzN} schedules, 0 invariant/negativity violations`, fuzzBad === 0 && fuzzN > 1000);

  // FAIL-CLOSED: the French dégressif coefficient / life are NOT assumed
  check("declining without coefficient ⇒ MISSING_COEFFICIENT (1.75 not assumed)", M.computeDepreciationSchedule({ basisMinor: 1000000, method: "declining", usefulLifeYears: 5 }).code === "MISSING_COEFFICIENT");
  check("declining coefficient ≤ 0 ⇒ INVALID_COEFFICIENT", M.computeDepreciationSchedule({ basisMinor: 1000000, method: "declining", usefulLifeYears: 5, decliningCoefficient: 0 }).code === "INVALID_COEFFICIENT");
  check("residual ≥ basis ⇒ INVALID_RESIDUAL", M.computeDepreciationSchedule({ basisMinor: 1000, method: "linear", usefulLifeYears: 5, residualMinor: 1000 }).code === "INVALID_RESIDUAL");
  check("prorata out of (0,1] ⇒ INVALID_PRORATA", M.computeDepreciationSchedule({ basisMinor: 1000, method: "linear", usefulLifeYears: 5, firstYearProrataRatio: 1.5 }).code === "INVALID_PRORATA" && M.computeDepreciationSchedule({ basisMinor: 1000, method: "linear", usefulLifeYears: 5, firstYearProrataRatio: 0 }).code === "INVALID_PRORATA");
  check("non-positive/float basis ⇒ INVALID_BASIS", M.computeDepreciationSchedule({ basisMinor: 0, method: "linear", usefulLifeYears: 5 }).code === "INVALID_BASIS" && M.computeDepreciationSchedule({ basisMinor: 1.5, method: "linear", usefulLifeYears: 5 }).code === "INVALID_BASIS");
  check("bad life ⇒ INVALID_LIFE", M.computeDepreciationSchedule({ basisMinor: 1000, method: "linear", usefulLifeYears: 0 }).code === "INVALID_LIFE");
  check("bad method ⇒ INVALID_METHOD", M.computeDepreciationSchedule({ basisMinor: 1000, method: "sum-of-years", usefulLifeYears: 5 }).code === "INVALID_METHOD");
  check("non-object ⇒ BAD_INPUT", M.computeDepreciationSchedule(null).code === "BAD_INPUT");

  // honesty + determinism + frozen + contract
  check("note: book allocation, never cash/market/fiscal; coefficients caller-supplied; not fiscal compliance", /BOOK allocation/.test(A.note) && /NOT a cash outflow/.test(A.note) && /not fiscal compliance/.test(A.note));
  check("deterministic", JSON.stringify(M.computeDepreciationSchedule({ basisMinor: 1200000, method: "declining", usefulLifeYears: 5, decliningCoefficient: 1.75 })) === JSON.stringify(C));
  check("frozen (result, rows, a row)", Object.isFrozen(A) && Object.isFrozen(A.rows) && Object.isFrozen(A.rows[0]));
  check("contract: book-not-cash, caller-supplied-not-legal, sum-exact, declining-remainder, fail-closed",
    M.AMORTISSEMENT_CONTRACT.invariants.some((s: string) => /NEVER a cash outflow/.test(s)) &&
    M.AMORTISSEMENT_CONTRACT.invariants.some((s: string) => /CALLER-SUPPLIED .* NEVER hardcoded as legal\/fiscal truth/.test(s)) &&
    M.AMORTISSEMENT_CONTRACT.invariants.some((s: string) => /Σ depreciation == basis − residual EXACTLY/.test(s)) &&
    M.AMORTISSEMENT_CONTRACT.invariants.some((s: string) => /final year absorbs the remainder/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-amortissement (depreciation schedule: linear 1.2M/5y⇒5×240000; prorata 0.5⇒6 rows [120000,240000×4,120000]; dégressif coeff1.75⇒420000/273000/177450/last-absorbs front-loaded; residual⇒closing lands on residual; switch-to-linear; INVARIANTS Σ==basis−residual exact + closing==residual + opening−dep==closing + monotone [incl. non-divisible/declining-rounding]; 1.75/life NOT assumed [MISSING_COEFFICIENT]; bad basis/life/method/residual/prorata/coeff fail-closed; BOOK≠cash/market/fiscal honest; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
