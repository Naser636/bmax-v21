#!/usr/bin/env node
"use strict";
/*
 * WRITE-SET CONTENTION DETECTOR for concurrent mission orchestration. PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): dep-planner.schedule groups missions into parallel layers by DECLARED DEPENDENCIES
 * ONLY; parallel-execution-planner bounds those layers by deps + resource weight; delegate-isolation.validateScope
 * checks ONE change-set against its OWN authorized files; evaluator-independence audits actor independence. NONE of
 * them compares the WRITE-SETS of two missions scheduled in the SAME layer. Two workers whose authorized paths
 * overlap, running concurrently, is a real merge/race hazard that nothing currently detects. This module detects it
 * and demotes the contended members to safe sub-waves — the write-isolation gate the orchestrator lacks.
 *
 * Core honesty invariant: INDEPENDENT IN DEPENDENCY-ORDER ≠ INDEPENDENT IN WRITE-SET. The absence of a declared
 * dependency between two missions is NOT proof they can safely write concurrently. A mission whose write-set is
 * UNKNOWN (no authorizedPaths declared, and not explicitly read-only) cannot be proven isolated, so it is treated
 * as conflicting with everything (fail-closed) — never optimistically parallelised.
 *
 * Path-overlap semantics: two paths conflict if they are equal or one contains the other as a directory ancestor
 * (so "src/app" conflicts with "src/app/page.tsx"). No network/clock/randomness.
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }

// Normalise a repo-relative path: trim, strip leading slashes, collapse duplicate/trailing slashes, and
// resolve "." and ".." segments. The empty string "" denotes the REPO ROOT — a write-set that may touch the
// whole tree, so it conflicts with EVERY path. A ".."-escape above the root also collapses to "" (fail-closed:
// an out-of-tree path we cannot reason about is treated as whole-tree, never as isolated).
function normPath(p: string): string {
  const s = String(p).trim().replace(/^\/+/, "").replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (s === "" || s === ".") return "";
  const stack: string[] = [];
  let escaped = false;
  for (const seg of s.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { if (stack.length) stack.pop(); else escaped = true; continue; }
    stack.push(seg);
  }
  return escaped ? "" : stack.join("/");
}

/**
 * Two paths conflict if (after normalisation) they are equal, one is a directory ancestor of the other, or
 * either is the repo root (""), which is an ancestor of everything. Arguments are normalised here, so callers
 * may pass raw or pre-normalised paths (normalisation is idempotent).
 */
function pathsConflict(a: string, b: string): boolean {
  const x = normPath(a), y = normPath(b);
  if (x === y) return true;
  if (x === "" || y === "") return true;
  return x.startsWith(y + "/") || y.startsWith(x + "/");
}

type WriteSet = { kind: "KNOWN"; paths: string[] } | { kind: "READ_ONLY" } | { kind: "UNKNOWN" };

// Resolve a mission's declared write-set. Explicit readOnly ⇒ writes nothing (safe). Declared paths ⇒ KNOWN.
// Missing/empty paths and not read-only ⇒ UNKNOWN (fail-closed: cannot prove isolation).
function writeSetOf(m: any): WriteSet {
  if (m && m.readOnly === true) return { kind: "READ_ONLY" };
  const raw = m && (m.authorizedPaths || m.writeSet || m.paths);
  // KNOWN only if a non-empty array of strings. A non-array, an empty array, or any non-string element ⇒
  // UNKNOWN (fail-closed). A declared path that normalises to "" (repo root / ".." escape) is KEPT as "" so
  // it conflicts with everything — a whole-tree writer is never silently treated as isolated.
  if (Array.isArray(raw) && raw.length > 0 && raw.every((x: any) => typeof x === "string")) {
    return { kind: "KNOWN", paths: raw.map(normPath) };
  }
  return { kind: "UNKNOWN" };
}

/** Do two missions' write-sets conflict? UNKNOWN conflicts with everything (incl. read-only) except nothing. */
function missionsConflict(wa: WriteSet, wb: WriteSet): { conflict: boolean; reason: string; shared: string[] } {
  if (wa.kind === "UNKNOWN" || wb.kind === "UNKNOWN")
    return { conflict: true, reason: "UNKNOWN_WRITESET", shared: freeze([]) as string[] };
  if (wa.kind === "READ_ONLY" || wb.kind === "READ_ONLY")
    return { conflict: false, reason: "READ_ONLY", shared: freeze([]) as string[] };
  const shared: string[] = [];
  const show = (p: string) => (p === "" ? "<repo-root>" : p);
  for (const a of wa.paths) for (const b of wb.paths) if (pathsConflict(a, b)) shared.push(a === b ? show(a) : `${show(a)} ↔ ${show(b)}`);
  return { conflict: shared.length > 0, reason: shared.length > 0 ? "WRITESET_OVERLAP" : "DISJOINT", shared: freeze(shared) as string[] };
}

/**
 * computeLayerContention(layers, missions) ->
 *   { ok, anyContention, layers: [{ index, missions, contentions, subWaves, parallelSafe }], note }
 *
 * `layers`   : string[][] — parallel layers (e.g. from dep-planner), each an array of mission ids meant to run together.
 * `missions` : array of { id, authorizedPaths?: string[], readOnly?: boolean } OR an object keyed by id.
 *
 * For each layer it finds every pair of members whose write-sets conflict, then partitions the layer into ordered
 * sub-waves such that within each sub-wave every pair is write-isolated (deterministic greedy by stable id order —
 * a SAFE schedule, not a provably-minimum number of waves). A layer with one sub-wave was already write-safe.
 */
function computeLayerContention(layers: any, missions: any): any {
  if (!Array.isArray(layers) || !layers.every((l: any) => Array.isArray(l)))
    return freeze({ ok: false, code: "BAD_LAYERS", detail: "layers must be an array of arrays of mission ids" });

  // index missions by id
  const byId = new Map<string, any>();
  const list = Array.isArray(missions) ? missions : missions && typeof missions === "object" ? Object.values(missions) : null;
  if (list === null) return freeze({ ok: false, code: "BAD_MISSIONS", detail: "missions must be an array or id-keyed object" });
  for (const m of list) if (m && m.id !== undefined) byId.set(String(m.id), m);

  const wsOf = (id: string): WriteSet => (byId.has(id) ? writeSetOf(byId.get(id)) : { kind: "UNKNOWN" });

  const outLayers = layers.map((layer: any[], index: number) => {
    const ids = layer.map((x) => String(x));
    const contentions: any[] = [];
    // pairwise conflicts (i<j), stable order
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const c = missionsConflict(wsOf(ids[i]), wsOf(ids[j]));
        if (c.conflict) contentions.push(freeze({ a: ids[i], b: ids[j], reason: c.reason, shared: c.shared }));
      }
    // greedy safe sub-waves: place each id (stable order) in the first wave where it conflicts with no current member
    const subWaves: string[][] = [];
    for (const id of ids) {
      let placed = false;
      for (const wave of subWaves) {
        if (wave.every((other) => !missionsConflict(wsOf(id), wsOf(other)).conflict)) { wave.push(id); placed = true; break; }
      }
      if (!placed) subWaves.push([id]);
    }
    return freeze({
      index,
      missions: freeze(ids),
      contentions: freeze(contentions),
      subWaves: freeze(subWaves.map((w) => freeze(w))),
      parallelSafe: contentions.length === 0,
    });
  });

  const anyContention = outLayers.some((l: any) => !l.parallelSafe);
  return freeze({
    ok: true,
    anyContention,
    layers: freeze(outLayers),
    note: "write-set contention within dep-planner's parallel layers: INDEPENDENT IN DEPENDENCY-ORDER ≠ INDEPENDENT IN WRITE-SET. Contended members are split into ordered sub-waves (safe greedy, not provably-minimum). UNKNOWN write-set (no authorizedPaths, not read-only) conflicts with everything — fail-closed, never optimistically parallelised. Overlap = equal path or directory-ancestor containment; paths are normalised (resolve . / .. / leading-slash) and the repo root (a '.'/'/'/..'-escape path) conflicts with EVERY path (fail-closed, never isolated).",
  });
}

const WRITESET_CONTENTION_CONTRACT = Object.freeze({
  id: "WRITESET-CONTENTION",
  purpose: "detect write-set overlap between missions scheduled in the SAME parallel layer and demote contended members to safe sub-waves — the write-isolation gate dep-planner / parallel-execution-planner / delegate-isolation do not provide",
  reuses: Object.freeze(["consumes dep-planner-style parallel layers; complements delegate-isolation (one change-set vs its own files) and evaluator-independence (actor independence)"]),
  invariants: Object.freeze([
    "INDEPENDENT IN DEPENDENCY-ORDER ≠ INDEPENDENT IN WRITE-SET — absence of a declared dep is NOT proof two missions can write concurrently",
    "UNKNOWN write-set (no authorizedPaths declared and not explicitly read-only) conflicts with EVERYTHING — fail-closed, never optimistically parallelised",
    "an explicitly read-only mission writes nothing and conflicts with no one",
    "path overlap = equal path OR one path is a directory ancestor of the other (src/app conflicts with src/app/page.tsx); paths are normalised (. / .. / leading-slash resolved) so src/x, ./src/x, /src/x and src/a/../x compare equal",
    "the repo root (a path that normalises to '' — '.', '/', or a '..'-escape) conflicts with EVERY path — a whole-tree writer is never silently treated as isolated (fail-closed)",
    "sub-waves are a SAFE greedy schedule (deterministic, stable id order) — write-isolated within each wave, but NOT claimed to be the minimum number of waves; PURE/deterministic/frozen",
  ]),
});

module.exports = { computeLayerContention, pathsConflict, writeSetOf, WRITESET_CONTENTION_CONTRACT };
export {};
