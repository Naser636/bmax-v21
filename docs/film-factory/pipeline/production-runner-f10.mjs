// ODG-NATIVE AUTONOMOUS PRODUCTION RUNNER for "La Porte du Soleil" (F10) — DRY-RUN ONLY.
// Reuses film-pipeline.mjs primitives (BudgetLedger, makeShot, acceptanceGate, dependentsUnlocked, classifyDefect,
// retryPlan, rightsReleaseCheck, exportDurationGate, releaseGate) + the active F10 registers + shared bible.
// STRUCTURALLY INCAPABLE of spending/installing/calling a provider: there is NO network code and NO ledger.spend()
// in this file. Every external action passes requireAuth(); unauthorized/unavailable => explicit BLOCKED, never a
// false success. Media are NEVER real here — generation yields FIXTURES tagged {fixture:true,file:null}. The film
// is NOT produced; export is BLOCKED until a real measured file exists. READ-ONLY over registers; writes only a
// DRY-RUN run-report fixture under pipeline/runs/.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BudgetLedger, makeShot, recordGeneration, acceptanceGate, dependentsUnlocked, classifyDefect, retryPlan, rightsReleaseCheck, exportDurationGate, releaseGate, sha256 } from './film-pipeline.mjs';
import { buildRealization, antiSlideshowGate, coverageMixAudit, dramaticFunctionGate } from './realization-plan-f10.mjs';
import { sceneTransitionCheck } from './scene-transition-check.mjs';
import { InactiveProviderAdapter } from './provider-adapter.mjs';
import { ffmpegAvailable, measureDurationSec, probeIntegrity } from './ffmpeg-local.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));

// ---- AUTHORIZATION (all external capabilities OFF by default = gate `12` ungranted). Never flip these in code.
export const DEFAULT_AUTH = { allowPaidGeneration: false, allowInstall: false, ffmpegAvailable: false, providerKeys: {} };
export function requireAuth(capability, auth) {
  const grants = {
    paidGeneration: auth.allowPaidGeneration && Object.keys(auth.providerKeys || {}).length > 0,
    install: auth.allowInstall,
    ffmpeg: auth.ffmpegAvailable === true || ffmpegAvailable(), // now detects the locally-provisioned static binary
  };
  return grants[capability] === true
    ? { authorized: true }
    : { authorized: false, state: 'BLOCKED', reason: `EXTERNAL_SERVICE_REQUIRED: '${capability}' not authorized (gate 12 ungranted)` };
}

// ---- SIMULATED generation — a FIXTURE, never a real medium. Does NOT call any provider and cannot spend.
function simulateGeneration(shot, { failFixtureIds = new Set() } = {}) {
  // deterministic synthetic QC so the acceptance logic can be exercised; explicitly a fixture.
  const fail = failFixtureIds.has(shot.id);
  const qc = { fixture: true, faceMatch: fail ? 3 : 5, costumeDrift: fail ? true : false, lipsyncOk: shot.dialogue ? !fail : true, exported: false, continuityBreak: false };
  recordGeneration(shot, { costEur: 0, outputBytes: null }); // cost 0 in dry-run; provenance over a fixture seed
  shot.provenance = 'FIXTURE:' + sha256(`${shot.id}:SIMULATED`); // tag provenance as a fixture, not real bytes
  shot.fixture = true; shot.file = null;
  return { fixture: true, file: null, sha256: null, qc, note: 'SIMULATED FIXTURE — not a real medium' };
}

export function run(opts = {}) {
  const auth = { ...DEFAULT_AUTH, ...(opts.auth || {}) };
  const dryRun = opts.dryRun !== false; // default DRY-RUN
  const trace = []; const log = (stage, status, detail) => { trace.push({ stage, status, detail }); };
  if (!dryRun) { // non-dry-run: refuse without gate-12 auth AND refuse even WITH auth (no real provider wired here)
    const a = requireAuth('paidGeneration', auth);
    if (!a.authorized) { log('mode', 'BLOCKED', a.reason); return finalize({ trace, blocked: true, reason: a.reason }); }
    log('mode', 'BLOCKED', 'real provider integration NOT implemented in this harness — dry-run only (no false real-generation claim)');
    return finalize({ trace, blocked: true, reason: 'real-generation-not-implemented' });
  }

  // 1) LOAD active registers + shared bible
  const SL = read('shot-list-f10.json'); const vb = read('fr-voice-bible-f10.json'); const cont = read('continuity-ledger-f10.json');
  log('load', 'OK', { shots: SL.shots.length, voices: vb.voices.length, continuityThreads: cont.threads.length });

  // 2) PLAN — build tracked shots + dependencies (a coverage/insert shot depends on its scene establisher accepted)
  const ledger = new BudgetLedger(SL.budget.cap); // cap only; NO spend() is ever called in dry-run
  const shots = SL.shots.map(s => { const sh = makeShot(s.id, s.scene, { kind: s.mediaCategory, prompt: s.proposedPrompt, dialogue: s.mediaCategory === 'AUDIO_LINE', refs: (s.continuityRefs || []).map(r => r.ref) }); sh.characters = (s.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref); sh.estCostEur = s.costEurEstimated || 0; return sh; });
  const estTotal = Math.round(shots.reduce((a, s) => a + s.estCostEur, 0) * 100) / 100;
  const deps = {}; for (const scId of new Set(shots.map(s => s.scene))) { const est = scId + '-SH01'; for (const s of shots.filter(x => x.scene === scId && x.id !== est)) deps[s.id] = [est]; }
  log('plan', estTotal <= ledger.cap ? 'OK' : 'BLOCKED', { trackedShots: shots.length, estCostEur: estTotal, cap: ledger.cap, withinCap: estTotal <= ledger.cap, note: 'estCost is ESTIMATE; committed/spent remain 0' });

  // 2b) REALIZATION — consume the ACTUAL video/still prompts (ids/refs/continuity) + classify by production need.
  const real = buildRealization();
  const rById = Object.fromEntries(real.shots.map(r => [r.id, r]));
  for (const s of shots) { const r = rById[s.id]; if (r) { s.classification = r.classification; s.promptLinked = r.promptLinked; s.dramaticFunction = r.dramaticFunction; } }
  // verify linkage: every visual shot carries a real prompt; every shot sits in its scene; deps point to a real id.
  const visuals = shots.filter(s => s.kind === 'PREMIUM_VIDEO' || s.kind === 'STILL_ANIMATABLE');
  const unlinked = visuals.filter(s => !s.promptLinked).map(s => s.id);
  const badScene = shots.filter(s => !rById[s.id] || rById[s.id].scene !== s.scene).map(s => s.id);
  const badDep = Object.entries(deps).filter(([, pre]) => pre.some(p => !shots.find(x => x.id === p))).map(([id]) => id);
  log('link.verify', unlinked.length || badScene.length || badDep.length ? 'BLOCKED' : 'OK', { visualShots: visuals.length, unlinkedVisuals: unlinked.length, sceneMismatches: badScene.length, danglingDeps: badDep.length, note: 'each visual shot linked to its authored prompt; scene + deps consistent' });

  // 3) GENERATE. Real generation goes through the INACTIVE provider adapter (returns BLOCKED — no call, no key).
  const adapter = new InactiveProviderAdapter(auth);
  const realGen = requireAuth('paidGeneration', auth);
  const failFixtureIds = new Set(opts.failFixtureIds || []);
  const adapterProbe = adapter.generateImage({ dryRunProbe: true });
  if (!realGen.authorized || adapterProbe.status === 'BLOCKED') log('generate.real', 'BLOCKED', realGen.authorized ? adapterProbe.reason : realGen.reason);
  for (const s of shots) simulateGeneration(s, { failFixtureIds });
  log('generate.simulated', 'OK (FIXTURE)', { generated: shots.length, note: 'all outputs are fixtures; file=null; no provider called; cost €0' });

  // 4) ACCEPTANCE on fixtures (+ dependency unlock) — real acceptance later on real media
  const criteria = { faceMatchMin: 4, requireNoDrift: true, requireLipsyncIfDialogue: true, requireExport: false };
  let accepted = 0, rejected = 0; const defects = {};
  for (const s of shots) {
    const dep = dependentsUnlocked(s, shots, deps);
    if (!dep.unlocked) { s.status = 'BLOCKED'; continue; }
    const v = acceptanceGate(s, { fixture: true, faceMatch: s.fixture && !failFixtureIds.has(s.id) ? 5 : 3, costumeDrift: failFixtureIds.has(s.id), lipsyncOk: s.dialogue ? !failFixtureIds.has(s.id) : true, exported: false, continuityBreak: false }, criteria);
    if (v.pass) accepted++; else { rejected++; const d = classifyDefect(v.failed); defects[s.id] = { ...d, retry: retryPlan(s, 3) }; }
  }
  log('acceptance.simulated', 'OK (FIXTURE)', { accepted, rejected, note: 'verdicts over FIXTURES; not a quality claim on real media' });

  // 5) SELECT accepted (quality+continuity+cost) — here: accepted fixtures
  const selected = shots.filter(s => s.status === 'ACCEPTED');
  log('select', 'OK (FIXTURE)', { selected: selected.length });

  // GATE 1 — coverage / continuity / rhythm / gaps (anti-void, anti-slideshow). Contract-level in dry-run: it
  // surfaces flags/decisions but NEVER declares artistic validation.
  const slideshow = antiSlideshowGate(real);
  const mix = coverageMixAudit(real);
  const fnGate = dramaticFunctionGate();
  const transitions = sceneTransitionCheck();
  const needsRealMedia = slideshow.filter(f => f.status === 'NEEDS_REAL_MEDIA').length;
  const hardFlags = [...slideshow.filter(f => f.status === 'FLAG' || f.status === 'BLOCKED'), ...fnGate.flags];
  log('gate1.coverage', 'OK (NO ARTISTIC VALIDATION)', { classes: mix.byClass, mix: mix.mix, generatedCoverageMin: mix.generatedCoverageMin, reuseHoldToFillMin: mix.reuseHoldToFillMin, functionGateAllPass: fnGate.allPass, functionFlags: fnGate.flags.length, sc47IntentionalSilenceOk: fnGate.sc47Verdict?.intentionalSilenceOk, transitionContradictions: transitions.contradictions.length, transitionConfirmFlags: transitions.confirmFlags.length, transitionNeedsRealMedia: transitions.needsMedia, flags: slideshow.length, needsRealMedia, nonMediaFlags: hardFlags.length, flagSample: hardFlags.slice(0, 3), note: 'every scene carries ≥1 dramatic function; coverage classified by need; reuse UNPROVEN until real cut; thresholds are RISK indicators, not quality proof' });

  // 6) ASSEMBLY conductor — ordered per scene with durations (defers to duration-proof-f10 for the staged band)
  const sceneOrder = [...new Set(SL.shots.map(s => s.scene))];
  const conductor = sceneOrder.map((scId, i) => {
    const sshots = SL.shots.filter(s => s.scene === scId);
    const dlg = sshots.filter(s => s.mediaCategory === 'AUDIO_LINE').length;
    const music = sshots.filter(s => s.mediaCategory === 'MUSIC_CUE').length;
    const genSec = sshots.reduce((a, s) => a + (s.targetSec || 0), 0);
    return { order: i + 1, scene: scId, sceneHead: sshots[0].sceneHead, dialogueLines: dlg, musicCues: music, genSec, transitionsPlanned: i === 0 ? 'cold open' : 'cut/dissolve per edit-plan', reuseAssumption: 'holds/reuse fill screen>gen; validated only at real edit' };
  });
  const genTotalSec = conductor.reduce((a, c) => a + c.genSec, 0);
  log('assembly.plan', 'OK', { scenes: conductor.length, generatedOutputSec: genTotalSec, note: 'conductor is a PLAN; screen/final durations per duration-proof-f10 (57.4–94 staged; 60 target); NOT a produced cut' });

  // GATE 2 — representative prototype + its edit plan (CONTRACT). The 5 benchmark shots form the prototype; the
  // edit plan is a plan only. Dry-run tests the contract, never declares the prototype artistically good.
  const prototypeIds = ['SC40-SH06', 'SC22-SH06', 'SC43-SH03', 'SC01-SH01', 'SC39-SH04'];
  const protoPresent = prototypeIds.filter(id => SL.shots.find(s => s.id === id));
  log('gate2.prototype', protoPresent.length === prototypeIds.length ? 'OK (CONTRACT)' : 'BLOCKED', { prototypeShots: protoPresent.length, editPlan: 'ordered cut of the 5 shots with FR VO + one music cue', note: 'prototype is a PLAN; real media + human review required to judge it (Gate 3)' });

  // GATE 3 — real-media evaluation + cost per usable second. Needs real media → NEEDS_REAL_MEDIA in dry-run.
  log('gate3.realmedia', 'BLOCKED', { reason: 'NEEDS_REAL_MEDIA: no real generated media exists; quality (7.5/10) + measured €/usable-sec require gate 12 + human inspection', costPerUsableSec: 'UNMEASURED' });

  // 7) POST-OPS plan (edit/compositing/wound-blood/colour/subtitles/mix) — all PLANNED, none performed
  const postOps = ['edit-assembly', 'compositing', 'wound/blood-continuity-correction (narratively-justified only)', 'colour-grade', 'subtitles (FR + in-world subtitled lines)', 'sound-mix'].map(op => ({ op, status: 'PLANNED', tool: 'OSS (DaVinci free / Audacity) — $0', performed: false }));
  const ffm = requireAuth('ffmpeg', auth);
  log('postops.plan', 'OK (PLANNED)', { ops: postOps.length, ffmpeg: ffm.authorized ? 'available' : 'BLOCKED (needs install)' });

  // GATE 4 — full edit + AV control + REAL export + duration validation on a REAL file. ffmpeg tool now VERIFIED
  // local; but with no real media there is still no file => fail-closed. If a real exportFile is supplied, measure
  // it with ffprobe (never fabricate).
  const ffAvail = ffmpegAvailable();
  const realExportFile = opts.exportFile || null;           // only set when a real edit has actually produced a file
  const measured = realExportFile ? measureDurationSec(realExportFile) : null;
  const integrity = realExportFile ? probeIntegrity(realExportFile) : { ok: false, reason: 'no real exported file exists' };
  const exp = { filePath: realExportFile, exists: !!(realExportFile && integrity.ok), durationSec: measured };
  const expGate = exportDurationGate(exp, { targetSec: 3600, tolSec: 120 });
  const exportValidated = expGate.ok === true && integrity.ok === true; // real file + real measurement required
  log('gate4.export', exportValidated ? 'OK' : 'BLOCKED', { ffmpegTool: ffAvail ? 'VERIFIED (local static)' : 'ABSENT', realExportFile, measuredDurationSec: measured, integrity: integrity.ok, reasons: expGate.reasons, note: ffAvail ? 'ffmpeg ready; BLOCKED only on absence of real media (no provider credential) — 60:00 NOT validated' : 'no export tool; 60:00 NOT validated' });

  // 9) RIGHTS + release gate (over fixtures) — informational; cannot release without real accepted media
  const rights = rightsReleaseCheck(selected.map(s => ({ id: s.id, licence: 'unknown', aiDisclosed: false })));
  const rel = releaseGate(shots, rights, ledger);
  log('release', rel && rel.ok ? 'OK' : 'BLOCKED', { ok: !!(rel && rel.ok), note: 'blocked: refs TO_CREATE (rights unknown) + no real media' });

  return finalize({ trace, auth, dryRun, ledger, estTotal, counts: { shots: shots.length, accepted, rejected, selected: selected.length }, conductor, postOps, defects, exportValidated, coverageMix: mix, qualityFlags: slideshow });
}

function finalize(ctx) {
  const report = {
    runner: 'production-runner-f10 (DRY-RUN)', generated: 'ODG autonomous dry-run',
    mode: ctx.dryRun === false ? 'REAL(blocked)' : 'DRY-RUN',
    filmProduced: false, exportValidated: ctx.exportValidated === true, // both must stay false until real media
    artisticValidation: false, // NEVER true in dry-run; awaits real media + human inspection
    mediaReal: false, costEurReal: 0, costEurEstimated: ctx.estTotal ?? null,
    budgetAuthorized: 0, spent: ctx.ledger ? ctx.ledger.spent : 0, committed: ctx.ledger ? ctx.ledger.committed : 0,
    blocked: ctx.blocked || false, blockReason: ctx.reason || null,
    counts: ctx.counts || null, conductorScenes: ctx.conductor ? ctx.conductor.length : 0,
    coverageMix: ctx.coverageMix || null, qualityFlagCount: ctx.qualityFlags ? ctx.qualityFlags.length : 0,
    gates: ctx.trace ? Object.fromEntries(ctx.trace.filter(t => /^gate\d|^link|^generate|^export/.test(t.stage)).map(t => [t.stage, t.status])) : null,
    trace: ctx.trace,
    note: 'DRY-RUN: no provider called, €0 spent, no install, no real media. Fixtures are NOT real media. Export NOT validated (no real file).',
  };
  try { mkdirSync(join(here, 'runs'), { recursive: true }); writeFileSync(join(here, 'runs', 'dry-run-latest.json'), JSON.stringify(report, null, 1)); } catch {}
  return report;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run({ dryRun: true });
  console.log('PRODUCTION RUNNER (DRY-RUN) — stage trace:');
  for (const t of r.trace) console.log(`  [${t.status}] ${t.stage}`);
  console.log(`\nfilmProduced=${r.filmProduced} exportValidated=${r.exportValidated} mediaReal=${r.mediaReal} spent=€${r.spent} estCost=€${r.costEurEstimated}`);
  console.log(`counts:`, JSON.stringify(r.counts), `| conductor scenes: ${r.conductorScenes}`);
  console.log(`BLOCKED stages: ${r.trace.filter(t => /BLOCKED/.test(t.status)).map(t => t.stage).join(', ') || 'none'}`);
}
