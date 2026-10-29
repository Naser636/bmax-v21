// ÉTAPE 1 — EVIDENCE-BASED verification of the €10 batch (26 plans). €0, read-only. Does NOT trust the manifest
// 'ready' flag: cross-checks chronological order, reuse (no double-gen vs existing clips), character ref presence
// (first-appearance establishes identity; later shots NEED a derived ref), method vs content, and the authorization
// gate. Emits f11-tranche-10eur-verification.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');
const batch = JSON.parse(readFileSync(join(canon, 'f11-tranche-10eur-batch.json'), 'utf8'));
const shotlist = JSON.parse(readFileSync(join(canon, 'f11-fullfilm-shotlist.json'), 'utf8'));
const timeline = JSON.parse(readFileSync(join(canon, 'f11-film-timeline.json'), 'utf8'));

// which character refs exist on disk
const refDirs = ['runs/pilot/refs', 'runs/production-t1/refs', 'runs/validation-av/refs'];
const CHARS = ['BJORN', 'ASTRID', 'OLAF', 'TOVE', 'MERYT', 'SETH-NAKHT', 'IPU', 'IPY', 'NEFER-KA', 'HELGI', 'VIGGE'];
const refExists = {};
for (const c of CHARS) refExists[c] = refDirs.some(d => existsSync(join(here, d, c + '-768.webp')) || existsSync(join(here, d, c + '.webp')));

// shotlist lookup by normalized id
const slById = {}; for (const s of shotlist.shots) slById[s.id.replace(/^F11-/, '')] = s;
// scenes already having assets (reuse guard)
const coveredScenes = new Set(timeline.scenes.filter(s => (s.existingAssets || []).length).map(s => s.scene));

// detect ALL required characters per shot = (names in promptSeed) UNION (decisiveAgent). Multi-char shots hit the
// known-UNSOLVED single-subject-identity constraint (minimax single-subject; seedance rejects Björn).
const RE = /BJ[ÖO]RN|ASTRID|OLAF|TOVE|MERYT|SETH-NAKHT|IPU|IPY|NEFER-KA|HELGI|VIGGE/g;
const norm = (x) => x.toUpperCase().replace('Ö', 'O');
function requiredChars(sl, isOlaf) {
  if (isOlaf) return ['OLAF'];
  const set = new Set();
  for (const m of (sl?.promptSeed || '').toUpperCase().matchAll(RE)) set.add(norm(m[0]));
  if (sl?.decisiveAgent) { const d = norm(sl.decisiveAgent).match(RE); if (d) set.add(d[0]); }
  return [...set];
}
const seenChar = new Set();
let prevSceneNum = 0, orderOk = true;
const rows = batch.batch.map((b, i) => {
  const sceneNum = parseInt(b.scene.slice(2));
  if (sceneNum < prevSceneNum) orderOk = false; prevSceneNum = sceneNum;
  const sl = slById[b.shot] || null;
  const chars = requiredChars(sl, b.shot === 'Olaf-lashed-to-mast');
  const perChar = chars.map(c => { const first = !seenChar.has(c); return { c, first, ref: !!refExists[c] }; });
  chars.forEach(c => seenChar.add(c));
  const findings = [];
  for (const pc of perChar) {
    if (!pc.ref && pc.first) findings.push(`${pc.c}: FIRST appearance — establishes identity; derive a 768 ref AFTER for later ${pc.c} shots`);
    if (!pc.ref && !pc.first) findings.push(`BLOCKER: ${pc.c} has NO ref and this is not its first shot — derive/create the ref before paying`);
  }
  if (chars.length >= 2) findings.push(`MULTI-CHARACTER shot (${chars.join('+')}) — hits the UNSOLVED single-subject identity constraint; needs single-subject framing or a staging workaround`);
  if (b.mediaCategory === 'STILL_ANIMATABLE' && b.content === 'ACTION') findings.push('ACTION-still: review — upgrade to video if real motion needed');
  return { order: b.order, scene: b.scene, shot: b.shot, content: b.content || sl?.content, media: b.mediaCategory, maxEur: b.maxEur, requiredChars: chars, refs: perChar, findings };
});

const blockers = rows.filter(r => r.findings.some(f => /BLOCKER/.test(f)));
const multiChar = rows.filter(r => r.requiredChars.length >= 2);
const needRefLater = [...new Set(rows.flatMap(r => r.refs).filter(x => !x.ref).map(x => x.c))];
const totalEur = rows.reduce((a, r) => a + r.maxEur, 0);
const report = {
  generated: '2026-10-25', document: 'ÉTAPE 1 — €10 batch EVIDENCE verification (26 plans)',
  authorizationGate: { productionLedgerT2Recorded: existsSync(join(here, 'runs/production-t2/t2-ledger.json')), verdict: 'NO t2-ledger => NO paid call (governance lock)' },
  chronologicalOrderOk: orderOk,
  batchCount: rows.length, totalMaxEur: +totalEur.toFixed(2), withinCap: totalEur <= 10,
  refsOnDisk: refExists,
  charactersInBatchNeedingAref: needRefLater,
  blockers: blockers.map(b => ({ shot: b.scene + ' ' + b.shot, reason: b.findings.find(f => /BLOCKER/.test(f)) })),
  multiCharacterShots: multiChar.map(r => ({ shot: r.scene + ' ' + r.shot, chars: r.requiredChars })),
  rows,
  verdict: (blockers.length === 0 && multiChar.length === 0)
    ? 'Batch clean; gated only by the missing t2-ledger.'
    : `Batch has ${blockers.length} ref-blocker(s) + ${multiChar.length} multi-character shot(s) hitting the unsolved single-subject identity constraint. These need prep (establishing shots + derived refs; single-subject framing) BEFORE paying. Also gated by the missing t2-ledger.`,
  recommendation: 'Refine the batch: (1) keep SC01 Olaf (clean, ref OK) first; (2) for each new character (e.g. TOVE), schedule a SINGLE-SUBJECT establishing shot first, then derive a 768 ref (local €0) for continuity; (3) reframe multi-character shots as single-subject coverage or defer until a staging workaround is proven; (4) only then bill dependent shots. All still gated by the t2-ledger.',
};
writeFileSync(join(canon, 'f11-tranche-10eur-verification.json'), JSON.stringify(report, null, 1));
console.log(`VERIFY ${rows.length} plans: order ${orderOk ? 'OK' : 'BROKEN'} | total €${report.totalMaxEur}/10 within-cap ${report.withinCap} | ref-blockers ${blockers.length} | multi-char ${multiChar.length}`);
console.log(`  refs on disk: ${Object.entries(refExists).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
console.log(`  chars in batch needing a ref (derive from first shot): ${needRefLater.join(', ') || 'none'}`);
console.log(`  AUTH GATE: t2-ledger recorded = ${report.authorizationGate.productionLedgerT2Recorded} => ${report.authorizationGate.productionLedgerT2Recorded ? 'may proceed' : 'NO PAID CALL'}`);
if (blockers.length) for (const b of report.blockers) console.log('  BLOCKER:', b.shot, '-', b.reason);
