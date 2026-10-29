// AUTOMATED checks for the 5-minute opening production PACKAGE (non-billed). Verifies structural/financial
// integrity of the PLAN — NOT cinematic quality and NOT that footage exists (it does not). No paid call.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const R = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const plan = R('prototype-plan.json'), man = R('opening-asset-manifest.json'), bud = R('opening-budget.json'), rule = R('continuity-rulebook.json'), hand = R('handoff-spec.json');

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

// duration targets 300s
ok('plan targets 300s', plan.targetDuration.seconds === 300);
ok('manifest target timeline 300s', man.totals.targetTimelineSec === 300);
ok('source seconds within a sane band for a 5-min cut (200–320)', (man.totals.videoSec + man.totals.coverageSec) >= 200 && (man.totals.videoSec + man.totals.coverageSec) <= 320);

// asset-ID + checksum discipline
ok('all asset IDs unique', new Set(man.shots.map(s => s.assetId)).size === man.shots.length);
ok('all shots PLANNED with null source/sha (no footage claimed)', man.shots.every(s => s.status === 'PLANNED' && s.sourceFile === null && s.sha256 === null && s.accepted === null));
ok('every shot has model + duration + prompt ref + prev/next wiring', man.shots.every((s, i) => s.model && s.durationSec && s.promptRef && (i === 0 || s.prevShot) && (i === man.shots.length - 1 || s.nextShot)));
ok('identity-critical shots route to a multi/subject-reference model', man.shots.filter(s => s.identityCritical === true).every(s => /seedance-2\.5|minimax/.test(s.model)));

// budget integrity: confirmed vs estimated separated; ceiling >= worst-case euro
ok('budget separates CONFIRMED vs ESTIMATED prices', !!bud.priceBasis.CONFIRMED_Replicate_2026-10-24 && !!bud.priceBasis.ESTIMATED_not_integrated);
ok('music/sfx are tagged ESTIMATED (not confirmed)', bud.lineItems.filter(l => /music|sfx/i.test(l.category)).every(l => l.priceTier === 'ESTIMATED'));
ok('hard EUR ceiling >= worst-case adverse euro', bud.authorizationRequest.recommendedHardCeilingEUR >= bud.eurConversion.worstCase_adverseFXplusFee_EUR);
ok('ledger governance: new budget, pilot counter NOT reset', /EXHAUSTED/.test(bud.ledgerGovernance) && /NOT be reset/.test(bud.ledgerGovernance));
ok('stop conditions include reserve-before-call + indeterminate-billing halt', bud.authorizationRequest.stopConditions.some(s => /reserve WORST-CASE/.test(s)) && bud.authorizationRequest.stopConditions.some(s => /INDETERMINATE/.test(s)));
ok('status is BLOCKED pending authorization', /AUTHORIZATION/.test(bud.status) && /No paid call/.test(bud.status));

// continuity rulebook + handoff present and locked
ok('rulebook covers visual/sound/weapon/character/geography', ['visual','sound','weaponContinuity','character','geography'].every(k => rule[k]));
ok('handoff locks an ending state + forbids resetting the next milestone', !!hand.lockedEndingState && /reset/i.test(hand.nextMilestone.doNotReset) && !!hand.revisionRule);

// Björn is the opening's protagonist in the manifest (present in the most shots among characters)
const present = {}; for (const s of man.shots) for (const c of s.charactersPresent) present[c] = (present[c] || 0) + 1;
ok('Björn (CHAR-013) is the most-present character in the opening', Object.entries(present).sort((a,b)=>b[1]-a[1])[0][0] === 'CHAR-013');

console.log('OPENING-PACKAGE TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
console.log('present counts:', JSON.stringify(present));
console.log('NOTE: package integrity only. NO footage exists; cinematic quality + final duration are determined only after authorized generation + human review.');
process.exit(fail === 0 ? 0 : 1);
