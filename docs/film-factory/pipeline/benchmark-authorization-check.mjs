// Verifies the gate-12 authorization package: (A) the 5-shot cost estimate is sourced/dated/worst-case-bounded and
// never presented as actual, and (B) the fail-closed state machine's invariants are actually ENFORCED by the
// existing modules (requireAuth default-blocked, BudgetLedger refuses crossing spend, ≤8 attempts, €0 state).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BudgetLedger } from './film-pipeline.mjs';
import { requireAuth, DEFAULT_AUTH, run } from './production-runner-f10.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const E = JSON.parse(readFileSync(join(here, 'benchmark-cost-estimate-f10.json'), 'utf8'));
const FSM = JSON.parse(readFileSync(join(here, 'benchmark-state-machine.json'), 'utf8'));
const PR = JSON.parse(readFileSync(join(here, 'pricing-register-f10.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

// A) cost estimate
ok('estimate covers 5 benchmark groups (6 shots incl. continuity pair)', E.rows.length === 6);
ok('prices dated to the register observation date', E.pricesObserved === PR.observed);
ok('estimate is ESTIMATE/not-quote/not-actual', /NOT actual/i.test(E.generated) && E.yieldsAreUnmeasured === true);
ok('every row separates price/attempts/failed/yield/worst-case', E.rows.every(r => typeof r.unitUsd === 'number' && typeof r.expectedAttempts === 'number' && typeof r.failedGensPerUsable === 'number' && typeof r.yield === 'number' && typeof r.worstCaseEur === 'number'));
ok('attempts = 1/yield (rounded)', E.rows.every(r => Math.abs(r.expectedAttempts - 1 / r.yield) < 0.02));
ok('worst-case uses 8-attempt cap (≥ expected)', E.rows.every(r => r.worstCaseEur >= r.expectedEur) && E.maxAttemptsPerShot === 8);
ok('FX + VAT uncertainty envelope present', /drift/i.test(E.fxAssumption) && /VAT/.test(E.fxAssumption) && E.totals.worstCaseEur_withFXandVAT >= E.totals.worstCaseEur_base);
ok('worst-case (w/ FX+VAT) within €250 ceiling', E.totals.worstCaseEur_withFXandVAT <= 250 && /within €250/.test(E.totals.worstCaseVsCeiling250));
ok('ceiling explicitly NOT a spend authorization', /NOT spend authorization/i.test(E.authorizedCeilingNote));
ok('Veo exclusion + hero/std tiers documented', E.caveats.some(c => /Veo excluded/.test(c)));

// B) FSM invariants ENFORCED by existing code
ok('UNAUTHORIZED by default: paidGeneration BLOCKED', requireAuth('paidGeneration', DEFAULT_AUTH).authorized === false);
ok('install BLOCKED by default; ffmpeg now AVAILABLE (locally provisioned, non-privileged)', requireAuth('install', DEFAULT_AUTH).authorized === false && requireAuth('ffmpeg', DEFAULT_AUTH).authorized === true);
// BudgetLedger enforces cumulative hard stop (refuses crossing spend)
const L = new BudgetLedger(250);
let refused = false; try { L.spend(300, 'overspend'); } catch { refused = true; }
ok('BudgetLedger refuses spend crossing the cap', refused && L.spent === 0);
L.spend(13.75, 'worst-case benchmark'); ok('ledger accepts within-cap spend + tracks it', L.spent === 13.75 && L.remaining() === 236.25);
// runner stays €0 / unauthorized / no real media in dry-run
const r = run({ dryRun: true });
ok('runner dry-run: €0 spent, no real media, not authorized to generate', r.spent === 0 && r.mediaReal === false && r.trace.find(t => t.stage === 'generate.real').status.includes('BLOCKED'));
ok('non-dry-run refused without explicit auth', run({ dryRun: false }).blocked === true);
// FSM spec well-formed
ok('FSM: UNAUTHORIZED is the start state', FSM.states[0].state === 'UNAUTHORIZED');
ok('FSM: ≤8 attempts + no-bypass + persist evidence invariants present', FSM.invariants.some(i => /8 attempts/.test(i)) && FSM.invariants.some(i => /no retry bypasses/i.test(i)) && FSM.invariants.some(i => /Persist/i.test(i)));
ok('FSM: human score only if real review', FSM.invariants.some(i => /human-review score.*ONLY if a real human/i.test(i)));
ok('FSM: 60:00 unproven until real file', FSM.invariants.some(i => /UNPROVEN until a real exported file/i.test(i)));
ok('FSM: provider-enforcement caveat = BLOCKED-until-verified', FSM.providerEnforcementCaveat.status === 'BLOCKED-until-verified' && /prepaid/i.test(FSM.providerEnforcementCaveat.note));

console.log(`benchmark-authorization-check: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
