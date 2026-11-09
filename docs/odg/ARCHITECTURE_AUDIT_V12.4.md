# V12.4 — Architecture Intelligence & Rationalization (read-only audit #1)

**Addendum §3–§5 deliverable — READ-ONLY.** Produced by `runtime/core/architecture-audit.ts` (13 assertions, in
`test:report`) run over the live `runtime/core` dependency graph (`change-impact-graph.buildGraph`, 426 modules).
**Nothing is merged, retired, or changed by this pass.** Every candidate is `NEEDS_REVIEW`; a similarity NEVER authorizes
a fusion (§5).

## Method (responsibilities, not names)

- **Circular dependencies** — cycle-safe DFS over the real static require graph (`change-impact-graph`, the existing
  graph; no new graph built — §4 anti-gas-factory).
- **Exact duplication** — modules grouped by a RESPONSIBILITY signature = `contract-domain :: sorted exported-symbol set`,
  extracted from each module's real `module.exports`. File-name similarity is irrelevant.
- **Unused** — a module with no static core-consumer, no `<id>.test.ts`, and not referenced by `runtime/bin`/`scripts`.

## Findings (426 core modules)

| Check | Result | Reliability |
|---|---|---|
| **Circular dependencies** | **0** | PROVEN — graph-derived, reliable |
| **Exact responsibility duplications** | **0** | Reliable for EXACT dup (identical domain + exported-symbol set); does NOT catch partial/functional overlap — that stays for a deeper pass |
| **Unused candidates** | 7 flagged → **all 7 verified FALSE POSITIVES** | UNRELIABLE — see below |

### The 7 "unused" candidates are false positives (why unused ⇒ NEEDS_REVIEW, never RETIRE)

`execution-planner`, `knowledge-engine`, `mission-interpreter`, `mission-loader`, `patch-engine`,
`project-context-engine`, `specification-loader` were flagged (no static core-consumer). Repo-wide verification found
**2–9 references each**:

- `execution-planner`, `patch-engine` → used by **`pipeline-builder.ts`** (a core module) + bench e2e suites — the
  static scanner missed the edge (dynamic / string-form reference).
- `specification-loader` → exercised by **`specification-loader-contract.test.ts`** (a contract-named test, not
  `specification-loader.test.ts`, so the `<id>.test.ts` check missed it).
- the rest → referenced 5–9× across bin/scripts/tests via forms the static core-graph does not capture.

**Conclusion:** the static dependency graph UNDER-APPROXIMATES edges (dynamic dispatch, string references, contract-named
tests). "No static consumer" is therefore **NOT** evidence of dead code. The module enforces exactly this: an unused
flag is `NEEDS_REVIEW`, and no RETIRE is possible without independent proof of zero remaining dependencies (§5/§7). This
audit retires nothing.

## Target architecture & prevention (§6/§9)

- **0 cycles / 0 exact duplications** on 426 modules is a healthy baseline — recorded so a future `audit-prevention`
  gate can red a PR that INTRODUCES a cycle or an exact responsibility-duplicate (reusing this same analyzer + the
  existing graph; no new engine).
- **Next (authorized) passes, in dependency order:** (a) partial/functional overlap detection (responsibility-domain
  clusters, not identical signatures); (b) owner/coverage projection via `capability-map`; (c) excessive call-chain
  depth. Each stays read-only until a demonstrated, non-regression-tested, rollback-able consolidation is authorized —
  similarity never authorizes a merge.

## Discipline

Read-only. NEEDS_REVIEW is not an authorization. A false positive is reported as a false positive. The static graph's
blind spots are stated, not hidden. Nothing merged/retired/changed.
