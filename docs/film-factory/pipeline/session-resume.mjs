// SESSION-RESUME ENTRY POINT — run this FIRST at every new session/mission/recovery.
//   node docs/film-factory/pipeline/session-resume.mjs
// Loads the operating contract, recovers the last verified checkpoint, reconciles compass<->ledgers
// (reality wins), retrieves applicable lessons, and prints the exact next production action.
// Read-only; no network; no paid call; no secrets. Exit 0 if a checkpoint was recovered, 2 otherwise.
import { summarizeForResume } from './operating-contract.mjs';

const s = summarizeForResume({});
const cp = s.checkpoint;
const L = (k, v) => console.log(k.padEnd(22) + v);

console.log('\n╔══ ODG F11 OPERATING METHOD — SESSION RESUME ══╗');
L('contract', `v${s.contract.version}  (${s.contract.invariants} invariants, ${s.lessons} lessons)`);
L('compass latest', cp.truthLock.latestEntry || '(none)');
L('F10 frozen', cp.f10Frozen ? `YES (${cp.f10Detail.checked}/${cp.f10Detail.checked} sha-verified)` : `NO — ${JSON.stringify(cp.f10Detail.bad)}`);
L('timeline SSOT', cp.timelineSSOT ? `${cp.timelineSSOT.totalScenes} scenes, ${cp.timelineSSOT.scenesWithAssets} with assets` : '(missing)');
L('active cap (t1)', `€${cp.activeCapEur} | spent €${cp.spentEur} | remaining €${cp.remainingEur} | attempts left ${cp.attemptsLeft}`);
L('total paid (all)', `€${cp.totalPaidEur}  (t1+pilot+av; ledgers are reality)`);
if (cp.paidSpendReconciliation.drift !== 'none') L('RECONCILE', cp.paidSpendReconciliation.drift);
L('completed assets', `${cp.completedDoNotRepeat.length} present — DO NOT regenerate; ${cp.nothingAccepted ? 'none ACCEPTED yet (film NOT finished)' : 'some ACCEPTED'}`);
L('lessons available', `${cp.lessonsAvailable} (run their preflight guards before any paid call)`);
L('relevant lessons', (cp.relevantLessons || []).map(l => l.id).join(', ') || '(none matched this context)');

console.log('\n── EXACT NEXT (from the compass pointer) ──');
console.log(cp.exactNext || '(no EXACT NEXT line found in compass head — write one on exit)');
console.log('\n── RESUME PROTOCOL ──');
for (const step of s.resumeProtocol) console.log('  ' + step);
console.log('');

process.exit(cp.ok && cp.truthLock.compassFound ? 0 : 2);
