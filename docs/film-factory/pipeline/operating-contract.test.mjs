// REGRESSION PROOF for the permanent operating method (operating-contract.mjs) + its enforcement in the
// campaign-runner. Proves the five directive requirements: (1) a fresh session resumes from the last verified
// checkpoint; (2) completed assets are surfaced as do-not-repeat; (3) applicable lessons are loaded+applied;
// (4) paid calls respect authorization (and known-failure BLOCK); (5) exit records require a verified next action.
// LOCAL, €0, no network. Uses temp fixtures for recovery + a stub operating-contract injected into the real runner.
import { recoverCheckpoint, retrieveLessons, lessonGuards, authorizationGate, preflightForGeneration, validateExitRecord, loadContract, loadLearning, REPO_ROOT, verifyF10, providerAvailable, providerCredentialAvailable, loadProviderTokenIntoEnv } from './operating-contract.mjs';
import { runCampaign } from './campaign-runner.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

// ---- fixture: a minimal repo tree with compass head, timeline SSOT, learning ledger, ledgers, F10 freeze ----
let _n = 0;
function fixture() {
  const root = join(tmpdir(), `odg-oc-${process.pid}-${_n++}`);
  rmSync(root, { recursive: true, force: true });
  const mk = (rel) => { const d = join(root, rel); mkdirSync(d, { recursive: true }); return d; };
  mk('docs/film-factory/pipeline/runs/production-t1');
  mk('docs/film-factory/pipeline/runs/pilot');
  mk('docs/film-factory/pipeline/runs/validation-av');
  mk('docs/film-factory/canon/F11_PROPOSED');
  const f10 = mk('docs/film-factory/canon/F10_FROZEN_2026-10-24');
  // compass head with a REPRISE + EXACT NEXT pointer + a stale spend claim (to prove reconciliation)
  // header contains lowercase prose ("prints the exact next action") that must NOT shadow the real pointer
  writeFileSync(join(root, 'ODG_PROJECT_STATE.md'),
    '# compass\n\n> FILM AUTO-RESUME: prints the exact next action. The CTO need not restate.\n\n## ENTRY\n> REPRISE 2026-10-25zz — test. total paid €10.23 (stale).\n **EXACT NEXT:** generate SC01 Astrid-read coverage (minimax, €0.60).\n\n## older\n');
  // timeline SSOT with one scene carrying an un-accepted asset
  writeFileSync(join(root, 'docs/film-factory/canon/F11_PROPOSED/f11-film-timeline.json'), JSON.stringify({
    totalScenes: 49, reconciliation: { acceptedSec: 39.88 },
    scenes: [{ scene: 'SC01', existingAssets: [{ clip: 'E1', status: 'HUMAN_REVIEW_PENDING' }] }, { scene: 'SC02', existingAssets: [] }],
  }));
  // canonical operating contract + learning ledger (copy the real shapes)
  writeFileSync(join(root, 'docs/film-factory/pipeline/operating-contract.json'), JSON.stringify({
    version: '1.0', invariants: Array.from({ length: 10 }, (_, i) => ({ id: 'INV-' + (i + 1), text: 'x' })),
    exitRecordSchema: { required: ['truthLock', 'spentEur', 'remainingEur', 'attemptsLeft', 'f10Frozen', 'nextAction', 'evidence'] },
    resumeProtocol: ['step'],
  }));
  writeFileSync(join(root, 'docs/film-factory/pipeline/f11-production-learning-ledger.json'), JSON.stringify({
    mandatoryLessons: [
      { id: 'PL-2', lesson: 'seedance rejects Björn', appliesWhen: ['bjorn', 'seedance'], guard: { severity: 'BLOCK', rule: { model: 'seedance', usesFaceRef: true, subject: 'BJORN' }, message: 'E005' } },
      { id: 'PL-9', lesson: 'child peril', appliesWhen: ['e005', 'peril'], guard: { severity: 'BLOCK', rule: { promptCooccur: [['child'], ['drown', 'overboard']] }, message: 'child-in-peril' } },
    ],
  }));
  // ledgers (reality): t1 active, pilot/av immutable
  writeFileSync(join(root, 'docs/film-factory/pipeline/runs/production-t1/t1-ledger.json'), JSON.stringify({ ceiling: 15, spent: 6.2, remaining: 8.8, attempts: 19, maxAttempts: 20 }));
  writeFileSync(join(root, 'docs/film-factory/pipeline/runs/pilot/pilot-ledger.json'), JSON.stringify({ ceiling: 6.08, spent: 1.53, remaining: 4.55, attempts: 8, maxAttempts: 8 }));
  writeFileSync(join(root, 'docs/film-factory/pipeline/runs/validation-av/av-ledger.json'), JSON.stringify({ ceiling: 6, spent: 3.3, remaining: 2.7, attempts: 10, maxAttempts: 10 }));
  // F10 freeze: one file + its real sha
  const content = 'FROZEN-F10-CANON';
  writeFileSync(join(f10, 'canon.json'), content);
  const sha = createHash('sha256').update(content).digest('hex');
  writeFileSync(join(f10, 'SHA256SUMS'), `${sha}  canon.json\n`);
  return root;
}

async function run() {
  // ============ (1) FRESH SESSION RESUMES FROM THE LAST VERIFIED CHECKPOINT ============
  {
    const root = fixture();
    const cp = recoverCheckpoint({ root });
    ok('resume: checkpoint recovered ok', cp.ok === true && cp.truthLock.compassFound);
    ok('resume: EXACT NEXT pointer extracted', /SC01 Astrid-read/.test(cp.exactNext || ''));
    ok('resume: lowercase prose does NOT shadow the uppercase pointer', !/need not restate/.test(cp.exactNext || ''));
    ok('resume: active cap + remaining + attempts from ledger (reality)', cp.activeCapEur === 15 && cp.remainingEur === 8.8 && cp.attemptsLeft === 1);
    ok('resume: total paid reconciled from all 3 ledgers', cp.totalPaidEur === 11.03);
    ok('resume: compass<->ledger drift detected, ledgers win', /LEDGERS WIN/.test(cp.paidSpendReconciliation.drift));
    ok('resume: F10 frozen verified byte-for-byte', cp.f10Frozen === true && cp.f10Detail.checked === 1);
  }

  // ============ (2) COMPLETED ASSETS ARE NOT REPEATED ============
  {
    const root = fixture();
    const cp = recoverCheckpoint({ root });
    ok('no-repeat: completed assets surfaced', cp.completedDoNotRepeat.length === 1 && cp.completedDoNotRepeat[0].clip === 'E1');
    ok('no-repeat: nothing ACCEPTED yet => film not finished', cp.nothingAccepted === true);
    // and the real runner is idempotent: a second pass over an already-present asset spends nothing
    const dir = join(tmpdir(), `odg-oc-idem-${process.pid}-${_n++}`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SC01-SH01.mp4'), 'present'); // asset already present
    const ledger = new PersistentLedger(134, join(dir, 'l.json'), { maxAttempts: 2000 });
    const adapter = { generate: async () => { throw new Error('should not be called for a present asset'); } };
    const r = await runCampaign({ adapter, ledger, shots: [{ id: 'SC01-SH01', scene: 'SC01', mediaCategory: 'PREMIUM_VIDEO' }], outDir: dir, dryRun: false, statePath: join(dir, 's.json') });
    ok('no-repeat: present asset skipped, no spend, no gen call', r.skipped === 1 && r.processed === 0 && ledger.snapshot().spent === 0);
  }

  // ============ (3) APPLICABLE LESSONS ARE LOADED + APPLIED ============
  {
    const root = fixture();
    const learning = loadLearning(root);
    const got = retrieveLessons(learning, { model: 'bytedance/seedance-2.5', subject: 'BJORN', prompt: 'Björn hero shot' });
    ok('lessons: retrieve surfaces PL-2 for seedance+Björn', got.some(l => l.id === 'PL-2'));
    const g = lessonGuards({ model: 'bytedance/seedance-2.5', usesFaceRef: true, subject: 'BJORN', prompt: 'Björn' }, learning);
    ok('lessons: PL-2 fires BLOCK on seedance+Björn face-ref', g.allow === false && g.blocks.some(b => b.id === 'PL-2'));
    // FALSE-POSITIVE guard: "a child\'s carved wooden horse" must NOT trip PL-9 (no peril term)
    const g2 = lessonGuards({ prompt: "ties off a sheet, a child's carved wooden horse in his belt" }, learning);
    ok('lessons: PL-9 does NOT false-fire on an incidental child prop', g2.allow === true);
    // TRUE-POSITIVE: child + drowning -> BLOCK
    const g3 = lessonGuards({ prompt: 'a child goes overboard, drowning in the surge' }, learning);
    ok('lessons: PL-9 fires on genuine child-in-peril', g3.blocks.some(b => b.id === 'PL-9'));
  }

  // ============ (4) PAID CALLS RESPECT AUTHORIZATION (cap + attempts + known-failure) ============
  {
    const root = fixture();
    // authorization gate: worst-case over remaining cap is refused
    ok('authz: over-cap refused', authorizationGate({ spentEur: 14.8, worstCaseEur: 0.6, capEur: 15 }).allow === false);
    ok('authz: within-cap allowed', authorizationGate({ spentEur: 6.2, worstCaseEur: 0.6, capEur: 15, attemptsLeft: 1 }).allow === true);
    ok('authz: attempt cap refused', authorizationGate({ spentEur: 0, worstCaseEur: 0.6, capEur: 15, attemptsLeft: 0 }).allow === false);
    // full preflight: no timeline position => refused even if cheap+safe
    const pf = preflightForGeneration({ model: 'minimax', prompt: 'safe', worstCaseEur: 0.6, spentEur: 6.2, capEur: 15, attemptsLeft: 1 }, { root });
    ok('preflight: refuses a free-floating shot (no timeline position)', pf.allow === false && pf.violations.some(v => v.kind === 'NO_TIMELINE_POSITION'));
    // full preflight: valid position + within budget + safe + provider available => allowed
    const pf2 = preflightForGeneration({ model: 'minimax', subject: 'ASTRID', prompt: 'Astrid reads the sea', timelinePosition: 'SC01', worstCaseEur: 0.6, spentEur: 6.2, capEur: 15, attemptsLeft: 1, providerAvailable: true }, { root });
    ok('preflight: allows a positioned, budgeted, safe, provider-available shot', pf2.allow === true);
    // provider credential absent => a paid call is refused (no blind attempt)
    const pf3 = preflightForGeneration({ model: 'minimax', subject: 'ASTRID', prompt: 'Astrid reads the sea', timelinePosition: 'SC01', worstCaseEur: 0.6, spentEur: 6.2, capEur: 15, attemptsLeft: 1, providerAvailable: false }, { root });
    ok('preflight: refuses a paid call when provider credential is absent', pf3.allow === false && pf3.violations.some(v => v.kind === 'PROVIDER_UNAVAILABLE'));
    ok('providerAvailable(): true only with a non-empty env token', providerAvailable({ REPLICATE_API_TOKEN: 'x' }) === true && providerAvailable({}) === false && providerAvailable({ REPLICATE_API_TOKEN: '  ' }) === false);
    // secure-file source (injectable path): presence recognised across authorized sources; value never surfaced
    const secDir = join(tmpdir(), `odg-oc-sec-${process.pid}-${_n++}`); mkdirSync(secDir, { recursive: true });
    // deliberately NON-secret-shaped sentinel (won't trip secret scanners); only presence/loading is tested
    const FAKE = 'FAKE-not-a-real-token-DO-NOT-USE';
    const secFile = join(secDir, 'replicate.env'); writeFileSync(secFile, 'REPLICATE_API_TOKEN=' + FAKE + '\n');
    ok('providerCredentialAvailable: true from secure file when env empty', providerCredentialAvailable({ env: {}, secureFile: secFile }) === true);
    ok('providerCredentialAvailable: false when neither env nor file', providerCredentialAvailable({ env: {}, secureFile: join(secDir, 'nope.env') }) === false);
    const fakeEnv = {}; const meta = loadProviderTokenIntoEnv({ env: fakeEnv, secureFile: secFile });
    ok('loadProviderTokenIntoEnv: loads into the given env (in-process only)', meta.loaded === true && meta.source === 'file' && fakeEnv.REPLICATE_API_TOKEN === FAKE);
    ok('loadProviderTokenIntoEnv: metadata never contains the token value', !JSON.stringify(meta).includes('not-a-real-token'));
    ok('loadProviderTokenIntoEnv: missing file => not loaded, no throw', loadProviderTokenIntoEnv({ env: {}, secureFile: join(secDir, 'nope.env') }).loaded === false);
    // ENFORCED IN THE REAL RUNNER: a BLOCK-lesson op is refused before any paid call (no spend)
    const dir = join(tmpdir(), `odg-oc-block-${process.pid}-${_n++}`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const ledger = new PersistentLedger(134, join(dir, 'l.json'), { maxAttempts: 2000 });
    let called = 0; const adapter = { generate: async ({ worstCaseCostEur }) => { called++; const rid = ledger.reserve(worstCaseCostEur, 'x'); ledger.settle(rid, worstCaseCostEur); return { status: 'SUCCEEDED', ok: true, paid: true, costEur: worstCaseCostEur, outputUrls: ['u'] }; } };
    // inject a stub OC that BLOCKS the second shot (proves the runner consults + honours the guard per shot)
    const stubOC = { lessonGuards: (octx) => octx.scene === 'SC02' ? { blocks: [{ id: 'PL-X', message: 'blocked by test' }], warns: [] } : { blocks: [], warns: [] } };
    const r = await runCampaign({ adapter, ledger, operatingContract: stubOC, shots: [{ id: 'SC01-SH01', scene: 'SC01', mediaCategory: 'STILL_ANIMATABLE' }, { id: 'SC02-SH01', scene: 'SC02', mediaCategory: 'STILL_ANIMATABLE' }], outDir: dir, dryRun: false, statePath: join(dir, 's.json'), download: async (u, d) => { writeFileSync(d, 'm'); return { sha256: 'x' }; }, ciqe: () => ({ worstSeverity: 'OK' }) });
    ok('runner: BLOCK-lesson shot recorded PREFLIGHT_BLOCKED', r.records.some(x => x.id === 'SC02-SH01' && x.status === 'PREFLIGHT_BLOCKED'));
    ok('runner: the blocked shot never reached the adapter (no paid call)', called === 1);
  }

  // ============ (5) EXIT RECORDS CONTAIN A VERIFIED NEXT ACTION ============
  {
    const root = fixture();
    const complete = { truthLock: 'HEAD xyz', spentEur: 6.2, remainingEur: 8.8, attemptsLeft: 1, f10Frozen: true, nextAction: 'generate SC01 Astrid-read (minimax, €0.60)', evidence: ['t1-ledger.json'] };
    ok('exit: a complete exit record validates', validateExitRecord(complete, root).ok === true);
    ok('exit: a missing nextAction is rejected', validateExitRecord({ ...complete, nextAction: undefined }, root).ok === false);
    ok('exit: a placeholder nextAction ("continue") is rejected', validateExitRecord({ ...complete, nextAction: 'continue' }, root).ok === false);
    ok('exit: a missing truthLock is rejected', validateExitRecord({ ...complete, truthLock: undefined }, root).missing.includes('truthLock'));
  }

  // ============ CANONICAL CONTRACT INTEGRITY (the real repo files, not fixtures) ============
  {
    const c = loadContract(REPO_ROOT);
    ok('canon: operating-contract.json loads with 10 invariants', c.invariants.length === 10);
    ok('canon: locked distribution is 64/13/10/5/5/3', c.lockedDistribution.ACTION === 64 && c.lockedDistribution.DRAMA === 5 && c.lockedDistribution.WORLD === 3);
    ok('canon: the real F10 freeze is intact (8 files sha-verified)', verifyF10(REPO_ROOT).ok === true && verifyF10(REPO_ROOT).checked === 8);
    const realLearning = loadLearning(REPO_ROOT);
    ok('canon: every real lesson has an executable guard', realLearning.mandatoryLessons.every(l => l.guard && l.guard.severity && l.guard.rule));
  }

  console.log(`\nOPERATING-CONTRACT TESTS: ${fail === 0 ? 'PASS' : 'FAIL'} (pass=${pass} fail=${fail})` + (fail ? ` [${fails.join(', ')}]` : ''));
  process.exit(fail === 0 ? 0 : 1);
}
run().catch(e => { console.log('HARNESS ERROR', e); process.exit(2); });
