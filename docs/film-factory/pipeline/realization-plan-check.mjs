// Tests for the realization layer + anti-slideshow gate + coverage-mix audit + dramatic-function gate. READ-ONLY.
import { buildRealization, antiSlideshowGate, coverageMixAudit, classify, dramaticFunctionGate } from './realization-plan-f10.mjs';
let pass = 0, fail = 0; const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

const real = buildRealization();
const buckets = {};
for (const s of real.shots) buckets[s.classification] = (buckets[s.classification] || 0) + 1;
ok('every shot classified', real.shots.every(s => s.classification));
ok('buckets sum to shot count', Object.values(buckets).reduce((a, b) => a + b, 0) === real.shots.length);
const stills = real.shots.filter(s => s.mediaCategory === 'STILL_ANIMATABLE');
const stillClasses = new Set(stills.map(s => s.classification));
ok('196 stills are NOT blanket-accepted (split by need)', stillClasses.size >= 2 && !stillClasses.has('ESSENTIAL_HUMAN_MOVEMENT'));
ok('there ARE essential human-movement shots (video justified)', buckets['ESSENTIAL_HUMAN_MOVEMENT'] > 0);
ok('there ARE legitimate stills (not all forced to video)', buckets['LEGITIMATE_STILL'] > 0);
const visuals = real.shots.filter(s => s.mediaCategory === 'PREMIUM_VIDEO' || s.mediaCategory === 'STILL_ANIMATABLE');
ok('every visual shot prompt-linked', visuals.every(s => s.promptLinked));
ok('classify audio => VOICE', classify({ mediaCategory: 'AUDIO_LINE', shotType: 'AUDIO', subjectAction: '', sceneHead: '' }) === 'VOICE');
ok('classify wide video => ENVIRONMENT_MOVEMENT', classify({ mediaCategory: 'PREMIUM_VIDEO', shotType: 'PREMIUM_VIDEO-WIDE', subjectAction: 'establishing', sceneHead: '' }) === 'ENVIRONMENT_MOVEMENT');

const flags = antiSlideshowGate(real);
const STAT = new Set(['FLAG', 'NEEDS_REAL_MEDIA', 'BLOCKED']);
ok('flags present (gate actually runs)', flags.length > 0);
for (const f of flags.slice(0, 50)) ok(`flag ${f.id}/${f.cause}: well-formed`, f.id && f.scene && f.cause && f.evidence && f.candidateFix && Array.isArray(f.depsToRetest) && STAT.has(f.status));
ok('no flag claims artistic validation', flags.every(f => !/validated|approved|good quality/i.test(JSON.stringify(f))));
ok('motion shots => NEEDS_REAL_MEDIA (not simulated success)', flags.some(f => f.cause === 'MOTION_QUALITY_UNJUDGEABLE_DRYRUN' && f.status === 'NEEDS_REAL_MEDIA'));
const sc47f = flags.find(f => f.scene === 'SC47' && f.cause === 'POSSIBLE_EMPTY_SCENE');
ok('intentional-silence scene flagged for confirmation (not auto-failed)', !sc47f || sc47f.status === 'FLAG');

const mix = coverageMixAudit(real);
ok('mix percentages ~ sum 100', Math.abs(mix.mix.videoPct + mix.mix.stillPct + mix.mix.voicePct + mix.mix.musicPct - 100) <= 2);
ok('generated coverage < 60 min (reuse assumption exists)', mix.generatedCoverageMin < 60 && mix.reuseHoldToFillMin > 0);
ok('reuse/coverage assumption flagged UNPROVEN', /UNPROVEN/i.test(mix.unprovenCoverageNote) && /NEEDS_REAL_MEDIA/.test(mix.unprovenCoverageNote));

// dramatic-function gate
const g = dramaticFunctionGate();
ok('functionGate covers 49 scenes', g.scenes === 49);
ok('functionGate allPass (every scene a function)', g.allPass === true && g.flags.length === 0);
ok('functions ⊆ allowed set', g.rows.every(r => r.functions.every(f => ['INFORMATION', 'EMOTION', 'ANTICIPATION', 'TRANSFORMATION'].includes(f))));
ok('SC47 intentional-silence OK (not auto-failed)', g.sc47Verdict && g.sc47Verdict.intentionalSilenceOk === true && g.sc47Verdict.silent === true);
ok('silent scenes judged by progression (not auto-fail)', g.rows.filter(r => r.silent).every(r => r.pass === true));

console.log(`realization-plan-check: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
