// @ts-nocheck
// DOMAIN-A DEMONSTRATOR — bounded multi-step orchestration reusing the shared-core dep-planner. Shows: dependency
// sequencing into parallel layers, deterministic execution, idempotent re-run (no duplicate effects), fail-closed
// safe-stop (a failed item SKIPS its dependents), per-step evidence, and NO-FALSE-SUCCESS (mission is BLOCKED, not
// "done", if any required item did not genuinely succeed — exit code alone proves nothing). Synthetic, €0, no I/O.
//
// This MIRRORS the real runtime/core pattern (capability-executors + idempotency-guard + mechanical-acceptance +
// checkpoint-engine) at demonstrator scale, consuming the shared planner. It does NOT replace them.
import { planLayers, schedule } from './dep-planner.js';

// Execute work items layer by layer. Items within a layer are independent (could run in parallel). `effects` is a
// shared ledger enabling idempotency: an item already recorded as done is RECONCILED, not re-run.
export function orchestrate(items, { run, effects = new Map() } = {}) {
  const layerPlan = planLayers(items);           // throws on cycle / unknown dep / dup id (fail-closed)
  const sched = schedule(items);
  const steps = []; const done = new Set(); const skipped = new Set();
  for (const layer of layerPlan) {
    for (const id of layer) {
      const item = items.find(i => i.id === id);
      // safe-stop: if any dependency failed/skipped, SKIP this item (never run on a broken precondition)
      const brokenDep = item.deps?.find(d => skipped.has(d) || (!done.has(d)));
      if (brokenDep) { skipped.add(id); steps.push({ id, status: 'SKIPPED', reason: `dependency ${brokenDep} not satisfied` }); continue; }
      if (effects.has(id)) { done.add(id); steps.push({ id, status: 'DUPLICATE', reason: 'already applied — reconciled, not re-run', evidence: effects.get(id) }); continue; }
      let res; try { res = run(item); } catch (e) { res = { ok: false, error: String(e.message) }; }
      if (res && res.ok) { effects.set(id, res.evidence ?? true); done.add(id); steps.push({ id, status: 'DONE', evidence: res.evidence ?? true }); }
      else { skipped.add(id); steps.push({ id, status: 'FAILED', reason: res?.error || 'run returned not-ok' }); }
    }
  }
  const required = items.filter(i => i.required !== false).map(i => i.id);
  const allRequiredDone = required.every(id => done.has(id));
  // NO-FALSE-SUCCESS: success is a FACT about effects, not about reaching the end of the loop.
  const verdict = allRequiredDone ? 'SUCCESS' : (done.size > 0 ? 'PARTIAL' : 'BLOCKED');
  return { verdict, schedule: sched, steps, done: [...done], skipped: [...skipped], allRequiredDone };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Synthetic pipeline: ingest -> (validate, fetch-rates) -> reconcile -> verify -> report
  const items = [
    { id: 'ingest', domain: 'C' },
    { id: 'validate', domain: 'C', deps: ['ingest'] },
    { id: 'fetch-rates', domain: 'C', deps: ['ingest'] },
    { id: 'reconcile', domain: 'C', deps: ['validate', 'fetch-rates'] },
    { id: 'verify', domain: 'B', deps: ['reconcile'] },
    { id: 'report', domain: 'A', deps: ['verify'] },
  ];
  const okRun = () => ({ ok: true, evidence: 'artifact#' + Math.round(1) });

  console.log('=== Scenario 1: clean run ===');
  const r1 = orchestrate(items, { run: okRun });
  console.log('layers:', JSON.stringify(r1.schedule.layers.map(l => l.items)));
  console.log('verdict:', r1.verdict, '| done:', r1.done.length, '| skipped:', r1.skipped.length);

  console.log('=== Scenario 2: idempotent re-run (effects preserved) ===');
  const effects = new Map(r1.done.map(id => [id, 'artifact#1']));
  const r2 = orchestrate(items, { run: okRun, effects });
  console.log('verdict:', r2.verdict, '| DUPLICATEs:', r2.steps.filter(s => s.status === 'DUPLICATE').length, '(no re-run)');

  console.log('=== Scenario 3: adversarial — "reconcile" fails => dependents safe-stopped, NO false success ===');
  const r3 = orchestrate(items, { run: (it) => it.id === 'reconcile' ? { ok: false, error: 'simulated reconcile failure' } : { ok: true, evidence: 'ok' } });
  console.log('verdict:', r3.verdict, '(must NOT be SUCCESS)');
  console.log('skipped-after-failure:', r3.steps.filter(s => s.status === 'SKIPPED').map(s => s.id));
  const exitOk = r1.verdict === 'SUCCESS' && r2.steps.some(s => s.status === 'DUPLICATE') && r3.verdict !== 'SUCCESS';
  console.log(exitOk ? 'DEMO-A: PASS' : 'DEMO-A: FAIL');
  process.exit(exitOk ? 0 : 1);
}
