// Verifies the provider-credential CONSUMPTION path never exposes the secret value: the adapter + runner read a
// key by PRESENCE only and never copy its value into any returned object, status, reason, or run report. Uses a
// SENTINEL fake token (never a real secret). No network, no paid call, €0. READ-ONLY.
import { InactiveProviderAdapter } from './provider-adapter.mjs';
import { run, requireAuth } from './production-runner-f10.mjs';
const SENTINEL = 'SENTINEL_FAKE_TOKEN_DO_NOT_LOG_abc123';
const leaks = s => JSON.stringify(s ?? '').includes(SENTINEL);
let pass = 0, fail = 0; const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

const auth = { allowPaidGeneration: true, providerKeys: { replicate: SENTINEL } };

// adapter: authorized by PRESENCE, but value never surfaces
const a = new InactiveProviderAdapter(auth);
ok('adapter.available() authorized by presence (no value needed)', a.available().authorized === true);
ok('adapter.available() does NOT leak the token', !leaks(a.available()));
for (const m of ['generateVideo', 'generateImage', 'generateVoice', 'generateMusic'])
  ok(`adapter.${m}() BLOCKED + no token leak`, a[m]().status === 'BLOCKED' && !leaks(a[m]()));

// requireAuth: presence check only (length), never echoes the value
const ra = requireAuth('paidGeneration', auth);
ok('requireAuth authorized by presence', ra.authorized === true);
ok('requireAuth result has no token', !leaks(ra));

// runner: even with a key present, dry-run stays €0 / no real gen, and the FULL report never contains the token
const r = run({ dryRun: true, auth });
ok('runner dry-run still €0 / no real media with key present', r.spent === 0 && r.mediaReal === false);
ok('full run report does NOT contain the token', !leaks(r));
ok('run trace does NOT contain the token', !leaks(r.trace));
// non-dry-run with key: refused (no real adapter wired) AND still no leak
const rnd = run({ dryRun: false, auth });
ok('non-dry-run with key: blocked + no leak', rnd.blocked === true && !leaks(rnd));

console.log(`credential-safety-check: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : '') + '  [sentinel token, never a real secret]');
if (fail) process.exit(1);
