// Validates the HIGH-risk + benchmark prompt register against F10 and the shot-list. READ-ONLY, no media.
// Fails closed on: unknown shot id, sceneHead mismatch, a ref claimed to exist (not TO_CREATE), a scriptAnchor
// that is NOT verbatim in F10 (fabricated grounding), a missing required field, or altered pre-set thresholds.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const R = JSON.parse(readFileSync(join(here, 'prompt-register-highrisk-benchmark-f10.json'), 'utf8'));
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');
const byId = Object.fromEntries(SL.shots.map(s => [s.id, s]));
const norm = t => t.replace(/\s+/g, ' ').trim();   // collapse line-wraps for verbatim-in-F10 checks
const F10n = norm(F10);

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++) : (fail++, console.log('  FAIL ' + n));

// Pre-set thresholds unchanged (set before any test).
const T = R.preSetThresholds;
ok('thresholds: identity≥4', T.identityMinPer5 === 4);
ok('thresholds: €/usable-sec ≤1.20', T.eurPerUsableSecMax === 1.20);
ok('thresholds: human≥7.5', T.humanQualityMin10 === 7.5);
ok('thresholds: ≤8 attempts', T.maxAttemptsPerShot === 8);
ok('thresholds: hard-stop €250', T.hardStopLedgerEur === 250);
ok('mission budget authorized = €0', R.budgetAuthorizedThisMission === 0);

const REQUIRED = ['id','role','scene','sceneHead','scriptAnchor','narrativeOutcome','charactersInFrame','locationRef','fullPrompt','acceptanceCriteria','rejectionCriteria','primaryMethod','cheaperAlternative','costEurEstimated','costStatus'];
const refStatusOk = ref => ref && ref.status === 'TO_CREATE';

for (const s of R.shots) {
  const tag = s.id;
  for (const f of REQUIRED) ok(`${tag}: has ${f}`, s[f] !== undefined && s[f] !== '');
  ok(`${tag}: exists in shot-list`, !!byId[s.id]);
  // shot-list truncates sceneHead to 50 chars; register carries the full F10 head → truncated must be its prefix.
  if (byId[s.id]) ok(`${tag}: sceneHead consistent with shot-list (prefix)`, s.sceneHead.startsWith(byId[s.id].sceneHead));
  if (byId[s.id]) ok(`${tag}: register sceneHead is verbatim F10`, F10n.includes(norm(s.sceneHead)));
  ok(`${tag}: scriptAnchor is verbatim F10`, F10n.includes(norm(s.scriptAnchor)));
  ok(`${tag}: location ref TO_CREATE (not claimed existing)`, refStatusOk(s.locationRef));
  ok(`${tag}: all char refs TO_CREATE`, (s.charactersInFrame || []).every(refStatusOk));
  ok(`${tag}: all prop refs TO_CREATE`, (s.propsRef || []).every(refStatusOk));
  ok(`${tag}: cost is ESTIMATED (not measured)`, s.costStatus === 'ESTIMATED');
  ok(`${tag}: acceptance criteria non-empty`, Array.isArray(s.acceptanceCriteria) && s.acceptanceCriteria.length >= 3);
}

// Coverage: the 3 HIGH + the 5 benchmark roles are all present.
const highIds = ['SC40-SH06','SC40-SH07','SC40-SH08'];
ok('all 3 HIGH shots specced', highIds.every(id => R.shots.some(s => s.id === id && s.role === 'HIGH')));
const roles = new Set(R.shots.map(s => s.benchmark));
for (const b of ['B1-hero','B2-water-crowd','B3-intimate-FR-voice','B4-establisher-savings','B5a-continuity-wound-inflicted','B5b-continuity-wound-healed'])
  ok(`benchmark role present: ${b}`, roles.has(b));

// Establisher substitution: all 15 ids exist + are wide establishers + saving is tagged ESTIMATED.
const sub = R.establisherSubstitution;
ok('establisher set = 15 shots', sub.shots.length === 15);
ok('establisher saving tagged ESTIMATED', /ESTIMATED/.test(sub.savingStatus) && !/measured/i.test(sub.savingStatus.replace('NOT measured','')));
ok('each establisher is a real wide establisher shot', sub.shots.every(id => byId[id] && /WIDE/.test(byId[id].shotType)));
ok('per-shot saving = €3.65 and total = €54.75', sub.perShotSavingEur === 3.65 && sub.estimatedTotalSavingEur === 54.75);
ok('establisher invalidation conditions documented', Array.isArray(sub.invalidatedIf) && sub.invalidatedIf.length >= 2);

const total = pass + fail;
console.log(`prompt-register-check: ${pass}/${total} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
