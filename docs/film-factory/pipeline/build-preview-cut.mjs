// Build ONE chronological PREVIEW/REVIEW cut SC01->SC49 from ALL available assets. €0, local FFmpeg only,
// no network/paid call. Real footage (normalised to 1080p) for scenes that have clips; a clearly-labeled
// TEMPORARY "PLAN MANQUANT" card for scenes with no asset. A discreet review scene-tag is overlaid on footage
// (this PREVIEW file only — SOURCES are preserved, never overwritten). Silent (clips are silent) — flagged.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderCardPPM, renderTagPPM } from './preview-text.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');
const OUT = join(here, 'runs', 'production-t1');
const SEG = join(OUT, 'preview-segments');
const FF = join(here, 'vendor/node_modules/ffmpeg-static/ffmpeg');
const FP = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe');
const timeline = JSON.parse(readFileSync(join(canon, 'f11-film-timeline.json'), 'utf8'));

rmSync(SEG, { recursive: true, force: true }); mkdirSync(SEG, { recursive: true });
const ff = (args) => execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
const dur = (f) => parseFloat(execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f]).toString().trim());
const clean = (s) => String(s).toUpperCase().replace(/[^A-Z0-9 \-]/g, '').slice(0, 22);

const T2 = join(OUT, '..', 'production-t2');
const ASSET_FILE = {
  SC01: [join(OUT, 'sc01-opening-assembly-v4-1080.mp4')],
  SC02: [join(T2, 'SC02-bjorn-deadpan.mp4')],
  SC04: [join(OUT, 'A4b-march-lead.mp4'), join(T2, 'SC04-olaf-names.mp4'), join(T2, 'SC04-bjorn-weight.mp4')],
  SC05: [join(T2, 'SC05-meryt-patrol.mp4'), join(T2, 'SC05-bjorn-wary.mp4')],
  SC06: [join(OUT, 'R1-rescue-crewman.mp4'), join(T2, 'SC06-astrid-call.mp4')],
  SC07: [join(T2, 'SC07-bjorn-rage-held.mp4')],
  SC08: [join(T2, 'SC08-bjorn-witness.mp4')],
  SC13: [join(T2, 'SC13-bjorn-caged.mp4')],
  SC14: [join(T2, 'SC14-olaf-charge.mp4')],
  SC17: [join(T2, 'SC17-bjorn-read.mp4')],
  SC21: [join(T2, 'SC21-bjorn-market.mp4')],
  SC38: [join(T2, 'SC38-bjorn-greatsword.mp4')],
  SC43: [join(T2, 'SC43-olaf-benediction.mp4')],
};

const V = 'libx264', CRF = '20';
const segList = []; const manifest = []; let idx = 0;
for (const s of timeline.scenes) {
  const files = ASSET_FILE[s.scene] || [];
  if (files.length) {
    const tag = renderTagPPM(join(SEG, `tag${idx}.ppm`), `${s.scene} ${clean(s.content)} REVIEW`, { scale: 4 });
    for (const src of files) {
      if (!existsSync(src)) { manifest.push({ scene: s.scene, type: 'MISSING_FILE', src }); continue; }
      const seg = join(SEG, `seg${String(idx++).padStart(3, '0')}.mp4`);
      ff(['-v', 'error', '-y', '-i', src, '-i', tag.path,
        '-filter_complex', `[0:v]scale=1920:1080:flags=lanczos,fps=24,setsar=1,format=yuv420p[v];[v][1:v]overlay=36:34[o]`,
        '-map', '[o]', '-an', '-c:v', V, '-crf', CRF, '-preset', 'veryfast', '-r', '24', seg]);
      segList.push(seg); manifest.push({ scene: s.scene, type: 'FOOTAGE', src: src.replace(OUT + '/', ''), sec: +dur(seg).toFixed(2), status: 'HUMAN_REVIEW_PENDING' });
    }
  } else {
    const card = renderCardPPM(join(SEG, `card${idx}.ppm`), {
      bg: [10, 15, 20], lines: [
        { text: s.scene, scale: 18, color: [207, 216, 220], dy: -150 },
        { text: clean(s.content) + ' - PLAN MANQUANT', scale: 6, color: [154, 167, 173], dy: 30 },
        { text: 'TEMPORAIRE - A GENERER', scale: 5, color: [107, 118, 123], dy: 110 },
      ],
    });
    const seg = join(SEG, `seg${String(idx++).padStart(3, '0')}.mp4`);
    ff(['-v', 'error', '-y', '-loop', '1', '-i', card, '-t', '2.5', '-vf', 'fps=24,setsar=1,format=yuv420p', '-c:v', V, '-crf', '22', '-preset', 'veryfast', seg]);
    segList.push(seg); manifest.push({ scene: s.scene, type: 'PLACEHOLDER', sec: 2.5, status: 'MISSING' });
  }
}

const listFile = join(SEG, 'concat.txt');
writeFileSync(listFile, segList.map(f => `file '${f}'`).join('\n'));
const preview = join(OUT, 'F11-PREVIEW-REVIEW-CUT-v4.mp4');
try { ff(['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', preview]); }
catch { ff(['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', V, '-crf', CRF, '-preset', 'veryfast', preview]); }

const total = +dur(preview).toFixed(2);
const wh = execFileSync(FP, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', preview]).toString().trim();
let decodeClean = true; try { execFileSync(FF, ['-v', 'error', '-i', preview, '-f', 'null', '-']); } catch { decodeClean = false; }
const hasAudio = execFileSync(FP, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', preview]).toString().trim().length > 0;
const footageScenes = [...new Set(manifest.filter(m => m.type === 'FOOTAGE').map(m => m.scene))];
const placeholderScenes = manifest.filter(m => m.type === 'PLACEHOLDER').map(m => m.scene);
const bytes = execFileSync('stat', ['-c', '%s', preview]).toString().trim();
const report = {
  generated: '2026-10-25', file: 'docs/film-factory/pipeline/runs/production-t1/F11-PREVIEW-REVIEW-CUT-v4.mp4', absPath: preview, bytes: +bytes,
  durationSec: total, resolution: wh, fps24: /24\/1/.test(wh), decodeClean, hasAudio,
  silentNote: hasAudio ? 'audio present' : 'SILENT preview (clips are silent; final licensed audio is a separate step)',
  scenesTotal: timeline.scenes.length, footageScenes, footageSegments: manifest.filter(m => m.type === 'FOOTAGE').length, placeholderScenes: placeholderScenes.length,
  allScenesRepresented: (footageScenes.length + placeholderScenes.length) >= timeline.scenes.length,
  manifest, isFinalFilm: false,
  note: 'PREVIEW/REVIEW cut from AVAILABLE assets only. NOT the final film. Sources preserved; review tag + placeholders are TEMPORARY. 45 scenes are placeholders.',
};
writeFileSync(join(OUT, 'F11-PREVIEW-REVIEW-CUT-v4.report.json'), JSON.stringify(report, null, 1));
rmSync(SEG, { recursive: true, force: true });
console.log(`PREVIEW: ${report.file}`);
console.log(`  ${total}s | ${wh} | ${(+bytes / 1e6).toFixed(1)}MB | decode ${decodeClean ? 'CLEAN' : 'FAIL'} | audio ${hasAudio ? 'yes' : 'SILENT (flagged)'}`);
console.log(`  scenes ${timeline.scenes.length} | footage [${footageScenes.join(',')}] = ${report.footageSegments} segs | placeholders ${placeholderScenes.length} | all represented ${report.allScenesRepresented}`);
