#!/usr/bin/env node
"use strict";
/* Tests for odg-reuse-validity-gate (FORWARD pre-reuse validity). PURE. Composes REAL odg-writeset-contention
   (pathsConflict for drift). Clock-free: fixed asOfMs + numeric learnedAt (epoch ms) ⇒ fully deterministic. */
const M = require("./odg-reuse-validity-gate.js");
const WSC = require("./odg-writeset-contention.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const DAY = 86400000;
const NOW = 1_800_000_000_000; // fixed epoch ms

function main(): void {
  const fresh = { learnedAt: NOW - 10 * DAY, authoredBy: "odg-native", edits: [{ file: "src/a.ts" }] };

  // REUSABLE_AS_PROVEN — fresh + provenanced + drift-checked clean + not suppressed
  const ok = M.classifyReuseValidity(fresh, { asOfMs: NOW, changedPaths: ["src/other.ts"] });
  check("fresh + clean drift + provenance ⇒ REUSABLE_AS_PROVEN", ok.verdict === "REUSABLE_AS_PROVEN" && ok.ageDays === 10);
  check("REUSABLE reason says it is still a replay, not a new guarantee", ok.reasons.some((r: string) => /replay of a past result, not a new guarantee/.test(r)));

  // REQUIRES_REVALIDATION — target path changed since learned (drift via pathsConflict)
  const changed = M.classifyReuseValidity(fresh, { asOfMs: NOW, changedPaths: ["src/a.ts"] });
  check("target file changed ⇒ REQUIRES_REVALIDATION + changedTargets names it", changed.verdict === "REQUIRES_REVALIDATION" && JSON.stringify(changed.changedTargets) === JSON.stringify(["src/a.ts"]));
  // ancestor-containment drift: precedent edits dir src/a, a file under it changed
  const anc = M.classifyReuseValidity({ learnedAt: NOW - DAY, authoredBy: "x", edits: [{ file: "src/a" }] }, { asOfMs: NOW, changedPaths: ["src/a/x.ts"] });
  check("ancestor-containment drift (src/a ⊃ src/a/x.ts) ⇒ REQUIRES_REVALIDATION", anc.verdict === "REQUIRES_REVALIDATION" && anc.changedTargets.includes("src/a"));
  // drift check uses the SAME pathsConflict as odg-writeset-contention (no reimplementation)
  check("drift overlap matches odg-writeset-contention.pathsConflict", WSC.pathsConflict("src/a", "src/a/x.ts") === true && anc.changedTargets.length === 1);

  // REQUIRES_REVALIDATION — aged beyond threshold (age alone does NOT upgrade; it forces revalidation)
  const aged = M.classifyReuseValidity({ learnedAt: NOW - 200 * DAY, authoredBy: "x", edits: [{ file: "src/a.ts" }] }, { asOfMs: NOW, changedPaths: [] });
  check("aged 200d > 90d ⇒ REQUIRES_REVALIDATION", aged.verdict === "REQUIRES_REVALIDATION" && aged.ageDays === 200 && aged.reasons.some((r: string) => /aged 200d > 90d/.test(r)));
  // custom maxAgeDays honoured
  check("custom maxAgeDays=365 ⇒ 200d is within bound (not aged)", M.classifyReuseValidity({ learnedAt: NOW - 200 * DAY, authoredBy: "x", edits: [{ file: "src/a.ts" }] }, { asOfMs: NOW, changedPaths: [], maxAgeDays: 365 }).verdict === "REUSABLE_AS_PROVEN");

  // REQUIRES_REVALIDATION — fail-closed when freshness can't be certified
  check("no changedPaths supplied (drift unchecked) ⇒ REQUIRES_REVALIDATION (fail-closed)", M.classifyReuseValidity(fresh, { asOfMs: NOW }).verdict === "REQUIRES_REVALIDATION");
  check("learnedAt missing ⇒ REQUIRES_REVALIDATION (cannot verify freshness)", M.classifyReuseValidity({ authoredBy: "x", edits: [{ file: "src/a.ts" }] }, { asOfMs: NOW, changedPaths: [] }).verdict === "REQUIRES_REVALIDATION");
  check("asOfMs missing ⇒ REQUIRES_REVALIDATION (cannot compute age)", M.classifyReuseValidity(fresh, { changedPaths: [] }).verdict === "REQUIRES_REVALIDATION");
  check("provenance UNKNOWN ⇒ REQUIRES_REVALIDATION (remembered ≠ validated)", M.classifyReuseValidity({ learnedAt: NOW - DAY, authoredBy: "UNKNOWN", edits: [{ file: "src/a.ts" }] }, { asOfMs: NOW, changedPaths: [] }).verdict === "REQUIRES_REVALIDATION");
  check("missing authoredBy ⇒ REQUIRES_REVALIDATION", M.classifyReuseValidity({ learnedAt: NOW - DAY, edits: [{ file: "src/a.ts" }] }, { asOfMs: NOW, changedPaths: [] }).verdict === "REQUIRES_REVALIDATION");
  check("declared dependencyDrift ⇒ REQUIRES_REVALIDATION", M.classifyReuseValidity(fresh, { asOfMs: NOW, changedPaths: [], dependencyDrift: true }).verdict === "REQUIRES_REVALIDATION");

  // REQUIRES_REVALIDATION — unrecognized edit-record shape ⇒ no resolvable targets ⇒ cannot certify drift (fail-closed)
  check("unrecognized edit shape (no resolvable targets) ⇒ REQUIRES_REVALIDATION (not falsely drift-clean)",
    M.classifyReuseValidity({ learnedAt: NOW - DAY, authoredBy: "x", edits: [{ weird: "src/x.ts" }] }, { asOfMs: NOW, changedPaths: ["src/x.ts"] }).verdict === "REQUIRES_REVALIDATION");
  // REQUIRES_REVALIDATION — future learnedAt (negative age) is implausible, not fresh
  const future = M.classifyReuseValidity({ learnedAt: NOW + 100 * DAY, authoredBy: "x", edits: [{ file: "src/a.ts" }] }, { asOfMs: NOW, changedPaths: [] });
  check("future learnedAt (negative age) ⇒ REQUIRES_REVALIDATION (fail-closed, not a fresh-pass)", future.verdict === "REQUIRES_REVALIDATION" && future.ageDays === -100 && future.reasons.some((r: string) => /in the future/.test(r)));
  // truthy-but-non-boolean bad signals still trigger (fail-closed on negative signals)
  check("suppressed truthy-non-boolean ⇒ STALE", M.classifyReuseValidity(fresh, { asOfMs: NOW, changedPaths: [], suppressed: 1 }).verdict === "STALE");
  check("dependencyDrift truthy-non-boolean ⇒ REQUIRES_REVALIDATION", M.classifyReuseValidity(fresh, { asOfMs: NOW, changedPaths: [], dependencyDrift: "yes" }).verdict === "REQUIRES_REVALIDATION");

  // STALE — a prior net-regression (reuse-ledger suppressed) is the hard signal; beats everything
  const sup = M.classifyReuseValidity(fresh, { asOfMs: NOW, changedPaths: ["src/a.ts"], suppressed: true });
  check("suppressed (prior regression) ⇒ STALE (overrides revalidation triggers)", sup.verdict === "STALE" && sup.reasons.some((r: string) => /net-regressed/.test(r)));

  // fileScope:false (DECISION precedent, no file write-set) ⇒ the file-drift dimension is skipped
  const decFresh = M.classifyReuseValidity({ learnedAt: NOW - 10 * DAY, authoredBy: "odg" }, { asOfMs: NOW, fileScope: false });
  check("fileScope:false + fresh + provenanced (no targets, no changedPaths) ⇒ REUSABLE_AS_PROVEN", decFresh.verdict === "REUSABLE_AS_PROVEN");
  check("fileScope:false + aged ⇒ REQUIRES_REVALIDATION (age still governs)", M.classifyReuseValidity({ learnedAt: NOW - 200 * DAY, authoredBy: "odg" }, { asOfMs: NOW, fileScope: false }).verdict === "REQUIRES_REVALIDATION");
  check("fileScope:false + UNKNOWN provenance ⇒ REQUIRES_REVALIDATION (provenance still governs)", M.classifyReuseValidity({ learnedAt: NOW - DAY, authoredBy: "UNKNOWN" }, { asOfMs: NOW, fileScope: false }).verdict === "REQUIRES_REVALIDATION");
  check("fileScope:false + suppressed ⇒ STALE (prior regression still governs)", M.classifyReuseValidity({ learnedAt: NOW - DAY, authoredBy: "odg" }, { asOfMs: NOW, fileScope: false, suppressed: true }).verdict === "STALE");
  check("default (fileScope omitted) still fail-closed on no targets (patch behaviour preserved)", M.classifyReuseValidity({ learnedAt: NOW - DAY, authoredBy: "odg" }, { asOfMs: NOW, changedPaths: [] }).verdict === "REQUIRES_REVALIDATION");

  // ISO learnedAt also accepted (parsed deterministically)
  check("ISO-string learnedAt parsed", M.classifyReuseValidity({ learnedAt: new Date(NOW - 5 * DAY).toISOString(), authoredBy: "x", edits: [{ file: "src/a.ts" }] }, { asOfMs: NOW, changedPaths: [] }).ageDays === 5);

  // targetPathsOf flexibility
  check("targetPathsOf reads edits[].file/.path", JSON.stringify(M.targetPathsOf({ edits: [{ file: "a.ts" }, { path: "b.ts" }] })) === JSON.stringify(["a.ts", "b.ts"]));
  check("targetPathsOf prefers explicit targetPaths/files", JSON.stringify(M.targetPathsOf({ files: ["x"], edits: [{ file: "y" }] })) === JSON.stringify(["x"]));

  // fail-closed inputs
  check("non-object precedent ⇒ BAD_PRECEDENT", M.classifyReuseValidity(null, {}).ok === false && M.classifyReuseValidity(null, {}).code === "BAD_PRECEDENT");
  check("unparseable learnedAt string ⇒ REQUIRES_REVALIDATION (not a throw)", M.classifyReuseValidity({ learnedAt: "not-a-date", authoredBy: "x", edits: [{ file: "a" }] }, { asOfMs: NOW, changedPaths: [] }).verdict === "REQUIRES_REVALIDATION");

  // honesty + determinism + frozen + contract
  check("note: remembered ≠ validated, age never upgrades, never-regressed ≠ still-valid", /REMEMBERED ≠ CURRENTLY VALIDATED/.test(ok.note) && /Age alone never upgrades/.test(ok.note) && /never-regressed ≠ still-valid/.test(ok.note));
  check("deterministic", JSON.stringify(M.classifyReuseValidity(fresh, { asOfMs: NOW, changedPaths: ["src/other.ts"] })) === JSON.stringify(ok));
  check("frozen (result, reasons, changedTargets)", Object.isFrozen(ok) && Object.isFrozen(ok.reasons) && Object.isFrozen(changed.changedTargets));
  check("contract: remembered≠validated, positive-evidence-required, age-never-upgrades, suppressed⇒STALE, forward-complement",
    M.REUSE_VALIDITY_GATE_CONTRACT.invariants.some((s: string) => /REMEMBERED ≠ CURRENTLY VALIDATED/.test(s)) &&
    M.REUSE_VALIDITY_GATE_CONTRACT.invariants.some((s: string) => /requires POSITIVE freshness evidence/.test(s)) &&
    M.REUSE_VALIDITY_GATE_CONTRACT.invariants.some((s: string) => /age ALONE never upgrades/.test(s)) &&
    M.REUSE_VALIDITY_GATE_CONTRACT.invariants.some((s: string) => /prior net-regression.*STALE/.test(s)) &&
    M.REUSE_VALIDITY_GATE_CONTRACT.invariants.some((s: string) => /FORWARD complement to reuse-ledger/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-reuse-validity-gate (FORWARD pre-reuse check composing REAL odg-writeset-contention.pathsConflict: fresh+clean+provenanced⇒REUSABLE_AS_PROVEN; target-path drift [+ancestor containment]/aged>max/drift-unchecked/missing-learnedAt/missing-asOf/UNKNOWN-provenance/dependencyDrift⇒REQUIRES_REVALIDATION; suppressed prior-regression⇒STALE [overrides]; custom maxAgeDays; ISO+epoch learnedAt; targetPathsOf flexible; non-object/unparseable fail-closed; remembered≠validated + age-never-upgrades + never-regressed≠still-valid honest; PURE/deterministic/frozen/clock-free)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
