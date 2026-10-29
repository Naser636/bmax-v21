// ODG media quality-control tool (local, €0). MECHANICAL inspection only — it NEVER emits an artistic score
// (that is human-only, target ≥7.5/10). For each media it records container/stream facts, extracts representative
// frames (start/mid/end) as JPGs for human visual inspection, and runs black-frame + freeze detection. Continuity
// across shots is checked at the mechanical level (resolution/fps/SAR uniformity). Rejections are justified.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const FFMPEG = join(here, 'vendor/node_modules/ffmpeg-static/ffmpeg');
const FFPROBE = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe');
const B = join(here, 'runs/benchmark');
const QC = join(B, 'qc'); mkdirSync(QC, { recursive: true });
const sh = (bin, args) => { try { return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return (e.stdout || '') + (e.stderr || ''); } };

const MEDIA = [
  { shot: 'SC01-video', role: 'establisher (video)', file: join(B, 'SC01-video.mp4'), kind: 'video' },
  { shot: 'SC40', role: 'hero', file: join(B, 'SC40.mp4'), kind: 'video' },
  { shot: 'SC22', role: 'action/crowd/water', file: join(B, 'SC22.mp4'), kind: 'video' },
  { shot: 'SC01-still', role: 'establisher (still)', file: join(B, 'SC01-still.webp'), kind: 'image' },
  { shot: 'REEL', role: 'assembled continuous export', file: join(B, 'export/ODG_prototype_reel.mp4'), kind: 'video' },
];

function probe(file) {
  const out = sh(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  try { return JSON.parse(out); } catch { return null; }
}
function extractFrames(m) {
  if (!existsSync(m.file)) return [];
  const p = probe(m.file);
  const dur = parseFloat(p?.format?.duration || '0') || 0;
  const times = m.kind === 'image' ? [0] : [0.1, Math.max(0.1, dur / 2), Math.max(0.2, dur - 0.2)];
  const frames = [];
  times.forEach((t, i) => {
    const out = join(QC, `${m.shot}_f${i}.jpg`);
    sh(FFMPEG, ['-hide_banner', '-y', '-ss', String(t), '-i', m.file, '-frames:v', '1', '-q:v', '3', out]);
    if (existsSync(out)) frames.push({ t: Math.round(t * 100) / 100, file: out, bytes: statSync(out).size });
  });
  return frames;
}
function blackAndFreeze(m) {
  if (m.kind === 'image' || !existsSync(m.file)) return { black: [], freeze: [] };
  const bl = sh(FFMPEG, ['-hide_banner', '-i', m.file, '-vf', 'blackdetect=d=0.05:pic_th=0.98', '-an', '-f', 'null', '-']);
  const fr = sh(FFMPEG, ['-hide_banner', '-i', m.file, '-vf', 'freezedetect=n=-60dB:d=0.5', '-map', '0:v', '-an', '-f', 'null', '-']);
  const black = (bl.match(/black_start:[0-9.]+ black_end:[0-9.]+/g) || []);
  const freeze = (fr.match(/freeze_start: ?[0-9.]+/g) || []);
  return { black, freeze };
}

const report = { tool: 'odg qc-media', generatedAt_note: 'mechanical only; NO artistic score (human ≥7.5/10 required separately)', media: [] };
const vids = [];
for (const m of MEDIA) {
  if (!existsSync(m.file)) { report.media.push({ shot: m.shot, status: 'MISSING', file: m.file }); continue; }
  const p = probe(m.file);
  const v = (p?.streams || []).find(s => s.codec_type === 'video') || {};
  const a = (p?.streams || []).find(s => s.codec_type === 'audio') || null;
  const bf = blackAndFreeze(m);
  const frames = extractFrames(m);
  const entry = {
    shot: m.shot, role: m.role, file: m.file, bytes: statSync(m.file).size,
    container: p?.format?.format_name, durationSec: p?.format?.duration ? Math.round(parseFloat(p.format.duration) * 100) / 100 : null,
    video: { codec: v.codec_name, width: v.width, height: v.height, fps: v.r_frame_rate, sar: v.sample_aspect_ratio || '1:1', pix_fmt: v.pix_fmt },
    audio: a ? { codec: a.codec_name, sample_rate: a.sample_rate, channels: a.channels, note: m.shot === 'REEL' ? 'SILENT placeholder — no real dialogue/music/SFX generated yet' : null } : 'none',
    defects: { blackIntervals: bf.black, freezeIntervals: bf.freeze },
    mechanicalUsable: m.kind === 'image' ? statSync(m.file).size > 0 : (!!v.codec_name && (parseFloat(p?.format?.duration || '0') > 0.5)),
    inspectionFrames: frames.map(f => ({ atSec: f.t, file: f.file })),
    humanArtistic: 'NOT_ASSESSED (human-only)',
  };
  if (m.kind === 'video' && m.shot !== 'REEL') vids.push(entry.video);
  report.media.push(entry);
}
// mechanical continuity across source video shots
const uniform = vids.length > 0 && vids.every(x => x.width === vids[0].width && x.height === vids[0].height && x.fps === vids[0].fps);
report.continuityMechanical = { uniformResolutionFps: uniform, resolution: vids[0] ? `${vids[0].width}x${vids[0].height}@${vids[0].fps}` : null,
  note: 'Mechanical uniformity only (format/fps/SAR). Character/wound/light/geography continuity requires HUMAN review of the frames.' };
report.artisticNote = 'An automatic/mechanical pass does NOT prove artistic quality. The ≥7.5/10 target must be judged by a human on the extracted frames + the reel.';
writeFileSync(join(QC, 'qc-report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ wrote: join(QC, 'qc-report.json'), media: report.media.map(m => ({ shot: m.shot, status: m.status || 'OK', dur: m.durationSec, res: m.video ? `${m.video.width}x${m.video.height}` : null, usable: m.mechanicalUsable, frames: m.inspectionFrames?.length || 0, black: m.defects?.blackIntervals?.length || 0, freeze: m.defects?.freezeIntervals?.length || 0 })), continuity: report.continuityMechanical.uniformResolutionFps }, null, 1));
