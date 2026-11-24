#!/usr/bin/env node
"use strict";
/* V16.4 — offline tests for odg-strategic-select: record shape, pre-registration present, determinism, --check drift
 * detection on a temp copy of the canonical sources (no network, no model, no repo write). */
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const B = require("./odg-strategic-select.ts");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const quiet = (fn: () => number) => { const o = process.stdout.write, e = process.stderr.write; let err = ""; (process.stdout as any).write = () => true; (process.stderr as any).write = (s: string) => { err += s; return true; }; try { return { code: fn(), err }; } finally { (process.stdout as any).write = o; (process.stderr as any).write = e; } };

// temp root with copies of the committed canonical sources (CP8 is not copied ⇒ exercised as UNAVAILABLE here).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-v164-"));
const ev = path.join(tmp, "docs/odg/evidence");
fs.mkdirSync(ev, { recursive: true });
for (const fn of fs.readdirSync(path.join(ROOT, "docs/odg/evidence")).filter((x: string) => x === "V160_AP_WORK_ITEM_CONTRACTS.json" || x === "V150_TRACEABILITY_MATRIX.json" || (/_SCENARIO_[A-P][_.]/.test(x) && x.endsWith(".json")))) fs.copyFileSync(path.join(ROOT, "docs/odg/evidence", fn), path.join(ev, fn));

const src = B.loadSources(tmp);
const r1 = B.compute(src), r2 = B.compute(B.loadSources(tmp));
check("compute is deterministic (byte-identical across loads)", JSON.stringify(r1) === JSON.stringify(r2));
check("inputs carry sha256 per source; CP8 absent ⇒ recorded UNAVAILABLE (not silently skipped)", r1.inputs.every((i: any) => i.sha256 === null ? /UNAVAILABLE/.test(i.note) : /^[0-9a-f]{64}$/.test(i.sha256)) && r1.inputs.some((i: any) => /UNAVAILABLE/.test(i.note || "")));
check("pre-registered B and C criteria are embedded in the record", /b1/.test(r1.preRegistration.B.PASS) && /c2/.test(r1.preRegistration.C.PASS) && /first execution/.test(r1.preRegistration.writtenBefore));
check("decision record is a PROPOSAL (not authorized, not executed)", /PROPOSAL/.test(r1.decisionRecord.authorizationState) && r1.decision.isProposalOnly === true);
check("register has the 16 A–P contracts + the V17.2 G2/J2 + V17.5 V175-NB1 + V175-NB2 + V17.6 V176-NB3 contracts (21); executed F/G/J are EXECUTED_PARTIAL (never ACCEPTED)", r1.register.items.filter((x: any) => x.kind === "WORK_ITEM_CONTRACT").length === 21 && r1.register.items.filter((x: any) => x.kind === "WORK_ITEM_CONTRACT" && /^[A-P]$/.test(x.id)).length === 16 && ["G2", "J2", "V175-NB1", "V175-NB2", "V176-NB3"].every((L) => r1.register.items.some((x: any) => x.id === L && x.kind === "WORK_ITEM_CONTRACT")) && ["F", "G", "J"].every((L) => r1.register.items.find((x: any) => x.id === L).status === "EXECUTED_PARTIAL"));
check("no owner-gated item is the selection", !r1.decisionRecord.selected || !r1.register.items.find((x: any) => x.id === r1.decisionRecord.selected).requiresOwnerAuthorization);
check("grading B/C ∈ {PASS, PARTIAL, FAIL} with checks recorded", ["PASS", "PARTIAL", "FAIL"].includes(r1.grading.B.grade) && ["PASS", "PARTIAL", "FAIL"].includes(r1.grading.C.grade) && typeof r1.grading.C.checks.c2 === "boolean");
check("c2 id-invariance probe ran (relabel + reverse order)", r1.grading.C.idInvariance.sameDecision === true);

// --check: write then check OK, then mutate a source ⇒ drift ⇒ exit 1.
const out = path.join(tmp, "out.json");
check("write mode exits 0", quiet(() => B.main(["--root", tmp, "--out", out])).code === 0 && fs.existsSync(out));
check("--check on the just-written record ⇒ 0 (no drift)", quiet(() => B.main(["--root", tmp, "--out", out, "--check"])).code === 0);
const cpath = path.join(ev, "V160_AP_WORK_ITEM_CONTRACTS.json");
const cj = JSON.parse(fs.readFileSync(cpath, "utf8"));
cj.contracts.find((x: any) => x.scenario === "D").initialState.status = "PASS";
fs.writeFileSync(cpath, JSON.stringify(cj, null, 1));
const drift = quiet(() => B.main(["--root", tmp, "--out", out, "--check"]));
check("--check after a source change ⇒ exit 1 with DRIFT naming the changed parts", drift.code === 1 && /DRIFT/.test(drift.err) && /inputs/.test(drift.err) && /register/.test(drift.err));
const rec = JSON.parse(fs.readFileSync(out, "utf8"));
rec.decisionRecord.selected = "TAMPERED";
fs.writeFileSync(out, JSON.stringify(rec));
check("--check on a tampered record ⇒ exit 1", quiet(() => B.main(["--root", tmp, "--out", out, "--check"])).code === 1);
check("--check with a missing record ⇒ exit 1", quiet(() => B.main(["--root", tmp, "--out", path.join(tmp, "nope.json"), "--check"])).code === 1);
fs.rmSync(tmp, { recursive: true, force: true });

// committed evidence: verified against the live sources only when the same inputs are reachable (CP8 branch fetched).
const committedPath = path.join(ROOT, B.OUT_REL);
if (fs.existsSync(committedPath)) {
  const committed = JSON.parse(fs.readFileSync(committedPath, "utf8"));
  check("committed record carries pre-registration, inputs sha256, HEAD, decision and grading", !!committed.preRegistration && Array.isArray(committed.inputs) && typeof committed.generatedAtHead === "string" && !!committed.decisionRecord && !!committed.grading);
  const gaps = committed.register.items.filter((x: any) => x.kind === "CP8_CAPABILITY_GAP");
  check("committed record: benefit inputs (GO cycle, CP9, closure dossier) pinned by sha256", ["V164_GO_CYCLE.json", "V166_CHECKPOINT_9.json", "V167_V166_CLOSURE_DOSSIER.json"].every((f: string) => committed.inputs.some((i: any) => i.source.endsWith(f) && /^[0-9a-f]{64}$/.test(i.sha256))));
  check("committed record: every measured gap BLK/REL/DEP value is a BLK-2/REL-2/DEP-2 rule with sources; the rest NOT_MEASURED with value null", gaps.length === 11 && gaps.every((x: any) => ["blockerRepetitionReduction", "reliabilityQuality", "dependencyAvailability"].every((k) => x.criteria[k].status === "MEASURED" ? /^(BLK|REL|DEP)-2$/.test(x.criteria[k].rule) && x.criteria[k].source.length > 0 : x.criteria[k].value === null)));
  check("committed record: no gap item is the strategic choice while its uncertainty exceeds uncertaintyMax", !gaps.some((x: any) => x.id === committed.decisionRecord.selected));
  const live = B.loadSources(ROOT);
  if (JSON.stringify(live.inputs) === JSON.stringify(committed.inputs)) check("committed record has no drift vs the reachable sources (--check)", quiet(() => B.main(["--check"])).code === 0);
  else process.stdout.write("skip - committed-record drift check (inputs not all reachable here, e.g. CP8 branch not fetched)\n");
}

process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-strategic-select (deterministic record, pre-registration embedded, proposal-only, --check drift detection)" : f + " FAIL") + "\n");
process.exit(f === 0 ? 0 : 1);
export {};
