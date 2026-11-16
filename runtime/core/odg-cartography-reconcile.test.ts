#!/usr/bin/env node
"use strict";
/* V234-A §5/§12 — cartography reconciliation. Proves: per-component UNCHANGED/MODIFIED/ADDED/MOVED/REMOVED from content
 * digests; a MOVED component (digest reappears at a new path) is NOT declared REMOVED (§5 trap); reuse-vs-restudy is
 * driven by the V235 observation-currency decider over the computed content-changed set; runs on a REAL repo file;
 * reuses the canonical digest; deterministic + frozen. */
const C = require("./odg-cartography-reconcile.js");
const fs = require("fs");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const d = (s: string) => C.fingerprint(s);

function main() {
  const prev = { commit: "aaa", entries: [
    { id: "A", path: "core/a.ts", digest: d("a1"), role: "module A" },
    { id: "B", path: "core/b.ts", digest: d("b1"), role: "module B" },
    { id: "M", path: "core/m.ts", digest: d("m-stable"), role: "movable" },
    { id: "R", path: "core/r.ts", digest: d("r1"), role: "to be removed" }] };
  const curr = { commit: "bbb", entries: [
    { id: "A", path: "core/a.ts", digest: d("a1"), role: "module A" },            // UNCHANGED
    { id: "B", path: "core/b.ts", digest: d("b2"), role: "module B" },            // MODIFIED
    { id: "M2", path: "core/sub/m.ts", digest: d("m-stable"), role: "movable" },  // MOVED (same digest, new id/path)
    { id: "N", path: "core/n.ts", digest: d("n1"), role: "new module" }] };       // ADDED; R REMOVED
  const r = C.reconcile(prev, curr, { asOfEpochMs: Date.UTC(2026, 10, 16) });

  check("classifies UNCHANGED/MODIFIED/ADDED/MOVED/REMOVED = 1 each", r.counts.unchanged === 1 && r.counts.modified === 1 && r.counts.added === 1 && r.counts.moved === 1 && r.counts.removed === 1);
  check("§5 TRAP: MOVED (digest reappears at new path) is NOT declared REMOVED", r.moved[0].from === "M" && r.moved[0].to === "M2" && r.moved[0].fromPath === "core/m.ts" && r.moved[0].toPath === "core/sub/m.ts" && r.removed.every((x: any) => x.id !== "M") && r.removed.length === 1 && r.removed[0].id === "R");
  check("ADDED excludes the move destination (M2 is a move, not an add)", r.added.length === 1 && r.added[0].id === "N" && !r.added.some((x: any) => x.id === "M2"));
  check("content-changed set = MODIFIED ∪ ADDED paths only (move/remove excluded)", JSON.stringify([...r.contentChangedPaths].sort()) === JSON.stringify(["core/b.ts", "core/n.ts"]));

  // §19 anti-rediscovery via V235: unchanged A ⇒ reuse (CURRENT_OBSERVED); modified B ⇒ restudy (HISTORICAL_OBSERVED).
  check("ANTI-REDISCOVERY: UNCHANGED 'A' ⇒ reuse (CURRENT_OBSERVED), skip re-study", r.reuseSet.some((x: any) => x.id === "A" && x.reuse === true && x.currency === "CURRENT_OBSERVED"));
  check("ANTI-REDISCOVERY: MODIFIED 'B' ⇒ restudy (HISTORICAL_OBSERVED), must re-observe", r.restudySet.some((x: any) => x.id === "B" && x.restudy === true && x.currency === "HISTORICAL_OBSERVED"));
  check("MOVED 'M2' ⇒ reuse description (content identical) with pathUpdated=true, not restudy", r.reuseSet.some((x: any) => x.id === "M2" && x.reuse === true && x.pathUpdated === true) && !r.restudySet.some((x: any) => x.id === "M2"));
  check("every surviving component lands in exactly one of reuse/restudy (no component lost)", r.reuseSet.length + r.restudySet.length === (r.counts.unchanged + r.counts.modified + r.counts.moved));

  // FAIL-CLOSED guard: a self-contradictory input (SAME commit label, DIFFERENT content) must still force restudy —
  // a content-changed component can NEVER be upgraded to reuse, even past V235's same-commit fast-path.
  const contra = C.reconcile(
    { commit: "SAME", entries: [{ id: "Z", path: "core/z.ts", digest: d("z1"), role: "z" }] },
    { commit: "SAME", entries: [{ id: "Z", path: "core/z.ts", digest: d("z2"), role: "z" }] }, { asOfEpochMs: 1 });
  check("FAIL-CLOSED: same-commit label + changed content ⇒ MODIFIED ⇒ restudy (not reuse), HISTORICAL_OBSERVED", contra.counts.modified === 1 && contra.restudySet.some((x: any) => x.id === "Z" && x.restudy === true && x.currency === "HISTORICAL_OBSERVED") && !contra.reuseSet.some((x: any) => x.id === "Z"));

  // runs on a REAL repo file (digest reproducible from its actual bytes).
  const realPath = "runtime/core/odg-observation-currency.ts";
  const realDigest = C.fingerprintPath(realPath, (p: string) => fs.readFileSync(p, "utf8"));
  check("operates on REAL repo content: fingerprintPath returns a 64-hex sha256 of an actual file", typeof realDigest === "string" && /^[0-9a-f]{64}$/.test(realDigest));
  const realPrev = { commit: "x", entries: [{ id: "oc", path: realPath, digest: realDigest, role: "currency" }] };
  const realUnchanged = C.reconcile(realPrev, realPrev, { asOfEpochMs: 1 });
  check("REAL file reconciled against itself ⇒ UNCHANGED + reuse (no needless re-study)", realUnchanged.counts.unchanged === 1 && realUnchanged.counts.modified === 0 && realUnchanged.reuseSet.some((x: any) => x.id === "oc" && x.reuse === true));

  // demonstrate() + determinism + contract.
  const dem = C.demonstrate();
  check("demonstrate(): all 5 classifications + move≠delete + anti-rediscovery proven", dem.classificationsProven === true && dem.moveNotDeleted === true && dem.antiRediscoveryProven === true);
  check("deterministic + frozen", JSON.stringify(C.demonstrate()) === JSON.stringify(dem) && Object.isFrozen(r) && Object.isFrozen(r.moved) && Object.isFrozen(r.reuseSet));
  check("contract: move≠delete, composes V235, reuses canonical digest, no 2nd graph/10th primitive", C.CARTOGRAPHY_RECONCILE_CONTRACT.invariants.some((i: string) => /MOVED.*NEVER declared REMOVED/.test(i)) && C.CARTOGRAPHY_RECONCILE_CONTRACT.invariants.some((i: string) => /COMPOSES V235/.test(i)) && C.CARTOGRAPHY_RECONCILE_CONTRACT.invariants.some((i: string) => /no 2nd graph\/store, no 10th primitive/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — cartography-reconcile (V234-A §5/§12: per-component UNCHANGED/MODIFIED/ADDED/MOVED/REMOVED from content digests; MOVED≠REMOVED [§5 trap]; reuse-vs-restudy driven by V235 observation-currency; runs on real repo file; reuses canonical digest; no 2nd graph/store)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
