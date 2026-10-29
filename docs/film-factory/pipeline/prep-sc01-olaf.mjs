// Phase 5/7 PREP (no paid call): build the ready-to-fire SC01 Olaf-lashed-to-mast shot spec, confirm the ref,
// and run the operating-contract preflight to prove it is blocked ONLY by the attempt cap (everything else green).
// Writes sc01-olaf-mast-shot.json. Pure: preflight is read-only; NO network, NO spend.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyStyle } from './style-lock-f10.mjs';
import { preflightForGeneration, providerCredentialAvailable, loadProviderTokenIntoEnv, providerAvailable } from './operating-contract.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'runs/production-t1');
const REFREL = 'runs/production-t1/refs/OLAF-768.webp'; // 768px best-practice ref (matches ASTRID-768; lowers retry risk)
const refPath = join(here, REFREL);
const refOk = existsSync(refPath);

// canon-correct SC01 continuity prompt: OLAF lashed to the mast, failing but with captain's bearing
const PROMPT = applyStyle('EXT. NORTH SEA — STORM — NIGHT. OLAF, a Norse sea-captain in his 60s, grey as ash and failing, LASHED UPRIGHT TO THE MAST of the wooden longship SŌLFARI by ropes across his chest; heavy Norse wool cloak soaked through, a bronze arm-ring on his forearm; too weak to stand unaided yet holding a captain\'s bearing, eyes fixed ahead into the black storm. Rain and sea-spray, cold moonless dark, the ship pitching on hill-high black waves; cinematic photoreal, cold steel-grey palette, steady readable framing. Historical Viking longship, mast and rigging of wood and rope — no modern objects.');

loadProviderTokenIntoEnv(); // in-process only; value never surfaced
const ledger = new PersistentLedger(15, join(OUT, 't1-ledger.json'), { maxAttempts: 20 });
const snap = ledger.snapshot();
const attemptsLeft = snap.maxAttempts - snap.attempts;

const op = {
  model: 'minimax/video-01', subject: 'OLAF', usesFaceRef: true, prompt: PROMPT, scene: 'SC01',
  timelinePosition: 'SC01:olaf-lashed-to-mast', worstCaseEur: 0.60,
  spentEur: snap.spent, capEur: 15, attemptsLeft, providerAvailable: providerAvailable(process.env),
};
const pf = preflightForGeneration(op);
const onlyAttemptBlock = pf.violations.every(v => v.kind === 'AUTHORIZATION' && /attempt cap/i.test(v.message));

const spec = {
  generated: '2026-10-25', shot: 'SC01-olaf-mast', scene: 'SC01', chronoPos: 'after Astrid-read, before Björn-oar climax',
  narrativeFunction: 'introduce OLAF (failing captain) lashed to the mast — sets up the Olaf→Björn leadership handoff; bronze arm-ring = SC43 continuity seed',
  model: 'minimax/video-01', inputTemplate: { prompt: PROMPT, subject_reference: '<data-uri of ' + REFREL + '>' },
  ref: { path: REFREL, present: refOk, note: refOk ? 'OLAF-768.webp (768x988, matches ASTRID-768 best-practice pattern; prepped €0 from 896x1152 source)' : 'MISSING — prep required' },
  worstCaseEur: 0.60, continuity: ['storm/night + cold steel-grey (matches SC01 clips)', 'steering-oar ship, no wheel', 'bronze arm-ring (SC43 handoff seed)', 'OLAF 60s grey/failing per character-registry'],
  acceptanceCriteria: 'OLAF identity consistent; readable lashed-to-mast staging; full-motion human >=7.5/10; audio added in post',
  preflight: { allow: pf.allow, violations: pf.violations.map(v => v.kind), detail: pf.violations.map(v => v.message), warns: pf.warns.map(w => w.id), providerAvailable: op.providerAvailable, attemptsLeft },
  readiness: pf.allow ? 'READY (would fire)' : (onlyAttemptBlock ? 'READY — blocked ONLY by attempt cap; fires the instant a new tranche raises maxAttempts' : 'NOT READY — other blockers: ' + pf.violations.map(v => v.kind).join(',')),
  status: 'PREPARED (not generated)',
};
writeFileSync(join(here, '..', 'canon', 'F11_PROPOSED', 'sc01-olaf-mast-shot.json'), JSON.stringify(spec, null, 1));
console.log('OLAF shot PREPARED | ref present:', refOk, '| provider:', op.providerAvailable, '| attemptsLeft:', attemptsLeft);
console.log('preflight allow:', pf.allow, '| violations:', JSON.stringify(pf.violations.map(v => v.kind)), '| blocked ONLY by attempt cap:', onlyAttemptBlock);
console.log('readiness:', spec.readiness);
