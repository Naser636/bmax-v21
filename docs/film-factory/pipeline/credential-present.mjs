// Presence-only verifier for the Replicate credential. Reports ONLY {present, length, source} — NEVER the value,
// never a hash, never any substring. Checks process.env first, then an optional protected file (sourced by the
// caller). Used to confirm a credential is safely in place BEFORE wiring any real paid call. No network, €0.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const VAR = 'REPLICATE_API_TOKEN';
const SECURE_FILE = join(homedir(), '.config', 'odg', 'replicate.env');

function fromEnv() {
  const v = process.env[VAR];
  return v && v.trim().length > 0 ? { present: true, length: v.trim().length, source: 'env' } : null;
}
function fromFile() {
  if (!existsSync(SECURE_FILE)) return null;
  const mode = (statSync(SECURE_FILE).mode & 0o777).toString(8);
  const line = readFileSync(SECURE_FILE, 'utf8').split('\n').find(l => l.startsWith(VAR + '='));
  if (!line) return { present: false, length: 0, source: 'file(no var)', fileMode: mode };
  const val = line.slice(VAR.length + 1).trim().replace(/^["']|["']$/g, '');
  return val.length > 0 ? { present: true, length: val.length, source: 'file', fileMode: mode, secure: mode === '600' } : { present: false, length: 0, source: 'file(empty)', fileMode: mode };
}

const result = fromEnv() || fromFile() || { present: false, length: 0, source: 'none' };
// sanity on shape only — plausible token length band (Replicate tokens are ~40 chars); do NOT reveal the value
const plausible = result.present && result.length >= 20 && result.length <= 200;
console.log(JSON.stringify({ var: VAR, present: result.present, length: result.length, source: result.source, fileMode: result.fileMode || null, secureFilePerms: result.secure ?? null, plausibleShape: plausible, secureFilePath: SECURE_FILE, note: 'value NEVER printed; presence + length only' }, null, 0));
process.exit(result.present ? 0 : 3);
