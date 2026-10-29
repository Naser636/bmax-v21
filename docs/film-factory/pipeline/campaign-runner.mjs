// W-CAMPAIGN-RUNNER (local orchestration) — drives the full 420-shot F10 campaign through a dependency graph with
// resumable, idempotent execution, a persistent cost ledger (reserve-before-call, halt-before-cap), per-shot CIQE
// gating, structured error handling, and a final report. DRY-RUN by default (€0). The adapter is INJECTED (the real
// ReplicateAdapter for production, a mock for simulation tests) — this file issues NO network call itself and NEVER
// authorizes paid generation on its own. No commit, no secrets.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getFaithfulPrompt } from './faithful-prompts-f10.mjs';
import { applyStyle } from './style-lock-f10.mjs';
import { injectIdentity, availableRefs } from './identity-inject.mjs';

// Operating contract (learning-ledger preflight guards). Loaded lazily & fail-OPEN on absence so the
// runner never breaks if the ledger is missing — but when present it BLOCKS known-failure generations
// (e.g. seedance+Björn E005) before any paid call. Pass opts.operatingContract=false to disable, or an
// object exposing lessonGuards(op) to inject a stub in tests.
async function loadOperatingContract(opts) {
  if (opts.operatingContract === false) return null;
  if (opts.operatingContract && typeof opts.operatingContract.lessonGuards === 'function') return opts.operatingContract;
  try { const m = await import('./operating-contract.mjs'); return { lessonGuards: (op) => m.lessonGuards(op) }; }
  catch { return null; }
}
// Normalise an injected character name to a lesson subject key (Björn -> BJORN).
function subjectKey(primary, prompt) {
  if (/bj[öo]rn/i.test(primary || '') || /bj[öo]rn/i.test(prompt || '')) return 'BJORN';
  return primary || null;
}

// Resolve the UNAMBIGUOUS primary covered character for identity injection. Returns a character name only if it is
// clearly the shot's subject AND a reference image exists; otherwise null (never guess / never assign all faces).
function resolvePrimaryCovered(sh) {
  const refs = availableRefs();
  const chars = (sh.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref);
  const covered = chars.filter(c => refs[c]);
  if (covered.length === 0) return null;
  // prefer the character named at the start of subjectAction (e.g. "MERYT — line coverage")
  const named = (sh.subjectAction || '').match(/^([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ -]+?)\s*[—-]/);
  if (named && covered.includes(named[1].trim())) return named[1].trim();
  // else inject only if EXACTLY ONE covered character (unambiguous)
  return covered.length === 1 ? covered[0] : null;
}

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(here, f), 'utf8'));

// Dependency graph: within a scene, every non-establisher shot depends on that scene's establisher (SH01). Scenes
// run in canonical order. (Cross-scene ordering is sequential; identity/location refs are a soft precondition.)
export function buildGraph(shots) {
  const bySceneEstablisher = {};
  for (const s of shots) { const est = s.scene + '-SH01'; if (!bySceneEstablisher[s.scene]) bySceneEstablisher[s.scene] = est; }
  const deps = {};
  for (const s of shots) { const est = bySceneEstablisher[s.scene]; deps[s.id] = (s.id === est) ? [] : [est]; }
  return deps;
}

const EXT = { PREMIUM_VIDEO: 'mp4', STILL_ANIMATABLE: 'webp', AUDIO_LINE: 'mp3', MUSIC_CUE: 'mp3' };
const MODEL = { PREMIUM_VIDEO: 'minimax/video-01', STILL_ANIMATABLE: 'black-forest-labs/flux-dev', AUDIO_LINE: 'minimax/speech-02-hd', MUSIC_CUE: 'minimax/music-01' };
const WORST = { PREMIUM_VIDEO: 0.50, STILL_ANIMATABLE: 0.03, AUDIO_LINE: 0.05, MUSIC_CUE: 0.50 };

function loadState(path) { if (!existsSync(path)) return { shots: {} }; try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return { shots: {} }; } }
function saveState(path, st) { const tmp = path + '.tmp'; writeFileSync(tmp, JSON.stringify(st, null, 1)); renameSync(tmp, path); }

// adapter: { generate(opts) -> {status, ok, paid, costEur, outputUrls?, reason?, unexpectedCharge?} }
// ciqe (optional): (file) -> { worstSeverity }  ; downloader (optional): (url,dest)->bytes
export async function runCampaign(opts = {}) {
  const { adapter, ledger, shots, outDir, dryRun = true, statePath,
    ciqe = null, download = null, maxShots = Infinity, promptProvider = getFaithfulPrompt } = opts;
  if (!adapter || !ledger || !shots || !outDir || !statePath) throw new Error('runCampaign: adapter, ledger, shots, outDir, statePath required');
  mkdirSync(outDir, { recursive: true });
  const oc = await loadOperatingContract(opts);
  const deps = buildGraph(shots);
  const state = loadState(statePath);
  const report = { mode: dryRun ? 'DRY-RUN' : 'REAL', processed: 0, accepted: 0, skipped: 0, failed: 0, rejected: 0, halted: null, records: [] };

  const ordered = [...shots].sort((a, b) => {
    const na = parseInt(a.scene.slice(2)), nb = parseInt(b.scene.slice(2));
    if (na !== nb) return na - nb; return a.id.localeCompare(b.id);
  });

  for (const sh of ordered) {
    if (report.processed >= maxShots) break;
    if (report.halted) { report.records.push({ id: sh.id, status: 'SKIPPED', reason: report.halted }); report.skipped++; continue; }
    const ext = EXT[sh.mediaCategory]; const dest = join(outDir, `${sh.id}.${ext}`);
    // RESUME / IDEMPOTENT: already accepted or media present => skip (no attempt, no spend)
    if (state.shots[sh.id]?.status === 'ACCEPTED' || existsSync(dest)) {
      report.records.push({ id: sh.id, status: 'SKIPPED', reason: 'already present (resume/idempotent)' }); report.skipped++; continue;
    }
    // dependency: establisher must be accepted first (in dry-run, a DRY_RUN establisher counts as satisfied)
    const okStatuses = dryRun ? ['ACCEPTED', 'DRY_RUN'] : ['ACCEPTED'];
    const pending = (deps[sh.id] || []).filter(p => !okStatuses.includes(state.shots[p]?.status) && !existsSync(join(outDir, `${p}.${EXT.STILL_ANIMATABLE}`)) && !existsSync(join(outDir, `${p}.${EXT.PREMIUM_VIDEO}`)));
    if (pending.length) { report.records.push({ id: sh.id, status: 'BLOCKED_DEP', reason: `awaits ${pending.join(',')}` }); continue; }

    const prompt = promptProvider(sh.id, sh);
    const model = MODEL[sh.mediaCategory]; const worst = WORST[sh.mediaCategory];
    let input = sh.mediaCategory === 'AUDIO_LINE'
      ? { text: '«dialogue FR à produire»', voice_id: 'French_MaleNarrator', language_boost: 'French' }
      : { prompt: applyStyle(prompt?.fullPrompt || '') }; // photoreal style anchor on visual shots
    // OPT-IN identity propagation: inject a reference ONLY for an UNAMBIGUOUS single covered character.
    let injection = null;
    if (opts.injectIdentity && sh.mediaCategory !== 'AUDIO_LINE') {
      const primary = resolvePrimaryCovered(sh);
      if (primary) { const res = injectIdentity(input, primary, model); if (res.injected) { input = res.input; injection = { character: primary, field: res.field }; } }
    }

    // OPERATING-CONTRACT PREFLIGHT: run learning-ledger guards before issuing the (paid) call. A BLOCK-class
    // lesson (e.g. seedance+Björn E005) refuses the generation with no spend; WARN-class lessons are recorded.
    if (oc) {
      const octx = { model, prompt: input.prompt || '', subject: subjectKey(resolvePrimaryCovered(sh), input.prompt), usesFaceRef: !!injection, scene: sh.scene };
      let guard; try { guard = await oc.lessonGuards(octx); } catch { guard = { blocks: [], warns: [] }; }
      // BLOCK only gates a real (paid) call; dry-run is free planning and still records the warning.
      if (!dryRun && guard.blocks?.length) {
        state.shots[sh.id] = { status: 'PREFLIGHT_BLOCKED', blocks: guard.blocks }; saveState(statePath, state);
        report.failed++; report.records.push({ id: sh.id, status: 'PREFLIGHT_BLOCKED', blocks: guard.blocks.map(b => b.id), reason: guard.blocks.map(b => b.message).join('; ') });
        continue;
      }
      if (guard.warns?.length) report.records.push({ id: sh.id, status: 'PREFLIGHT_WARN', warns: guard.warns.map(w => w.id) });
    }

    let r;
    try { r = await adapter.generate({ model, input, kind: sh.mediaCategory, worstCaseCostEur: worst, idempotencyKey: sh.id, dryRun }); }
    catch (e) { r = { status: 'ERROR', ok: false, paid: false, costEur: 0, reason: String(e.message) }; }
    report.processed++;

    // interpret result
    if (r.status === 'DRY_RUN') { state.shots[sh.id] = { status: 'DRY_RUN' }; saveState(statePath, state); report.records.push({ id: sh.id, status: 'DRY_RUN', model, injection }); continue; }
    if (/PAYMENT_REQUIRED|402|insufficient credit/i.test(r.reason || '')) { report.halted = 'HALT_CREDIT (402 insufficient credit)'; report.records.push({ id: sh.id, status: 'HALT_CREDIT', reason: r.reason }); continue; }
    if (/LEDGER_REFUSED|BUDGET|ATTEMPT CAP/i.test(r.reason || '') || r.status === 'BLOCKED') { report.halted = 'HALT_BUDGET (cap/attempt)'; report.records.push({ id: sh.id, status: 'HALT_BUDGET', reason: r.reason }); continue; }
    if (r.unexpectedCharge) { report.halted = 'HALT_UNEXPECTED_CHARGE'; report.records.push({ id: sh.id, status: 'HALT_UNEXPECTED_CHARGE', reason: r.reason }); continue; }
    if (r.indeterminateBilling) { report.halted = 'HALT_INDETERMINATE_BILLING'; report.records.push({ id: sh.id, status: 'HALT_INDETERMINATE_BILLING', reason: r.reason, note: 'reservation KEPT; reconcile with provider before resume; no auto-retry' }); state.shots[sh.id] = { status: 'INDETERMINATE_BILLING', reason: r.reason }; saveState(statePath, state); continue; }
    if (r.status !== 'SUCCEEDED' || !r.ok) { state.shots[sh.id] = { status: 'FAILED', reason: r.reason }; saveState(statePath, state); report.failed++; report.records.push({ id: sh.id, status: 'FAILED', reason: r.reason }); continue; }

    // success path: (real) download + CIQE gate
    let sha = null, ciqeSev = null;
    if (!dryRun && r.outputUrls?.length && download) {
      try { const buf = await download(r.outputUrls[0], dest); sha = buf?.sha256 || null; } catch (e) { /* download fail */ }
      if (ciqe && existsSync(dest)) { const a = ciqe(dest); ciqeSev = a?.worstSeverity; if (['BLOCKER', 'MAJOR'].includes(ciqeSev)) { state.shots[sh.id] = { status: 'REJECTED', ciqe: ciqeSev }; saveState(statePath, state); report.rejected++; report.records.push({ id: sh.id, status: 'REJECTED_CIQE', ciqe: ciqeSev }); continue; } }
    }
    state.shots[sh.id] = { status: 'ACCEPTED', costEur: r.costEur, sha256: sha, ciqe: ciqeSev, file: dest };
    saveState(statePath, state);
    report.accepted++; report.records.push({ id: sh.id, status: 'ACCEPTED', costEur: r.costEur, ciqe: ciqeSev, injection });
  }

  report.ledger = ledger.snapshot ? ledger.snapshot() : null;
  writeFileSync(join(outDir, dryRun ? 'campaign-dry-report.json' : 'campaign-real-report.json'), JSON.stringify(report, null, 1));
  return report;
}

// CLI dry-run over the full shot-list (free)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { ReplicateAdapter } = await import('./replicate-adapter.mjs');
  const { PersistentLedger } = await import('./persistent-ledger.mjs');
  const sl = read('shot-list-f10.json');
  const outDir = join(here, 'runs', 'campaign');
  mkdirSync(outDir, { recursive: true });
  const ledger = new PersistentLedger(134, join(outDir, 'ledger-dry.json'), { maxAttempts: 2000 });
  const adapter = new ReplicateAdapter({ auth: {}, ledger });
  const r = await runCampaign({ adapter, ledger, shots: sl.shots, outDir, dryRun: true, statePath: join(outDir, 'state-dry.json'), maxShots: Infinity });
  console.log(`CAMPAIGN ${r.mode}: processed=${r.processed} dryRun-shots | accepted=${r.accepted} skipped=${r.skipped} failed=${r.failed} halted=${r.halted || 'no'}`);
}
