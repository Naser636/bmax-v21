// Recover the in-flight SC01-video prediction (reservation r5) after the run was killed: poll to terminal, download
// if succeeded, SETTLE r5 at its reserved worst-case (or RELEASE on failure). No NEW attempt (already counted).
// Also prints the FR-voice input schema constraints so SC43 can be retried with valid values. Token in env only.
import { readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PersistentLedger } from './persistent-ledger.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const T = process.env.REPLICATE_API_TOKEN; const H = { Authorization: `Bearer ${T}` };
const PID = '2zh7x87hwhrmr0d1dt0tfjvn2c';

const r = await fetch(`https://api.replicate.com/v1/predictions/${PID}`, { headers: H });
const p = await r.json();
console.log('SC01-video prediction status:', p.status, '| is_free_trial:', p.is_free_trial_prediction);
const ledger = new PersistentLedger(4.0, join(here, 'runs', 'benchmark', 'ledger-state-paid.json'), { maxAttempts: 8 });

if (p.status === 'succeeded') {
  const url = Array.isArray(p.output) ? p.output[0] : p.output;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const dest = join(here, 'runs', 'benchmark', 'SC01-video.mp4');
  writeFileSync(dest, buf);
  const sha = createHash('sha256').update(buf).digest('hex');
  ledger.settle('r5', 0.50);
  console.log(`DOWNLOADED SC01-video.mp4 bytes=${buf.length} sha256=${sha}`);
  console.log('ledger after settle:', JSON.stringify(ledger.snapshot()));
} else if (['failed', 'canceled'].includes(p.status)) {
  ledger.release('r5');
  console.log('prediction not usable; released r5. ledger:', JSON.stringify(ledger.snapshot()));
} else {
  console.log('still', p.status, '— leaving r5 reserved (conservative). ledger:', JSON.stringify(ledger.snapshot()));
}
