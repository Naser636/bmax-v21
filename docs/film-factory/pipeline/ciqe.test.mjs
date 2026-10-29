// CIQE calibration test (LOCAL, €0). Synthesizes CONTROLLED clips with known defects + one clean clip, runs the
// engine, and MEASURES detection vs false-rejects. This is the honest accuracy check (§5): coverage != accuracy.
import { analyze, analyzeSequence, analyzeAudioContinuity } from './ciqe.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const FFMPEG = join(here, 'vendor/node_modules/ffmpeg-static/ffmpeg');
const CAL = join(here, 'runs/benchmark/ciqe-cal');
rmSync(CAL, { recursive: true, force: true }); mkdirSync(CAL, { recursive: true });
const gen = (args, out) => { try { execFileSync(FFMPEG, ['-hide_banner', '-y', ...args, join(CAL, out)], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { console.log('gen FAILED', out, String(e.stderr || e.message).slice(-200)); } return existsSync(join(CAL, out)); };

// controlled sources
gen(['-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=25:d=1', '-pix_fmt', 'yuv420p'], 'black.mp4');
gen(['-f', 'lavfi', '-i', 'color=c=white:s=320x240:r=25:d=1', '-pix_fmt', 'yuv420p'], 'white.mp4');
gen(['-f', 'lavfi', '-i', 'color=c=gray:s=320x240:r=25:d=1', '-pix_fmt', 'yuv420p'], 'gray.mp4');
// clean A/V clip: colorful video + a moderate tone (so it is OK on BOTH video and audio dimensions)
gen(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25:d=1', '-f', 'lavfi', '-i', 'sine=frequency=300:d=1', '-map', '0:v', '-map', '1:a', '-af', 'volume=0.2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 'clean.mp4');
// flicker: alternate bright/dark frames via a per-frame brightness expression (eval=frame). No geq/comma escaping.
gen(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25:d=1', '-vf', "eq=brightness='if(mod(n,2),0.9,-0.9)':eval=frame", '-pix_fmt', 'yuv420p'], 'flicker.mp4');
// AUDIO calibration clips
gen(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 'silentA.mp4');
// clipping must be synthesized with PCM (AAC soft-limits peaks). .mov carries pcm_s16le; sine*volume saturates to 0 dBFS.
gen(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25:d=1', '-f', 'lavfi', '-i', 'sine=frequency=300:d=1', '-map', '0:v', '-map', '1:a', '-af', 'volume=20', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'pcm_s16le', '-shortest'], 'clipA.mov');
// SEQUENCE/raccord calibration clips: matched grays, and strong exposure/hue jumps
gen(['-f', 'lavfi', '-i', 'color=c=gray:s=320x240:r=25:d=1', '-pix_fmt', 'yuv420p'], 'gray2.mp4');
gen(['-f', 'lavfi', '-i', 'color=c=red:s=320x240:r=25:d=1', '-pix_fmt', 'yuv420p'], 'red.mp4');
gen(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=25:d=1', '-pix_fmt', 'yuv420p'], 'blue.mp4');
// AUDIO-CONTINUITY clips (4s): a loud->quiet jump at t=2, and a steady level
gen(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25:d=4', '-f', 'lavfi', '-i', 'sine=frequency=300:d=4', '-map', '0:v', '-map', '1:a', '-af', "volume=volume='if(lt(t,2),4,0.05)':eval=frame", '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 'jumpaudio.mp4');
gen(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25:d=4', '-f', 'lavfi', '-i', 'sine=frequency=300:d=4', '-map', '0:v', '-map', '1:a', '-af', 'volume=1.0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 'steadyaudio.mp4');

let pass = 0, fail = 0; const fails = [];
const has = (r, dim, crit, sevSet) => r.findings.some(f => f.dimension === dim && f.criterion === crit && sevSet.includes(f.severity));
const hasSev = (r, sevSet) => r.findings.some(f => sevSet.includes(f.severity));
const ok = (name, cond) => { if (cond) pass++; else { fail++; fails.push(name); } };

const black = analyze(join(CAL, 'black.mp4'));
const white = analyze(join(CAL, 'white.mp4'));
const gray = analyze(join(CAL, 'gray.mp4'));
const clean = analyze(join(CAL, 'clean.mp4'));
const flicker = analyze(join(CAL, 'flicker.mp4'));
const silentA = analyze(join(CAL, 'silentA.mp4'));
const clipA = analyze(join(CAL, 'clipA.mov'));

// SEQUENCE / raccord detection
const P = (n) => join(CAL, n);
const hasRac = (seq, sevSet) => seq.raccords.some(r => sevSet.includes(r.severity));
const racMatch = analyzeSequence([P('gray.mp4'), P('gray2.mp4')]);
const racExp = analyzeSequence([P('black.mp4'), P('white.mp4')]);
const racHue = analyzeSequence([P('red.mp4'), P('blue.mp4')]);
const racMono = analyzeSequence([P('gray.mp4'), P('gray2.mp4'), P('black.mp4')]); // 3 uniform-length shots
ok('raccord: matched grays judged OK', !hasRac(racMatch, ['MINOR', 'MAJOR']));
ok('raccord: huge exposure jump flagged', hasRac(racExp, ['MINOR', 'MAJOR']));
ok('raccord: strong hue jump flagged', hasRac(racHue, ['MINOR', 'MAJOR']));
ok('montage: monotone rhythm flagged', racMono.montageFindings.some(f => f.criterion === 'rhythm_variety'));
ok('sequence: raccord findings are structured', racExp.raccords.every(r => ['dimension', 'criterion', 'severity', 'confidence', 'evidence'].every(k => k in r)));

// AUDIO detection
ok('silent-audio flagged MAJOR', has(silentA, 'AUDIO', 'audio_content', ['MAJOR']));
ok('clipping flagged MAJOR', has(clipA, 'AUDIO', 'clipping', ['MAJOR']));
ok('no-audio-track flagged MAJOR', has(black, 'AUDIO', 'audio_presence', ['MAJOR']));
ok('clean audio judged OK', has(clean, 'AUDIO', 'audio_content', ['OK']));

// AUDIO-CONTINUITY detection
const acJump = analyzeAudioContinuity(join(CAL, 'jumpaudio.mp4'), 1);
const acSteady = analyzeAudioContinuity(join(CAL, 'steadyaudio.mp4'), 1);
ok('audio-continuity: loudness jump flagged', ['MINOR', 'MAJOR'].includes(acJump.severity));
ok('audio-continuity: steady level judged OK', acSteady.severity === 'OK');

// DETECTION (true positives)
ok('black: under-exposure OR black-frames flagged MAJOR', has(black, 'PHOTOGRAPHY', 'exposure', ['MAJOR']) || has(black, 'TECHNICAL', 'black_frames', ['MAJOR']));
ok('white: over-exposure flagged MAJOR', has(white, 'PHOTOGRAPHY', 'exposure', ['MAJOR']));
ok('gray: low dynamic range flagged MINOR', has(gray, 'PHOTOGRAPHY', 'dynamic_range', ['MINOR']));
ok('flicker: luma_flicker OR instability flagged', has(flicker, 'TEMPORAL', 'luma_flicker', ['MINOR', 'MAJOR']) || has(flicker, 'TEMPORAL', 'within_shot_instability', ['MINOR', 'MAJOR']));
ok('flicker: temporal_pop flagged (abrupt jump)', has(flicker, 'TEMPORAL', 'temporal_pop', ['MINOR', 'MAJOR']));

// FALSE-REJECT control: the clean colorful clip must NOT raise MAJOR/BLOCKER
ok('clean: no false MAJOR/BLOCKER (false-reject guard)', !hasSev(clean, ['MAJOR', 'BLOCKER']));
ok('clean: exposure judged OK', has(clean, 'PHOTOGRAPHY', 'exposure', ['OK']));

// coverage: engine emits structured findings with all required keys
const keysOk = black.findings.every(f => ['dimension', 'criterion', 'metric', 'threshold', 'severity', 'confidence', 'justification'].every(k => k in f));
ok('structured-output schema complete', keysOk);
ok('artistic verdict NOT emitted', black.artisticVerdict.startsWith('NOT_EMITTED'));

const detection = [
  ['black', has(black, 'PHOTOGRAPHY', 'exposure', ['MAJOR']) || has(black, 'TECHNICAL', 'black_frames', ['MAJOR'])],
  ['white', has(white, 'PHOTOGRAPHY', 'exposure', ['MAJOR'])],
  ['gray-flat', has(gray, 'PHOTOGRAPHY', 'dynamic_range', ['MINOR'])],
  ['flicker', has(flicker, 'TEMPORAL', 'luma_flicker', ['MINOR', 'MAJOR']) || has(flicker, 'TEMPORAL', 'within_shot_instability', ['MINOR', 'MAJOR'])],
];
const tp = detection.filter(d => d[1]).length;
console.log('CIQE CALIBRATION:');
console.log(`  detection on known defects: ${tp}/${detection.length} (${detection.map(d => d[0] + '=' + (d[1] ? 'HIT' : 'MISS')).join(', ')})`);
console.log(`  false-reject on clean clip: ${hasSev(clean, ['MAJOR', 'BLOCKER']) ? 'FAILED (false MAJOR)' : 'none'}`);
console.log(`\nCIQE TESTS: ${fail === 0 ? 'PASS' : 'FAIL'} (pass=${pass} fail=${fail})` + (fail ? ` [${fails.join(', ')}]` : ''));
rmSync(CAL, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
