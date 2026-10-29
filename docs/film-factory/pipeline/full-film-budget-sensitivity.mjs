// Reproducible LOW/BASE/HIGH budget via acceptance-rate SENSITIVITY on Scenario B (recommended).
// Retry factor = 1/acceptance (the dominant unknown). Reads the verified B base components. No paid call.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const ca = JSON.parse(readFileSync(join(here, 'runs/benchmark/full-film-cost-analysis.json'), 'utf8'));
const B = ca.scenarios.B_optimized.components_USD; // {pv,still,voice,music,refs,sfx} at 1 attempt (VERIFIED prices)

const FX = 1.08, FINISHED_MIN = 60; // F10 is a ~60-min feature (37_SCREENPLAY_60MIN_F10)
// generation components scale with attempts (1/acceptance); refs+sfx treated as ~fixed
const retryable = B.pv + B.still + B.voice + B.music;
const fixed = B.refs + B.sfx;

const ACCEPT = { low: 0.35, base: 0.50, high: 0.70 }; // low acceptance = high cost (conservative worst)
function tier(acc) {
  const retry = 1 / acc;
  const usd = +(retryable * retry + fixed).toFixed(2);
  return { acceptanceRate: acc, retryFactor: +retry.toFixed(2), totalUSD: usd, totalEUR: +(usd / FX).toFixed(2), costPerFinishedMinuteUSD: +(usd / FINISHED_MIN).toFixed(2), costPerFinishedMinuteEUR: +(usd / FINISHED_MIN / FX).toFixed(2) };
}
// note: "low budget" = HIGH acceptance; "high budget" = LOW acceptance. Report both plainly.
const out = {
  generated: '2026-10-24',
  mission: 'Full-film LOW/BASE/HIGH budget — acceptance-rate sensitivity on Scenario B. €0; no paid call.',
  scenario: 'B_optimized (recommended; preserves the quality gate)',
  baseComponents_USD_verifiedPrices: B,
  model: 'totalUSD = (pv+still+voice+music)×(1/acceptance) + (refs+sfx). FX EUR=USD/1.08. Finished feature ≈ 60 min.',
  assumptionTiers: { verifiedPrices: 'A/B — unit prices VERIFIED + arithmetic', acceptanceRate: 'D — UNMEASURED assumption (the dominant uncertainty); only a controlled test firms it', musicSfx: 'D/E — ESTIMATE (licensed library = €0 alternative)' },
  budget: {
    LOW_bestCase_highAcceptance: tier(ACCEPT.high),
    BASE_midAcceptance: tier(ACCEPT.base),
    HIGH_worstCase_lowAcceptance: tier(ACCEPT.low),
  },
  sensitivityNote: 'Cost is dominated by acceptance rate (1/acc). At 70% acceptance ≈ €65; at 50% ≈ €90; at 35% ≈ €128. These are ESTIMATES — the 8-attempt pilot is too small to set acceptance; a controlled validation is required before authorizing full-film spend.',
  costPerAcceptedShot: 'instrumented live by cost-ledger-schema.mjs during any authorized run (not fabricated here)',
  limits: 'Acceptance rate, music/SFX cost, and actual provider charges remain unmeasured. Do NOT treat any tier as a guaranteed production cost.',
};
writeFileSync(join(here, 'runs/benchmark/full-film-budget-sensitivity.json'), JSON.stringify(out, null, 1));
console.log('FULL-FILM BUDGET (Scenario B, acceptance sensitivity):');
for (const [k, v] of Object.entries(out.budget)) console.log('  ' + k.padEnd(28), 'acc=' + v.acceptanceRate, '$' + v.totalUSD + ' (€' + v.totalEUR + ')  €' + v.costPerFinishedMinuteEUR + '/finished-min');
