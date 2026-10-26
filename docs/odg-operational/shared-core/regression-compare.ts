// @ts-nocheck
// SHARED-CORE regression comparator (Domain-B) — an EXECUTED "was-green, now-red" comparator over two run
// snapshots. Closes the Domain-B inventory gap: recurrence analysis existed, but no comparator that proves a
// regression by diffing baseline vs current. Pure, deterministic, €0. Complements runtime/core improvement-baseline
// (captures signals) — this is the diff/verdict on top.

// snapshot = [{id, status: 'PASS'|'FAIL'|'SKIP'|..., value?: number}]. For status: PASS->FAIL is a regression.
// For numeric value: provide metrics[{id, direction: 'higher-better'|'lower-better', tolerance?}] to detect
// value regressions (worsening beyond tolerance) even when status stays PASS.
export function compareRuns(baseline, current, { metrics = [] } = {}) {
  const b = new Map(baseline.map(x => [x.id, x]));
  const c = new Map(current.map(x => [x.id, x]));
  const metricById = new Map(metrics.map(m => [m.id, m]));
  const regressions = [], fixes = [], unchanged = [], added = [], removed = [], valueRegressions = [];

  for (const [id, cur] of c) {
    const prev = b.get(id);
    if (!prev) { added.push(id); continue; }
    const wasPass = prev.status === 'PASS', isPass = cur.status === 'PASS';
    if (wasPass && !isPass) regressions.push({ id, from: prev.status, to: cur.status });
    else if (!wasPass && isPass) fixes.push({ id, from: prev.status, to: cur.status });
    else unchanged.push(id);
    // numeric regression (independent of status flip)
    const m = metricById.get(id);
    if (m && typeof prev.value === 'number' && typeof cur.value === 'number') {
      const tol = m.tolerance ?? 0;
      const worse = m.direction === 'lower-better' ? (cur.value - prev.value > tol) : (prev.value - cur.value > tol);
      if (worse) valueRegressions.push({ id, from: prev.value, to: cur.value, direction: m.direction });
    }
  }
  for (const id of b.keys()) if (!c.has(id)) removed.push(id);

  const hasRegression = regressions.length > 0 || valueRegressions.length > 0;
  return {
    hasRegression,
    verdict: hasRegression ? 'REGRESSED' : (fixes.length ? 'IMPROVED' : 'STABLE'),
    regressions, valueRegressions, fixes, added, removed,
    unchangedCount: unchanged.length,
    summary: `${regressions.length} status-regressions, ${valueRegressions.length} value-regressions, ${fixes.length} fixes, ${added.length} added, ${removed.length} removed`,
  };
}
