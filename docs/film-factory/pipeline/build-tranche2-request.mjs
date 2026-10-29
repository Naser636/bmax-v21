// §5 — single, clear, costed NEXT-TRANCHE authorization request. €0, read-only. Derives everything from the
// optimized budget + real ledgers. A REQUEST, not an authorization: no paid call runs until the CTO records a
// ceiling + attempt max in the system. Quality criteria UNCHANGED; reuses the 9 valid clips; no double-counting;
// already-paid spend excluded from the forward ask.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');
const R = (b, f) => JSON.parse(readFileSync(join(b, f), 'utf8'));
const budget = R(canon, 'f11-campaign-budget.json');
const dossier = R(canon, 'f11-production-resume-dossier.json');
const t1 = R(here, 'runs/production-t1/t1-ledger.json');
const pilot = R(here, 'runs/pilot/pilot-ledger.json');
const av = R(here, 'runs/validation-av/av-ledger.json');

const exp = budget.budgetScenarios_EUR.find(s => s.name === 'EXPECTED');
const pru = budget.budgetScenarios_EUR.find(s => s.name === 'PRUDENT');
const totalPaid = +(t1.spent + pilot.spent + av.spent).toFixed(2);
const missing = { video: budget.totals.missingVideo, still: budget.totals.missingStill, total: budget.totals.missingVideo + budget.totals.missingStill };

const req = {
  generated: '2026-10-25', document: 'F11 TRANCHE-2 AUTHORIZATION REQUEST (production resumption)',
  status: 'REQUEST — NOT an authorization. No paid call runs until a ceiling + attempt max is recorded + verified.',
  alreadyPaid_excludedFromAsk_EUR: { total: totalPaid, t1: t1.spent, pilot: pilot.spent, av: av.spent, note: 'historical; NOT part of this forward budget' },
  t1State: { cap: t1.ceiling, spent: t1.spent, remaining: t1.remaining, attempts: `${t1.attempts}/${t1.maxAttempts}`, attemptsLeft: t1.maxAttempts - t1.attempts, blocker: 'attempts EXHAUSTED — reserve() throws ATTEMPT CAP; €8.20 residue NOT spendable' },

  scopeOfWork: {
    reusableClipsKept: dossier.reusableAssets.length,
    missingToGenerate: missing,
    classification: budget.shotClassification.note,
    rule: 'video for ACTION (true motion); stills+Ken-Burns for STORY/WORLD/dialogue — per authoritative shotlist; NEVER a still where real motion is required',
    noDoubleCount: 'the 9 existing clips offset video shots; already-paid spend excluded',
  },

  costBreakdown_EUR: {
    video: { shots: missing.video, unit: 0.60, base: budget.totals.baseVideoEur },
    stills: { shots: missing.still, unit: 0.03, base: budget.totals.baseStillEur },
    voice: { lines: budget.totals.dialogueLines, unit: 0.10, base: budget.totals.voiceEur },
    music: { base: 0, note: 'CC0, per-file licence-verified' },
    sfx_ambience: { base: 0, note: 'CC0/synth if licence-clear, else licensed pack (verify) — currently temp synth WORK bed only' },
    mix: { base: 0, note: 'local ffmpeg work-mix €0; professional final mix = human/out-of-scope' },
    retryReserve: { expectedFactor: exp.retryFactor, prudentFactor: pru.retryFactor, note: 'applied to generation (video+stills) per accept-rate' },
    marginPct: 15,
  },

  scenarios: {
    EXPECTED: { total_EUR: exp.total_EUR, attempts: budget.authorizationNeeded.suggestedAttemptBudget.EXPECTED, acceptAssumed: '70%', costPerAcceptedMinute_EUR: exp.costPerAcceptedMinute_EUR },
    PRUDENT: { total_EUR: pru.total_EUR, attempts: budget.authorizationNeeded.suggestedAttemptBudget.PRUDENT, acceptAssumed: '55%', costPerAcceptedMinute_EUR: pru.costPerAcceptedMinute_EUR },
  },

  RECOMMENDED_AUTHORIZATION: {
    ceiling_EUR: pru.total_EUR,
    attemptMax: budget.authorizationNeeded.suggestedAttemptBudget.PRUDENT,
    likelyActual_EUR: exp.total_EUR,
    rationale: 'Authorize the PRUDENT envelope (€' + pru.total_EUR + ' / ' + budget.authorizationNeeded.suggestedAttemptBudget.PRUDENT + ' attempts) so retries never hit the cap mid-film; likely ACTUAL spend ≈ EXPECTED €' + exp.total_EUR + '. The ledger reserve-before-call enforces the ceiling; unused budget is never spent.',
    howToRecord: 'raise the production ledger ceiling + maxAttempts (new tranche id), e.g. a t2-ledger with ceiling=' + pru.total_EUR + ', maxAttempts=' + budget.authorizationNeeded.suggestedAttemptBudget.PRUDENT + '. ODG then auto-fires the prepared SC01 Olaf shot and proceeds chronologically.',
  },

  qualityCriteria_UNCHANGED: budget.qualityLocked,
  provenSavings: budget.savings.PROVEN.map(s => ({ id: s.id, deltaExpected_EUR: s.deltaExpected_EUR || null, detail: s.detail })),
  residualRisks: [
    'acceptance rate is the dominant uncertainty (measured only on a small curated sample)',
    'multi-character identity in one shot is UNSOLVED (minimax single-subject; seedance rejects Björn) — may force staging workarounds',
    'greatsword renders undersized on text (PL-3) — needs a greatsword-bearing ref',
    'final professional audio mix may be human/out-of-scope (beyond this video+voice budget)',
    'HYPOTHETICAL savings (reuse>1, provider arbitrage) NOT yet proven — not banked in this ask',
  ],
  firstActionsOnAuthorization: [
    '1) AUTO-FIRE prepared SC01 Olaf-lashed-to-mast (minimax €0.60; sc01-olaf-mast-shot.json; preflight READY)',
    '2) SC02 (STORY) → SC03 → ... → SC49 chronologically; video for ACTION, stills(Ken-Burns) for STORY/WORLD',
    '3) per shot: operating-contract preflight (timeline + lessons + authz + provider) BEFORE each call; reserve worst-case; on timeout reconcile read-only (PL-5)',
    '4) assemble each scene; add licence-verified audio; measure 64/13/10/5/5/3 on the rendered edit',
  ],
};
writeFileSync(join(canon, 'f11-tranche2-authorization-request.json'), JSON.stringify(req, null, 1));
console.log('TRANCHE-2 REQUEST written.');
console.log(`  already paid (excluded): €${totalPaid} | T1 attempts left ${req.t1State.attemptsLeft}`);
console.log(`  scope: reuse ${dossier.reusableAssets.length} | generate ${missing.video} video + ${missing.still} still`);
console.log(`  EXPECTED €${exp.total_EUR}/${req.scenarios.EXPECTED.attempts}att  |  PRUDENT €${pru.total_EUR}/${req.scenarios.PRUDENT.attempts}att`);
console.log(`  RECOMMEND authorize ceiling €${pru.total_EUR} + ${req.RECOMMENDED_AUTHORIZATION.attemptMax} attempts (likely actual €${exp.total_EUR})`);
console.log(`  quality criteria UNCHANGED (${budget.qualityLocked.length}); proven saving €217 (still-vs-video) banked`);
