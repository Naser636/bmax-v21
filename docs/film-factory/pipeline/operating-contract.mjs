// ODG F11 PERMANENT OPERATING METHOD — executable enforcement.
// This module makes the operating contract (operating-contract.json) and the learning ledger
// (f11-production-learning-ledger.json) ACTIVE, not prose: it recovers the last verified checkpoint,
// retrieves applicable lessons, enforces per-generation preflight guards + authorization, and validates
// the compass exit record. Pure/dependency-free (node:fs + node:crypto only); no network, no paid call,
// no secrets. Every film workflow entry point loads this; campaign-runner invokes the guards per shot.
import { readFileSync, existsSync, readSync, openSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

// Authorized protected credential file (mode 600; sourced by the caller at call time). Presence only — the
// token VALUE is never returned, logged, hashed or copied anywhere by this module.
export const SECURE_TOKEN_FILE = join(homedir(), '.config', 'odg', 'replicate.env');
const TOKEN_VAR = 'REPLICATE_API_TOKEN';
function tokenFromFile(secureFile) {
  try {
    if (!existsSync(secureFile)) return null;
    const line = readFileSync(secureFile, 'utf8').split('\n').find(l => l.startsWith(TOKEN_VAR + '='));
    if (!line) return null;
    const val = line.slice(TOKEN_VAR.length + 1).trim().replace(/^["']|["']$/g, '');
    return val.length > 0 ? val : null;
  } catch { return null; }
}

const HERE = dirname(fileURLToPath(import.meta.url));
// repo root = .../bmax-v21 (pipeline is docs/film-factory/pipeline)
export const REPO_ROOT = join(HERE, '..', '..', '..');
const R = (root, rel) => join(root, rel);
function readJSON(p) { return JSON.parse(readFileSync(p, 'utf8')); }
function tryJSON(p) { try { return existsSync(p) ? readJSON(p) : null; } catch { return null; } }

// ---------- 1. LOAD CONTRACT ----------
export function loadContract(root = REPO_ROOT) {
  const p = R(root, 'docs/film-factory/pipeline/operating-contract.json');
  if (!existsSync(p)) throw new Error('OPERATING CONTRACT MISSING: ' + p);
  const c = readJSON(p);
  if (!Array.isArray(c.invariants) || c.invariants.length < 10) throw new Error('operating-contract.json: invariants incomplete');
  return c;
}

// read only the first `bytes` of a (possibly huge) file — the compass is ~1MB; never slurp it whole.
function readHead(p, bytes = 6000) {
  if (!existsSync(p)) return '';
  const fd = openSync(p, 'r'); try { const buf = Buffer.alloc(bytes); const n = readSync(fd, buf, 0, bytes, 0); return buf.slice(0, n).toString('utf8'); } finally { closeSync(fd); }
}

// ---------- 2. RECOVER THE LAST VERIFIED CHECKPOINT ----------
// Reads the compass head (bounded), the timeline SSOT, the learning ledger and the canonical ledgers.
// Returns a verified resume pointer. Reconciles compass<->ledger spend; reality (the ledger files) wins.
export function recoverCheckpoint({ root = REPO_ROOT } = {}) {
  const contract = (() => { try { return loadContract(root); } catch { return null; } })();
  const compassPath = R(root, 'ODG_PROJECT_STATE.md');
  const head = readHead(compassPath);
  // Case-SENSITIVE: REPRISE entries use the uppercase marker "EXACT NEXT"; lowercase prose ("the exact
  // next action") in surrounding guidance must NOT shadow the authoritative pointer. Require a separator
  // (":", " (", or " —") right after the marker so only a real pointer line matches.
  const exactNext = (head.match(/EXACT NEXT\s*(?:[:(]|—|\*)[^\n]*/) || [])[0] || null;
  const latestEntry = (head.match(/REPRISE[^\n]*/i) || [])[0] || null;

  const timeline = tryJSON(R(root, 'docs/film-factory/canon/F11_PROPOSED/f11-film-timeline.json'));
  const learning = tryJSON(R(root, 'docs/film-factory/pipeline/f11-production-learning-ledger.json'));

  // ledgers (reality)
  const led = (rel) => { const j = tryJSON(R(root, rel)); return j ? { spent: j.spent, remaining: j.remaining, cap: j.ceiling, attempts: j.attempts, maxAttempts: j.maxAttempts } : null; };
  const ledgers = {
    t1: led('docs/film-factory/pipeline/runs/production-t1/t1-ledger.json'),
    pilot: led('docs/film-factory/pipeline/runs/pilot/pilot-ledger.json'),
    av: led('docs/film-factory/pipeline/runs/validation-av/av-ledger.json'),
  };
  const totalPaidEur = Math.round(['t1', 'pilot', 'av'].reduce((a, k) => a + (ledgers[k]?.spent || 0), 0) * 100) / 100;

  // completed-do-not-repeat: assets already present on the timeline (resume idempotency signal)
  const completedDoNotRepeat = [];
  let scenesWithAssets = 0;
  if (timeline?.scenes) {
    for (const s of timeline.scenes) {
      const assets = s.existingAssets || [];
      if (assets.length) { scenesWithAssets++; for (const a of assets) completedDoNotRepeat.push({ scene: s.scene, clip: a.clip, status: a.status }); }
    }
  }
  const nothingAccepted = completedDoNotRepeat.every(a => a.status !== 'ACCEPTED');

  // F10 immutability
  const f10 = verifyF10(root);

  // compass<->reality reconciliation
  const compassSpentClaim = (head.match(/total\s+paid[^0-9]*([0-9]+\.[0-9]{2})/i) || [])[1];
  const reconciliation = {
    ledgerTotalPaidEur: totalPaidEur,
    compassClaim: compassSpentClaim ? +compassSpentClaim : null,
    drift: compassSpentClaim && Math.abs(+compassSpentClaim - totalPaidEur) > 0.005 ? `compass €${compassSpentClaim} != ledgers €${totalPaidEur} — LEDGERS WIN` : 'none',
  };

  return {
    ok: true,
    truthLock: { compassFound: !!head, latestEntry },
    contractLoaded: !!contract,
    contractVersion: contract?.version || null,
    exactNext,
    timelineSSOT: timeline ? { totalScenes: timeline.totalScenes, scenesWithAssets, reconciliation: timeline.reconciliation || null } : null,
    completedDoNotRepeat,
    nothingAccepted,
    activeCapEur: ledgers.t1?.cap ?? null,
    spentEur: ledgers.t1?.spent ?? null,
    remainingEur: ledgers.t1?.remaining ?? null,
    attemptsLeft: ledgers.t1 ? ledgers.t1.maxAttempts - ledgers.t1.attempts : null,
    totalPaidEur,
    ledgers,
    paidSpendReconciliation: reconciliation,
    f10Frozen: f10.ok,
    f10Detail: f10,
    lessonsAvailable: learning?.mandatoryLessons?.length || 0,
  };
}

// F10 frozen byte-for-byte (SHA256SUMS manifest)
export function verifyF10(root = REPO_ROOT) {
  const dir = R(root, 'docs/film-factory/canon/F10_FROZEN_2026-10-24');
  const manifest = join(dir, 'SHA256SUMS');
  if (!existsSync(manifest)) return { ok: false, reason: 'manifest missing', checked: 0 };
  const lines = readFileSync(manifest, 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/)).filter(x => x.length === 2);
  const bad = [];
  for (const [h, f] of lines) {
    const fp = join(dir, f);
    if (!existsSync(fp)) { bad.push(`${f}: missing`); continue; }
    const got = createHash('sha256').update(readFileSync(fp)).digest('hex');
    if (got !== h) bad.push(`${f}: sha mismatch`);
  }
  return { ok: bad.length === 0, checked: lines.length, bad };
}

// ---------- 3. LESSON RETRIEVAL + EXECUTABLE GUARDS ----------
export function loadLearning(root = REPO_ROOT) {
  const p = R(root, 'docs/film-factory/pipeline/f11-production-learning-ledger.json');
  return existsSync(p) ? readJSON(p) : { mandatoryLessons: [] };
}

function normUpper(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }

// retrieve lessons whose appliesWhen tags overlap the operation context (coarse, for display/recovery).
export function retrieveLessons(learning, context = {}) {
  const hay = normUpper([context.model, context.subject, context.prompt, context.scene, context.event, (context.tags || []).join(' ')].join(' '));
  return (learning?.mandatoryLessons || []).filter(l => (l.appliesWhen || []).some(t => hay.includes(normUpper(t))));
}

// Does a declarative guard rule FIRE for this op? (every present field must match)
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, term) => new RegExp('\\b' + escRe(term) + '\\b', 'i').test(text);
function ruleFires(rule, op) {
  if (!rule) return false;
  const prompt = String(op.prompt || '').toLowerCase();
  if (rule.model && !(new RegExp(rule.model, 'i')).test(op.model || '')) return false;
  if (rule.modelNot && (new RegExp(rule.modelNot, 'i')).test(op.model || '')) return false;
  if ('usesFaceRef' in rule && Boolean(op.usesFaceRef) !== rule.usesFaceRef) return false;
  if (rule.subject && normUpper(op.subject) !== normUpper(rule.subject)) return false;
  if (rule.event && op.event !== rule.event) return false;
  if (rule.promptIncludesAny && !rule.promptIncludesAny.some(s => prompt.includes(String(s).toLowerCase()))) return false;
  if (rule.promptMissingAll && rule.promptMissingAll.some(s => prompt.includes(String(s).toLowerCase()))) return false;
  // co-occurrence: each group (whole-word) must contribute at least one term (precise child-in-peril etc.)
  if (rule.promptCooccur && !rule.promptCooccur.every(group => group.some(w => hasWord(prompt, w)))) return false;
  return true;
}

// Evaluate every lesson guard against an op context. Returns BLOCK / WARN / RECOVERY findings.
export function lessonGuards(op = {}, learning = null, root = REPO_ROOT) {
  const L = learning || loadLearning(root);
  const blocks = [], warns = [], recoveries = [];
  for (const l of (L.mandatoryLessons || [])) {
    const g = l.guard; if (!g) continue;
    if (!ruleFires(g.rule, op)) continue;
    const f = { id: l.id, message: g.message, lesson: l.lesson };
    if (g.severity === 'BLOCK') blocks.push(f);
    else if (g.severity === 'RECOVERY') recoveries.push(f);
    else warns.push(f);
  }
  return { allow: blocks.length === 0, blocks, warns, recoveries };
}

// ---------- 4. AUTHORIZATION GATE ----------
// Worst-case exposure must fit the ACTIVE authorized cap AND an attempt must be available.
export function authorizationGate({ spentEur, worstCaseEur, capEur, attemptsLeft } = {}) {
  const reasons = [];
  if (typeof worstCaseEur !== 'number' || worstCaseEur < 0) reasons.push('worst-case exposure unknown');
  if (typeof capEur !== 'number') reasons.push('no authorized cap');
  else if (typeof spentEur === 'number' && (spentEur + (worstCaseEur || 0)) > capEur + 1e-9)
    reasons.push(`spend €${spentEur}+worst €${worstCaseEur} would exceed cap €${capEur}`);
  if (typeof attemptsLeft === 'number' && attemptsLeft <= 0) reasons.push('attempt cap reached');
  return { allow: reasons.length === 0, reasons };
}

// Provider credential availability (ENV only) — a paid call is impossible without it. Injectable env for tests.
export function providerAvailable(env = process.env) { return !!(env && env.REPLICATE_API_TOKEN && String(env.REPLICATE_API_TOKEN).trim()); }

// Availability across the AUTHORIZED sources: process env OR the protected secure file. Presence only — never
// the value. secureFile injectable for hermetic tests.
export function providerCredentialAvailable({ env = process.env, secureFile = SECURE_TOKEN_FILE } = {}) {
  if (providerAvailable(env)) return true;
  return tokenFromFile(secureFile) !== null;
}

// Load the credential into THIS process's env ONLY (no persistence, no logging, value never returned). Returns
// presence metadata only {loaded, source, length?}. Used by the paid-call caller right before a generation.
export function loadProviderTokenIntoEnv({ env = process.env, secureFile = SECURE_TOKEN_FILE } = {}) {
  if (providerAvailable(env)) return { loaded: true, source: 'env', length: String(env[TOKEN_VAR]).trim().length };
  const val = tokenFromFile(secureFile);
  if (!val) return { loaded: false, source: existsSync(secureFile) ? 'file(empty/no-var)' : 'none' };
  env[TOKEN_VAR] = val; // in-process only
  return { loaded: true, source: 'file', length: val.length };
}

// ---------- 5. THE SINGLE PREFLIGHT GATE (every paid call must pass) ----------
// op: { model, subject, usesFaceRef, prompt, scene, event, timelinePosition, worstCaseEur, spentEur, capEur, attemptsLeft, providerAvailable }
export function preflightForGeneration(op = {}, { learning = null, root = REPO_ROOT } = {}) {
  const violations = [];
  // (1) timeline position required (INV-2/INV-3) — no free-floating paid clip
  if (!op.timelinePosition) violations.push({ kind: 'NO_TIMELINE_POSITION', message: 'paid generation requires a scene/timeline position + purpose + acceptance test' });
  // (2) lesson guards (BLOCK-class)
  const g = lessonGuards(op, learning, root);
  for (const b of g.blocks) violations.push({ kind: 'LESSON_BLOCK', ...b });
  // (3) authorization (cap + attempts)
  const auth = authorizationGate(op);
  if (!auth.allow) for (const r of auth.reasons) violations.push({ kind: 'AUTHORIZATION', message: r });
  // (4) provider availability — a billable call (worstCaseEur>0) is impossible without the credential.
  //     Only blocks when the caller explicitly asserts providerAvailable===false (never blind-attempt a paid call).
  if ((op.worstCaseEur || 0) > 0 && op.providerAvailable === false)
    violations.push({ kind: 'PROVIDER_UNAVAILABLE', message: 'provider credential (REPLICATE_API_TOKEN) not available — a paid call cannot be issued; do not attempt' });
  return { allow: violations.length === 0, violations, warns: g.warns, recoveries: g.recoveries, lessonsApplied: (learning || loadLearning(root)).mandatoryLessons?.map(l => l.id) || [] };
}

// ---------- 6. EXIT RECORD VALIDATION ----------
export function validateExitRecord(entry = {}, root = REPO_ROOT) {
  let required = ['truthLock', 'spentEur', 'remainingEur', 'attemptsLeft', 'f10Frozen', 'nextAction', 'evidence'];
  try { required = loadContract(root).exitRecordSchema.required; } catch { /* use default */ }
  const missing = required.filter(k => entry[k] === undefined || entry[k] === null || entry[k] === '');
  // nextAction must be concrete, not a placeholder
  if (!missing.includes('nextAction') && /^(continue|tbd|next|resume)\.?$/i.test(String(entry.nextAction).trim())) missing.push('nextAction(concrete)');
  return { ok: missing.length === 0, missing };
}

// ---------- 7. RESUME SUMMARY (CLI payload) ----------
export function summarizeForResume({ root = REPO_ROOT } = {}) {
  const contract = loadContract(root);
  const cp = recoverCheckpoint({ root });
  const learning = loadLearning(root);
  return { contract: { version: contract.version, invariants: contract.invariants.length }, checkpoint: cp, lessons: learning.mandatoryLessons?.length || 0, resumeProtocol: contract.resumeProtocol };
}
