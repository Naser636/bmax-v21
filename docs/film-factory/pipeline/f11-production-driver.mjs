// F11 CHRONOLOGICAL production driver — reuses the proven campaign-runner engine (resumable, idempotent,
// reserve-before-cap, preflight-gated, CIQE). DRY-RUN by default (€0, no network). REAL mode runs ONLY when an
// authorized production ledger (e.g. a t2-ledger) is passed AND attempts remain — it never authorizes spend itself.
// Supplies F11 prompts (promptSeed + style) via the injectable promptProvider. Chronological SC01->SC49.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCampaign } from './campaign-runner.mjs';
import { applyStyle } from './style-lock-f10.mjs';
import { filterReady, loadRoster, loadBeats } from './shot-readiness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');

// F11 prompt provider: build from the shot's promptSeed (authoritative F11 shotlist) + the photoreal style anchor.
export function f11PromptProvider(id, sh) {
  const seed = (sh && sh.promptSeed) ? sh.promptSeed : '';
  return { id, fullPrompt: seed };
}

// Load + normalise F11 shots into the shape campaign-runner expects.
export function loadF11Shots() {
  const sl = JSON.parse(readFileSync(join(canon, 'f11-fullfilm-shotlist.json'), 'utf8'));
  // Normalise ids to the engine's '{scene}-SHxx' convention (buildGraph derives the establisher as scene+'-SH01');
  // F11 ids carry an 'F11-' prefix that would break establisher matching. Keep origId for traceability.
  return sl.shots.map(s => ({
    id: s.id.replace(/^F11-/, ''), origId: s.id, scene: s.scene, mediaCategory: s.mediaCategory, content: s.content,
    decisiveAgent: s.decisiveAgent,
    subjectAction: (s.decisiveAgent ? s.decisiveAgent + ' — ' : '') + (s.content || ''),
    continuityRefs: [], promptSeed: s.promptSeed,
  }));
}

// Run the chronological campaign (DRY by default). Returns the campaign report + a chronological manifest.
// readyGate: FAIL-CLOSED readiness filter. Defaults to ON for a REAL run (!dryRun) — non-READY shots (multi-char,
// VFX, new-character, unknown) are BLOCKED before any ledger reserve and never reach the paid adapter. A paid run
// never processes a shot the canonical classifier did not pass. dryRun keeps the full list for planning.
export async function runF11({ adapter, ledger, outDir, dryRun = true, statePath, maxShots = Infinity, ciqe = null, download = null, readyGate = !dryRun } = {}) {
  let shots = loadF11Shots();
  let blockedByReadiness = [];
  if (readyGate) {
    const { ready, blocked } = filterReady(shots, loadRoster(), loadBeats());
    shots = ready.map(r => r.shot);
    blockedByReadiness = blocked.map(b => ({ id: b.shot.id, status: b.status, reason: b.reasons[0] }));
  }
  const report = await runCampaign({
    adapter, ledger, shots, outDir, dryRun, statePath, maxShots, ciqe, download,
    promptProvider: (id, sh) => { const p = f11PromptProvider(id, sh); return { fullPrompt: applyStyle(p.fullPrompt) }; },
  });
  const manifest = report.records.map((r, i) => ({ order: i + 1, id: r.id, status: r.status }));
  return { report, manifest, blockedByReadiness, readyGate, counts: shots.reduce((a, s) => (a[s.mediaCategory] = (a[s.mediaCategory] || 0) + 1, a), {}) };
}

// CLI: dry-run over the whole F11 film (free) — proves chronological sequencing + classification.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { ReplicateAdapter } = await import('./replicate-adapter.mjs');
  const { PersistentLedger } = await import('./persistent-ledger.mjs');
  const outDir = join(here, 'runs', 'f11-dry');
  mkdirSync(outDir, { recursive: true });
  const ledger = new PersistentLedger(300, join(outDir, 'ledger-dry.json'), { maxAttempts: 2000 });
  const adapter = new ReplicateAdapter({ auth: {}, ledger });
  const { report, counts } = await runF11({ adapter, ledger, outDir, dryRun: true, statePath: join(outDir, 'state-dry.json') });
  console.log(`F11 DRY RUN: processed=${report.processed} | video=${counts.PREMIUM_VIDEO} still=${counts.STILL_ANIMATABLE} | halted=${report.halted || 'no'} | spent €0`);
  console.log(`first 3 chronological: ${report.records.slice(0, 3).map(r => r.id).join(', ')}`);
}
