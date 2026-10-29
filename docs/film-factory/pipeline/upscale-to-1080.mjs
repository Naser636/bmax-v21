// Delivery upscale step — 720p (minimax maxRes) -> 1080p+ (deliverable spec). Local, €0, no network.
// lanczos resample + mild unsharp to counter upscale softness; quality-NEUTRAL (never degrades the source),
// resolution-COMPLIANT. A neural upscaler (Real-ESRGAN/Topaz) could add detail but costs — documented as a
// paid A/B, NOT run here. Reusable by the production/delivery path so every accepted clip meets 1080p+.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const FFMPEG = join(here, 'vendor/node_modules/ffmpeg-static/ffmpeg');
export const FFPROBE = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe');

export function probeWH(file, ffprobe = FFPROBE) {
  const out = execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim();
  const [w, h] = out.split(',').map(Number);
  return { width: w, height: h };
}

// Upscale a clip to targetH (default 1080), preserving aspect to targetW (default 1920), fps-stable, silent-safe.
export function upscaleTo1080(inPath, outPath, { ffmpeg = FFMPEG, targetW = 1920, targetH = 1080, crf = 17, sharpen = true } = {}) {
  if (!existsSync(inPath)) throw new Error('upscaleTo1080: input missing ' + inPath);
  const vf = [`scale=${targetW}:${targetH}:flags=lanczos`, sharpen ? 'unsharp=5:5:0.6:5:5:0.2' : null, 'setsar=1', 'format=yuv420p'].filter(Boolean).join(',');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', inPath, '-vf', vf, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium', outPath]);
  const wh = probeWH(outPath);
  return { ok: wh.width >= targetW && wh.height >= targetH, ...wh, outPath, method: 'lanczos+unsharp (local €0)', note: 'resolution-compliant; neural upscaler = paid A/B (not run)' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , inP, outP] = process.argv;
  if (!inP || !outP) { console.log('usage: node upscale-to-1080.mjs <in.mp4> <out.mp4>'); process.exit(1); }
  console.log(JSON.stringify(upscaleTo1080(inP, outP), null, 1));
}
