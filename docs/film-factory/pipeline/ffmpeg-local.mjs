// Local, non-privileged ffmpeg/ffprobe access (vendor/node_modules — ffmpeg-static 5.3.0 GPL-3.0, ffprobe-static
// 3.1.0 MIT; binaries johnvansickle static builds). REAL duration measurement + integrity probe for the export
// gate. No network, no spend. GPL obligations attach to redistributing the binary, not to produced content.
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
const here = dirname(fileURLToPath(import.meta.url));
const req = createRequire(join(here, 'vendor', 'package.json'));

export function resolveBinaries() {
  try {
    const ffmpeg = req('ffmpeg-static');
    const ffprobe = req('ffprobe-static').path;
    return { ffmpeg, ffprobe, available: existsSync(ffmpeg) && existsSync(ffprobe) };
  } catch { return { ffmpeg: null, ffprobe: null, available: false }; }
}
export function ffmpegAvailable() { return resolveBinaries().available; }

// Measure a REAL file's duration (seconds) via ffprobe. Returns null if no file / unreadable (never fabricates).
export function measureDurationSec(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  const { ffprobe, available } = resolveBinaries();
  if (!available) return null;
  try {
    const out = execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath], { encoding: 'utf8' });
    const d = parseFloat(String(out).trim());
    return Number.isFinite(d) ? d : null;
  } catch { return null; }
}
// Basic integrity probe: file exists, non-empty, ffprobe reads a valid stream.
export function probeIntegrity(filePath) {
  if (!filePath || !existsSync(filePath)) return { ok: false, reason: 'no file' };
  const sz = statSync(filePath).size;
  if (sz === 0) return { ok: false, reason: 'empty file' };
  const { ffprobe, available } = resolveBinaries();
  if (!available) return { ok: false, reason: 'ffprobe unavailable' };
  try {
    execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', filePath], { encoding: 'utf8' });
    return { ok: true, bytes: sz };
  } catch (e) { return { ok: false, reason: 'ffprobe could not decode' }; }
}
