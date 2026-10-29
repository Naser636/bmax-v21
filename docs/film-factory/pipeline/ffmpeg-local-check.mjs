// VERIFIED (not fixture) capability test: the local ffmpeg/ffprobe actually generate + measure a real file.
// Generates a synthetic clip in scratch (NOT project media, NOT film media), measures it, asserts correctness,
// then deletes it. Proves the export-gate's measurement path works on real files. €0, local, no network.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolveBinaries, measureDurationSec, probeIntegrity, ffmpegAvailable } from './ffmpeg-local.mjs';
let pass = 0, fail = 0; const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

const bin = resolveBinaries();
ok('ffmpeg + ffprobe binaries resolved', bin.available && bin.ffmpeg && bin.ffprobe);
ok('ffmpegAvailable() true', ffmpegAvailable() === true);

const tmp = process.env.TMPDIR ? `${process.env.TMPDIR}/ffcheck-${process.pid}.mp4` : `/home/ubuntu/.cache/odg-tmp/claude-1000/-home-ubuntu-bmax-v21/298bfb79-bffe-499c-b16d-347aa00ad225/scratchpad/ffcheck-${process.pid}.mp4`;
let made = false;
try { execFileSync(bin.ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=160x120:rate=25', '-pix_fmt', 'yuv420p', tmp], { stdio: 'ignore' }); made = existsSync(tmp); } catch {}
ok('ffmpeg generated a real test clip', made);

const d = measureDurationSec(tmp);
ok('ffprobe measured ~2.0s (real measurement)', d !== null && Math.abs(d - 2.0) < 0.2);
ok('integrity probe ok on the real file', probeIntegrity(tmp).ok === true);

// negative: no fabrication on a missing file
ok('measureDurationSec(null) = null (no fabrication)', measureDurationSec(null) === null);
ok('measureDurationSec(missing) = null', measureDurationSec('/no/such/file.mp4') === null);
ok('probeIntegrity(missing) not ok', probeIntegrity('/no/such/file.mp4').ok === false);

if (made) rmSync(tmp, { force: true });
console.log(`ffmpeg-local-check: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : '') + '  [REAL capability test — NOT film media]');
if (fail) process.exit(1);
