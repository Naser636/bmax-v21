// Safety + correctness tests for the DRY-RUN production runner. Asserts: no side effects / no spend, unauthorized
// external actions refused, BLOCKED propagation, chain order + dependencies, acceptance + selection, chronology/
// durations, no export validation without a real measured file, F10 + registers preserved. READ-ONLY on registers.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { run, requireAuth, DEFAULT_AUTH } from './production-runner-f10.mjs';
import { InactiveProviderAdapter } from './provider-adapter.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const f10Path = join(here, '..', '37_SCREENPLAY_60MIN_F10.md');
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');

let pass = 0, fail = 0;
const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

// capture F10 hash before any run (runner must not touch it)
const f10Before = hash(f10Path);

// 1) DRY-RUN: no spend, no real media, film not produced
const r = run({ dryRun: true });
ok('dry-run spent €0', r.spent === 0 && r.costEurReal === 0);
ok('dry-run committed €0', r.committed === 0);
ok('mediaReal false', r.mediaReal === false);
ok('filmProduced false', r.filmProduced === false);
ok('exportValidated false', r.exportValidated === false);
ok('budgetAuthorized 0', r.budgetAuthorized === 0);

// 2) authorization gate: all external capabilities BLOCKED by default
// paid generation + install remain BLOCKED by default; ffmpeg is now AVAILABLE (locally provisioned, non-privileged)
for (const cap of ['paidGeneration', 'install']) ok(`requireAuth('${cap}') blocked by default`, requireAuth(cap, DEFAULT_AUTH).authorized === false);
ok(`requireAuth('ffmpeg') now authorized (local static binary provisioned)`, requireAuth('ffmpeg', DEFAULT_AUTH).authorized === true);
ok('paidGeneration needs BOTH flag AND key', requireAuth('paidGeneration', { allowPaidGeneration: true, providerKeys: {} }).authorized === false
  && requireAuth('paidGeneration', { allowPaidGeneration: true, providerKeys: { runway: 'k' } }).authorized === true);

// 3) non-dry-run refused without auth (gate 12) AND refused even with auth (no real provider wired)
const rNoAuth = run({ dryRun: false });
ok('non-dry-run without auth => BLOCKED', rNoAuth.blocked === true && /gate 12/.test(rNoAuth.blockReason));
const rAuth = run({ dryRun: false, auth: { allowPaidGeneration: true, providerKeys: { runway: 'k' } } });
ok('non-dry-run WITH auth still BLOCKED (not implemented, no false claim)', rAuth.blocked === true && rAuth.filmProduced === false && rAuth.mediaReal === false);

// 4) BLOCKED propagation: real-gen, export, release are BLOCKED in dry-run
const blockedStages = r.trace.filter(t => /BLOCKED/.test(t.status)).map(t => t.stage);
ok('generate.real BLOCKED', blockedStages.includes('generate.real'));
ok('export BLOCKED (no real file)', blockedStages.includes('gate4.export'));
ok('release BLOCKED', blockedStages.includes('release'));

// 5) chain order: stages appear in dependency order
const order = r.trace.map(t => t.stage);
const idx = s => order.indexOf(s);
ok('chain order load<plan<generate<acceptance<assembly<export', idx('load') < idx('plan') && idx('plan') < idx('generate.simulated') && idx('generate.simulated') < idx('acceptance.simulated') && idx('acceptance.simulated') < idx('assembly.plan') && idx('assembly.plan') < idx('gate4.export'));

// 6) dependencies: fail a scene's establisher => its dependents BLOCKED (not accepted)
const rDep = run({ dryRun: true, failFixtureIds: ['SC06-SH01'] });
const acc = rDep.trace.find(t => t.stage === 'acceptance.simulated').detail;
ok('failing establisher reduces accepted (dependents blocked/rejected)', acc.accepted < 420 && (acc.rejected > 0));

// 7) acceptance + selection: a failing fixture is not selected
const rFail = run({ dryRun: true, failFixtureIds: ['SC10-SH02'] });
const selDetail = rFail.trace.find(t => t.stage === 'select').detail;
ok('failing fixture excluded from selection', selDetail.selected < 420);

// 8) chronology + durations: conductor = 49 scenes, generatedOutput = 1628s
const asm = r.trace.find(t => t.stage === 'assembly.plan').detail;
ok('conductor covers 49 scenes', r.conductorScenes === 49 && asm.scenes === 49);
ok('generatedOutput = 1628s (matches register)', asm.generatedOutputSec === 1628);

// 9) export cannot be validated without a real measured file
const exp = r.trace.find(t => t.stage === 'gate4.export').detail;
ok('export reasons cite no real file', exp.reasons.some(x => /no real exported file/.test(x)) && r.exportValidated === false);

// 10) run-report fixture written under runs/ (not a real medium), and F10 untouched
ok('dry-run report written under runs/', existsSync(join(here, 'runs', 'dry-run-latest.json')));
ok('report marks itself DRY-RUN + fixtures-not-real', /DRY-RUN/.test(r.note) && /NOT real media/.test(r.note));
ok('F10 unchanged by the runner', hash(f10Path) === f10Before);

// 11) FOUR GATES integrated into the single runner, in order, fail-closed in dry-run
const stageOrder = r.trace.map(t => t.stage);
const gi = s => stageOrder.indexOf(s);
ok('gate1 after select, before assembly', gi('select') < gi('gate1.coverage') && gi('gate1.coverage') < gi('assembly.plan'));
ok('gate2 after assembly', gi('assembly.plan') < gi('gate2.prototype'));
ok('gate3 after gate2, BLOCKED (NEEDS_REAL_MEDIA)', gi('gate2.prototype') < gi('gate3.realmedia') && blockedStages.includes('gate3.realmedia'));
ok('gate4 export BLOCKED (no real file)', blockedStages.includes('gate4.export'));
ok('gate1 never declares artistic validation', r.trace.find(t => t.stage === 'gate1.coverage').status.includes('NO ARTISTIC VALIDATION'));
const g1 = r.trace.find(t => t.stage === 'gate1.coverage').detail;
ok('gate1 carries dramatic-function result (all scenes pass)', g1.functionGateAllPass === true && g1.functionFlags === 0);
ok('gate1 records SC47 intentional-silence OK', g1.sc47IntentionalSilenceOk === true);
ok('gate1 carries scene-transition result (0 contradictions)', g1.transitionContradictions === 0 && typeof g1.transitionConfirmFlags === 'number' && g1.transitionNeedsRealMedia > 0);
ok('report: artisticValidation false', r.artisticValidation === false);
ok('report carries coverage mix + quality flags', r.coverageMix && r.qualityFlagCount > 0);

// 12) link.verify OK — every visual shot linked to its authored prompt
ok('link.verify OK (no unlinked/mismatch/dangling)', r.trace.find(t => t.stage === 'link.verify').status === 'OK');

// 13) provider adapter is INACTIVE — every capability BLOCKED, even WITH auth + keys (not wired)
const adapter = new InactiveProviderAdapter({ allowPaidGeneration: true, providerKeys: { runway: 'k' } });
for (const method of ['generateVideo', 'generateImage', 'generateVoice', 'generateMusic'])
  ok(`adapter.${method}() BLOCKED (no media, no call)`, adapter[method]().status === 'BLOCKED' && adapter[method]().file === null);
ok('adapter.available().usable false (inactive)', adapter.available().usable === false);
// adapter file contains no network/exec API USAGE (strip comments first; cannot reach a provider)
const adapterSrc = readFileSync(join(here, 'provider-adapter.mjs'), 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok('adapter source has no network/exec API usage', !/(fetch\s*\(|XMLHttpRequest|child_process|execSync\s*\(|\bspawn\s*\(|from\s+['"]node:(http|https|net|child_process))/.test(adapterSrc));

console.log(`production-runner-check: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
