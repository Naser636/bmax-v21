// SHARED-CORE dep-planner — a true dependency-ordered (topological) work-item planner. Closes the one capability
// the Domain-A inventory flagged as genuinely MISSING in runtime/core: a planner that sequences WORK ITEMS by their
// dependencies and surfaces which are independent (parallelisable). This is the "planificateur ODG commun" the
// three-domain campaign requires to run A/B/C lots in parallel where independent, sequenced where not.
// Pure, deterministic, €0, no I/O. Stable ordering (ties broken by input order then id).
//
// SCOPE NOTE: operational-workspace shared-core DEMONSTRATOR. Promotion into governed runtime/core is a SEPARATE
// authorized lot (not done here). runtime/core already has change-impact-graph (module deps) + mission-synthesizer
// (goal decomposition); this complements them with work-item execution scheduling, which the inventory found absent.

// items: [{id, deps?: string[], domain?: 'A'|'B'|'C', ...}]. Returns execution LAYERS: layer N contains every item
// whose deps are all satisfied by layers < N. Items within a layer are mutually independent ⇒ safe to run in parallel.
// Throws on unknown dependency (fail-closed) and on cycles (reports the cycle) — never silently drops work.
export function planLayers(items) {
  const byId = new Map();
  for (const it of items) {
    if (byId.has(it.id)) throw new Error('DUPLICATE_WORK_ITEM_ID: ' + it.id);
    byId.set(it.id, { ...it, deps: Array.isArray(it.deps) ? it.deps : [] });
  }
  // fail-closed: every declared dependency must exist
  for (const it of byId.values()) for (const d of it.deps) if (!byId.has(d)) throw new Error(`UNKNOWN_DEPENDENCY: "${it.id}" depends on missing "${d}"`);

  const done = new Set(), layers = [];
  const order = [...byId.values()]; // input order = stable tie-break
  while (done.size < byId.size) {
    const ready = order.filter(it => !done.has(it.id) && it.deps.every(d => done.has(d)));
    if (ready.length === 0) {
      // remaining items form at least one cycle — report it
      const stuck = order.filter(it => !done.has(it.id)).map(it => it.id);
      throw new Error('DEPENDENCY_CYCLE among: ' + stuck.join(', '));
    }
    ready.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    layers.push(ready.map(it => it.id));
    for (const it of ready) done.add(it.id);
  }
  return layers;
}

// Flatten layers into a single valid sequential order (dependency-respecting).
export function sequentialOrder(items) { return planLayers(items).flat(); }

// Summary for a scheduler/UI: per-layer items + which are parallelisable + per-domain spread (for A/B/C balance).
export function schedule(items) {
  const layers = planLayers(items);
  const byId = new Map(items.map(it => [it.id, it]));
  return {
    layerCount: layers.length,
    maxParallelism: Math.max(...layers.map(l => l.length)),
    layers: layers.map((ids, i) => ({
      layer: i,
      items: ids,
      parallelisable: ids.length > 1,
      domains: ids.reduce((a, id) => { const d = byId.get(id)?.domain || '?'; a[d] = (a[d] || 0) + 1; return a; }, {}),
    })),
  };
}
