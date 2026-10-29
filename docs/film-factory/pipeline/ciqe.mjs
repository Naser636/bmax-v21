// Cinematic Intelligence & Quality Engine — v0 (LOCAL, €0, no network/credit). The DETERMINISTIC + SIGNAL layer
// of the quality engine. It reuses the vendored ffmpeg/ffprobe to measure photographic and temporal signals and
// emits STRUCTURED findings: {dimension, criterion, metric, threshold, severity, confidence, evidence,
// justification, recommendedCorrection}. It applies PER-CATEGORY thresholds (never a single hidden average) and
// NEVER emits an artistic verdict — the ≥7.5/10 judgment is human-only. It is explicit about what it does NOT
// cover (anatomy/identity/period/performance) — those need a vision-model evaluator (costed, not built here).
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const FFMPEG = join(here, 'vendor/node_modules/ffmpeg-static/ffmpeg');
const FFPROBE = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe');
// capture BOTH stdout and stderr — ffmpeg's signalstats/metadata/blackframe/scene logs go to stderr.
const run = (bin, args) => { const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }); return (r.stdout || '') + (r.stderr || ''); };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const std = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

// NOT covered by this deterministic layer — honest limits (require a vision model or human).
export const NOT_COVERED = ['anatomy/texture/geometry artifacts', 'face/character identity vs canon refs',
  'period / art-direction continuity', 'emotional performance & gaze', 'semantic narrative function', 'audio dialogue correctness/sync'];

function probe(file) { try { return JSON.parse(run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])); } catch { return null; } }

// Parse per-frame signalstats (luma): YAVG (exposure), YMIN/YMAX (dynamic range).
function signalSeries(file) {
  const out = run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-vf', 'signalstats,metadata=print', '-an', '-f', 'null', '-']);
  const yavg = [], ymin = [], ymax = [];
  for (const l of out.split('\n')) {
    let m;
    if ((m = l.match(/lavfi\.signalstats\.YAVG=([\d.]+)/))) yavg.push(parseFloat(m[1]));
    else if ((m = l.match(/lavfi\.signalstats\.YMIN=([\d.]+)/))) ymin.push(parseFloat(m[1]));
    else if ((m = l.match(/lavfi\.signalstats\.YMAX=([\d.]+)/))) ymax.push(parseFloat(m[1]));
  }
  return { yavg, ymin, ymax };
}
function sceneChanges(file) {
  const out = run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-vf', "select='gt(scene,0.4)',metadata=print", '-an', '-f', 'null', '-']);
  return (out.match(/pts_time:/g) || []).length;
}
function blackFrames(file) {
  const out = run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-vf', 'blackframe=amount=98:threshold=32', '-an', '-f', 'null', '-']);
  return (out.match(/Parsed_blackframe.*frame:/g) || out.match(/blackframe/gi) || []).filter(x => /frame:/.test(x)).length;
}

function finding(dimension, criterion, metric, threshold, severity, confidence, evidence, justification, correction) {
  return { dimension, criterion, metric, threshold, severity, confidence, evidence, justification, recommendedCorrection: correction };
}

// AUDIO dimension — objective loudness/levels only (NOT musicality/emotion/dialogue-correctness, which are human/
// multimodal). Uses ffmpeg volumedetect. Detects: no track, silence, clipping, and too-quiet mixes.
export function audioFindings(file, aStream) {
  if (!aStream) return [finding('AUDIO', 'audio_presence', false, 'audio stream present', 'MAJOR', 0.9,
    { audio: 'none' }, 'video has NO audio track (not an audiovisually complete film)', 'add dialogue/ambience/music/SFX soundtrack')];
  const out = run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']);
  const mean = (out.match(/mean_volume:\s*(-?[\d.]+) dB/) || [])[1];
  const max = (out.match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1];
  const meanDb = mean != null ? parseFloat(mean) : null;
  const maxDb = max != null ? parseFloat(max) : null;
  const f = [];
  // silence / near-silence (e.g. the v1 reel's placeholder silent track)
  const silent = meanDb == null || meanDb <= -70;
  f.push(finding('AUDIO', 'audio_content', silent ? 'silent' : 'present', 'mean_volume > -70 dB',
    silent ? 'MAJOR' : 'OK', 0.85, { meanVolumeDb: meanDb, maxVolumeDb: maxDb },
    silent ? 'audio track is SILENT / near-silent — no real sound content' : 'audio track carries real signal (content quality not judged here)',
    silent ? 'add real ambience/music/SFX/dialogue' : null));
  if (!silent) {
    const clipping = maxDb != null && maxDb >= -0.1;
    f.push(finding('AUDIO', 'clipping', maxDb, 'max_volume <= -0.1 dB', clipping ? 'MAJOR' : 'OK', 0.8,
      { maxVolumeDb: maxDb }, clipping ? 'peaks at/over 0 dBFS — clipping/distortion risk' : 'headroom OK',
      clipping ? 'reduce gain / apply limiter (loudnorm with TP<=-1)' : null));
    const quiet = meanDb != null && meanDb < -35;
    f.push(finding('AUDIO', 'level', meanDb, 'mean_volume within -30..-14 dB', quiet ? 'MINOR' : 'OK', 0.6,
      { meanVolumeDb: meanDb }, quiet ? 'overall mix is quiet — dialogue may be hard to hear' : 'overall level in a reasonable band',
      quiet ? 'raise level / loudnorm to ~-16 LUFS' : null));
  }
  return f;
}

// Boundary-frame look signature (exposure/saturation/hue) at the first or last frame of a shot — used for raccords.
export function boundaryStats(file, side = 'first') {
  const args = side === 'last'
    ? ['-hide_banner', '-nostats', '-sseof', '-0.3', '-i', file, '-vf', 'signalstats,metadata=print', '-an', '-f', 'null', '-']
    : ['-hide_banner', '-nostats', '-i', file, '-vf', 'select=eq(n\\,0),signalstats,metadata=print', '-frames:v', '1', '-an', '-f', 'null', '-'];
  const out = run(FFMPEG, args);
  const pick = (k) => { const m = [...out.matchAll(new RegExp('lavfi\\.signalstats\\.' + k + '=([\\-\\d.]+)', 'g'))]; return m.length ? parseFloat(m[side === 'last' ? m.length - 1 : 0][1]) : null; };
  return { y: pick('YAVG'), sat: pick('SATAVG'), hue: pick('HUEAVG') };
}
const hueDist = (a, b) => { if (a == null || b == null) return null; let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// AUDIO CONTINUITY — windowed loudness across the timeline; flags abrupt level jumps between sections (a missing
// ambience bed, a hard music cut, a dropped track). Objective only (not musicality). Returns a structured finding.
export function analyzeAudioContinuity(file, winSec = 2) {
  const p = probe(file); const dur = parseFloat(p?.format?.duration || '0') || 0;
  const hasAudio = (p?.streams || []).some(s => s.codec_type === 'audio');
  if (!hasAudio || dur < winSec * 2) return finding('AUDIO', 'audio_continuity', null, 'window loudness jumps <= 12 dB', 'INFO', 0.4, { reason: hasAudio ? 'too short' : 'no audio' }, 'not assessed', null);
  const windows = [];
  for (let t = 0; t + 0.5 < dur; t += winSec) {
    const out = run(FFMPEG, ['-hide_banner', '-nostats', '-ss', String(t), '-t', String(winSec), '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']);
    const m = (out.match(/mean_volume:\s*(-?[\d.]+) dB/) || [])[1];
    windows.push({ t: Math.round(t * 10) / 10, meanDb: m != null ? parseFloat(m) : null });
  }
  const vals = windows.map(w => w.meanDb).filter(v => v != null && v > -90); // ignore true-silence windows
  let maxJump = 0, at = null;
  for (let i = 1; i < vals.length; i++) { const d = Math.abs(vals[i] - vals[i - 1]); if (d > maxJump) { maxJump = d; at = windows[i].t; } }
  const sev = maxJump > 18 ? 'MAJOR' : maxJump > 12 ? 'MINOR' : 'OK';
  return finding('AUDIO', 'audio_continuity', Math.round(maxJump * 10) / 10, 'adjacent-window |Δloudness| <= 12 dB',
    sev, 0.5, { maxJumpDb: Math.round(maxJump * 10) / 10, atSec: at, windows: windows.length },
    sev === 'OK' ? 'loudness is continuous across sections' : 'abrupt loudness jump between sections (possible dropped bed / hard cut)',
    sev === 'OK' ? null : 'add a continuous ambience bed or crossfade audio across the cut');
}

// SEQUENCE analysis — inter-shot raccord continuity (exposure/saturation/hue jumps at the cut boundary) + montage
// (shot count, durations, variety). A cut MAY legitimately change the look; findings are CANDIDATES for human review.
export function analyzeSequence(files) {
  const shots = files.map(f => {
    const p = probe(f); const dur = parseFloat(p?.format?.duration || '0') || 0;
    return { file: f.split('/').slice(-1)[0], durationSec: Math.round(dur * 100) / 100, exists: existsSync(f),
      first: existsSync(f) ? boundaryStats(f, 'first') : null, last: existsSync(f) ? boundaryStats(f, 'last') : null };
  });
  const raccords = [];
  for (let i = 0; i < shots.length - 1; i++) {
    const A = shots[i].last, B = shots[i + 1].first;
    if (!A || !B || A.y == null || B.y == null) continue;
    const dY = Math.abs(A.y - B.y), dSat = Math.abs((A.sat ?? 0) - (B.sat ?? 0)), dHue = hueDist(A.hue, B.hue);
    const sev = (dY > 70 || (dHue != null && dHue > 70)) ? 'MAJOR' : (dY > 40 || (dHue != null && dHue > 35) || dSat > 40) ? 'MINOR' : 'OK';
    raccords.push(finding('CONTINUITY', 'raccord', { from: shots[i].file, to: shots[i + 1].file },
      'cut-boundary |ΔY|<=40, Δhue<=35°, Δsat<=40', sev, 0.5,
      { dExposure: Math.round(dY * 10) / 10, dSaturation: Math.round(dSat * 10) / 10, dHueDeg: dHue == null ? null : Math.round(dHue * 10) / 10 },
      sev === 'OK' ? 'exposure/palette match across the cut' : 'candidate raccord discontinuity (exposure/palette jump) — a cut MAY intend this; confirm by eye',
      sev === 'OK' ? null : 'grade-match adjacent shots, or reorder/replace; if intentional, mark as an accepted exception'));
  }
  // montage metrics
  const durs = shots.filter(s => s.exists && s.durationSec > 0.2).map(s => s.durationSec);
  const montage = { shotCount: durs.length, durations: durs, minSec: Math.min(...durs), maxSec: Math.max(...durs),
    meanSec: durs.length ? Math.round(mean(durs) * 100) / 100 : 0, varietyStd: Math.round(std(durs) * 100) / 100 };
  const mFind = [];
  for (const s of shots) if (s.exists && s.durationSec > 0.2 && s.durationSec < 1.5)
    mFind.push(finding('MONTAGE', 'shot_duration', s.durationSec, '>=1.5s', 'MINOR', 0.5, { shot: s.file }, 'very short shot — may read as a flash', 'extend or justify as a rhythmic beat'));
  if (montage.shotCount >= 3 && montage.varietyStd < 0.3)
    mFind.push(finding('MONTAGE', 'rhythm_variety', montage.varietyStd, 'duration stddev > 0.3s', 'INFO', 0.4, montage, 'shots are near-uniform length — monotone rhythm risk', 'vary shot lengths for pacing'));
  return { shots, raccords, montage, montageFindings: mFind,
    note: 'CONTINUITY/MONTAGE are boundary-signal estimates, NOT semantic continuity (identity/period/geography need a multimodal model or human).' };
}

// SEMANTIC evaluation STUB (§7) — interface for the layers a deterministic engine CANNOT judge (identity, period,
// performance, narrative fidelity). It performs NO real evaluation: it returns STUB verdicts routing each layer to
// a multimodal model (not installed) or human review. Clearly marked STUB — never counts as a quality result.
export function semanticStub(file) {
  const layers = ['character_identity_vs_refs', 'period_authenticity', 'emotional_performance', 'narrative_fidelity_to_canon'];
  return {
    kind: 'STUB', evaluated: false, file,
    note: 'STUB — no semantic evaluation performed. Requires a multimodal vision model (not available in this env) or human review. Never a quality proof.',
    layers: layers.map(l => ({ layer: l, status: 'NOT_EVALUATED', requires: 'multimodal-model-or-human' })),
  };
}

export function analyze(file) {
  if (!existsSync(file)) return { file, status: 'MISSING', findings: [] };
  const p = probe(file);
  const v = (p?.streams || []).find(s => s.codec_type === 'video') || {};
  const a = (p?.streams || []).find(s => s.codec_type === 'audio') || null;
  const dur = parseFloat(p?.format?.duration || '0') || 0;
  const isImage = !dur || dur < 0.2;
  const findings = [];

  // PHOTOGRAPHY — exposure + dynamic range from luma signal
  const { yavg, ymin, ymax } = signalSeries(file);
  const exp = mean(yavg); const dyn = mean(ymax.map((x, i) => x - (ymin[i] ?? 0)));
  if (yavg.length) {
    const sev = exp < 28 ? 'MAJOR' : exp > 232 ? 'MAJOR' : 'OK';
    findings.push(finding('PHOTOGRAPHY', 'exposure', Math.round(exp * 10) / 10, 'luma mean 28..232',
      sev, sev === 'OK' ? 0.85 : 0.6, { yavgMean: Math.round(exp * 10) / 10, frames: yavg.length },
      sev === 'OK' ? 'mean luma within usable band' : (exp < 28 ? 'image is crushed/under-exposed' : 'image is blown/over-exposed'),
      sev === 'OK' ? null : 'adjust exposure prompt / regenerate or grade; NOTE: strong backlight can raise mean luma legitimately (verify by eye)'));
    const dsev = dyn < 55 ? 'MINOR' : 'OK';
    findings.push(finding('PHOTOGRAPHY', 'dynamic_range', Math.round(dyn), 'YMAX-YMIN mean >= 55',
      dsev, 0.6, { dynRangeMean: Math.round(dyn) }, dsev === 'OK' ? 'adequate tonal range' : 'flat/low-contrast (washed) tonal range',
      dsev === 'OK' ? null : 'add contrast in grade or regenerate with stronger key/fill ratio'));
  }

  // TEMPORAL — flicker (luma stddev across frames) + within-shot instability (scene cuts) + black frames
  if (!isImage) {
    const flick = std(yavg);
    const fsev = flick > 22 ? 'MINOR' : 'OK';
    findings.push(finding('TEMPORAL', 'luma_flicker', Math.round(flick * 10) / 10, 'stddev(YAVG) <= 22',
      fsev, 0.45, { yavgStd: Math.round(flick * 10) / 10 },
      fsev === 'OK' ? 'stable luma over time' : 'luma varies strongly frame-to-frame (flicker OR legitimate lighting change)',
      fsev === 'OK' ? null : 'confirm by eye; if flicker, regenerate or temporally denoise'));
    // multi-frame temporal "pop": the largest luma jump between consecutive frames. A big isolated jump (not a
    // smooth change) flags a content pop / instability that stddev-based flicker can miss.
    let maxPop = 0; for (let i = 1; i < yavg.length; i++) maxPop = Math.max(maxPop, Math.abs(yavg[i] - yavg[i - 1]));
    const psev = maxPop > 60 ? 'MINOR' : 'OK';
    findings.push(finding('TEMPORAL', 'temporal_pop', Math.round(maxPop * 10) / 10, 'max adjacent |ΔYAVG| <= 60',
      psev, 0.45, { maxAdjacentDelta: Math.round(maxPop * 10) / 10, frames: yavg.length },
      psev === 'OK' ? 'no abrupt single-frame luma jump' : 'abrupt frame-to-frame luma jump (possible pop/instability/cut)',
      psev === 'OK' ? null : 'inspect around the jump; if a content pop, regenerate'));
    const sc = sceneChanges(file);
    const ssev = sc > 2 ? 'MAJOR' : sc >= 1 ? 'MINOR' : 'OK';
    findings.push(finding('TEMPORAL', 'within_shot_instability', sc, 'scene-cuts within one continuous shot == 0',
      ssev, 0.55, { sceneCuts: sc, durationSec: Math.round(dur * 100) / 100 },
      ssev === 'OK' ? 'no hard content jumps inside the shot' : 'detected content jump(s) inside a single shot — possible identity/geometry instability',
      ssev === 'OK' ? null : 'inspect frames around cuts; regenerate with stronger subject reference / shorter duration'));
    const bf = blackFrames(file);
    findings.push(finding('TECHNICAL', 'black_frames', bf, '== 0', bf > 0 ? 'MAJOR' : 'OK', 0.9,
      { blackFrames: bf }, bf > 0 ? 'fully-black frame(s) present' : 'no black frames', bf > 0 ? 'trim/regenerate affected span' : null));
  }

  // TECHNICAL — container/stream + audio presence (silence is allowed but reported)
  findings.push(finding('TECHNICAL', 'stream_integrity', !!v.codec_name, 'decodable video stream', v.codec_name ? 'OK' : 'BLOCKER', 0.95,
    { video: v.codec_name ? `${v.codec_name} ${v.width}x${v.height}` : null, fps: v.r_frame_rate, durationSec: Math.round(dur * 100) / 100 },
    v.codec_name ? 'valid decodable stream' : 'no decodable video stream', v.codec_name ? null : 'regenerate/re-mux'));
  if (!isImage) findings.push(...audioFindings(file, a));

  const severities = findings.map(f => f.severity);
  const worst = ['BLOCKER', 'MAJOR', 'MINOR', 'INFO', 'OK'].find(s => severities.includes(s)) || 'OK';
  return { file, status: 'ANALYZED', durationSec: Math.round(dur * 100) / 100, isImage, worstSeverity: worst,
    findings, notCoveredByThisLayer: NOT_COVERED, artisticVerdict: 'NOT_EMITTED (human-only, target >=7.5/10)' };
}

// CLI: analyze given files (or the 4 prototype media by default)
if (import.meta.url === `file://${process.argv[1]}`) {
  const B = join(here, 'runs/benchmark');
  const files = process.argv.slice(2).length ? process.argv.slice(2)
    : ['SC40.mp4', 'SC22.mp4', 'SC01-video.mp4', 'SC01-still.webp', 'export/ODG_prototype_reel.mp4'].map(f => join(B, f));
  const out = files.map(analyze);
  for (const r of out) {
    console.log(`\n### ${r.file.split('/').slice(-1)[0]} — worst=${r.worstSeverity} dur=${r.durationSec ?? '—'}`);
    for (const f of (r.findings || [])) if (f.severity !== 'OK') console.log(`  [${f.severity} c=${f.confidence}] ${f.dimension}/${f.criterion}=${JSON.stringify(f.metric)} :: ${f.justification}`);
  }
  console.log('\nNOT covered by this deterministic layer:', NOT_COVERED.join(' | '));
}
