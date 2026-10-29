// upscale-to-1080 test — generates a tiny 720p clip locally and asserts the upscale produces 1080p. €0, no network.
import { upscaleTo1080, probeWH, FFMPEG } from './upscale-to-1080.mjs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync, existsSync } from 'node:fs';

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

const dir = join(tmpdir(), `odg-upscale-${process.pid}`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const src = join(dir, 'src720.mp4'); const out = join(dir, 'out1080.mp4');
// make a 2s 1280x720 test clip (testsrc)
execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24:duration=2', '-c:v', 'libx264', '-crf', '20', src]);

ok('source is 720p', probeWH(src).height === 720 && probeWH(src).width === 1280);
const r = upscaleTo1080(src, out);
ok('upscale produced a file', existsSync(out));
ok('output is 1920x1080', r.width === 1920 && r.height === 1080 && r.ok === true);
ok('output decodes clean', (() => { try { execFileSync(FFMPEG, ['-v', 'error', '-i', out, '-f', 'null', '-']); return true; } catch { return false; } })());
ok('method documented as local lanczos (neural = paid A/B)', /lanczos/.test(r.method) && /paid A\/B/.test(r.note));

console.log(`\nUPSCALE-TO-1080 TESTS: ${fail === 0 ? 'PASS' : 'FAIL'} (pass=${pass} fail=${fail})` + (fail ? ` [${fails.join(', ')}]` : ''));
process.exit(fail === 0 ? 0 : 1);
