/* V16.9 — odg-v169-continuity-baseline: determinism + structure + honesty invariants. Deliberately does NOT freeze the
 * committed grades (a later checkpoint or register fix legitimately changes them — use `--check` at the PR head). */
const fs = require("fs");
const path = require("path");
const B = require("./odg-v169-continuity-baseline.ts");

const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const before = fs.readdirSync(path.join(ROOT, "docs/odg/evidence")).sort().join("|");
const a = B.compute(ROOT);
const b = B.compute(ROOT);
check("deterministic: two computations are byte-identical", JSON.stringify(a) === JSON.stringify(b));
check("15 pre-registered scenarios, results in the same order", B.PRE_REGISTRATION.scenarios.length === 15 && a.scenarios.map((s: any) => s.n).join(",") === "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15");
check("every grade in the declared vocabulary", a.scenarios.every((s: any) => B.PRE_REGISTRATION.gradeVocabulary.includes(s.grade)));
check("scenarios #3/#4 are marked pre-registered after the first run of the others", B.PRE_REGISTRATION.scenarios[2].addedAfterFirstRun === true && B.PRE_REGISTRATION.scenarios[3].addedAfterFirstRun === true && a.scenarios[2].preRegisteredAfterFirstRunOfOthers === true);
check("S13 untightened reading is report-only (never the grade)", !a.scenarios[12].untightenedReading || (a.scenarios[12].untightenedReading.notGraded === true && typeof a.scenarios[12].gradeCause === "string"));
check("every scenario with a test carries a PASS rule or is NOT_MEASURED", B.PRE_REGISTRATION.scenarios.every((s: any) => typeof s.PASS === "string" || typeof s.NOT_MEASURED === "string"));
// re-baselined V17.8: J has been OWNER-authorized since V176 (docs/odg/V176_OWNER_AUTHORIZATION_J.json, #993), so S8's V16.9
// premise "J has no authorization" no longer holds; the invariant that survives is the R0 refusal of a FOREIGN owner source.
check("S8: a foreign owner source is refused (R0); J is non-actionable only while it lacks its own owner authorization", a.scenarios[7].measured.m1_foreignOwnerSource.applicable === false && (fs.existsSync(path.join(ROOT, "docs/odg/V176_OWNER_AUTHORIZATION_J.json")) || a.scenarios[7].measured.J_actionability.actionable === false));
check("S7: a contract edited after inspection never validates the inspection step", a.scenarios[6].measured.m2_contractEdited.rejected === true);
check("S9: owner-gated items never actionable in the labelled fixture", a.scenarios[8].measured.s2_actionable.every((x: any) => x.id !== "K" && x.id !== "C" && x.id !== "A"));
check("S12 grade is consistent with the flagged count", (() => { const m = a.scenarios[11].metrics; const g = a.scenarios[11].grade; return m.contradictionsFlaggedByComponent === 0 ? g === "FAIL" : m.contradictionsFlaggedByComponent === m.contradictionsLabelled ? g === "PASS" : g === "PARTIAL"; })());
check("resume cost is 0 paid calls (offline)", a.metrics29.resumeCost.value === 0);
check("fanOut helper: blocked dep fan-out is transitive over non-ACCEPTED", JSON.stringify(B.fanOut({ items: [{ id: "x", status: "BLOCKED", deps: [] }, { id: "y", status: "READY", deps: ["x"] }, { id: "z", status: "READY", deps: ["y"] }, { id: "w", status: "ACCEPTED", deps: ["x"] }] })) === JSON.stringify([{ blocker: "x", blocksNonAccepted: ["y", "z"] }]));
check("dependsOnBlocked helper", B.dependsOnBlocked({ items: [{ id: "x", status: "BLOCKED", deps: [] }, { id: "y", status: "READY", deps: ["x"] }] }, "y") === true && B.dependsOnBlocked({ items: [{ id: "y", status: "READY", deps: [] }] }, "y") === false);
check("compute writes nothing (evidence dir unchanged)", fs.readdirSync(path.join(ROOT, "docs/odg/evidence")).sort().join("|") === before);

if (failures) { process.stdout.write(`${failures} failure(s)\n`); process.exit(1); }
process.stdout.write("all ok\n");
export {};
