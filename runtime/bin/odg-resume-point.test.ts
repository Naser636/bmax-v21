#!/usr/bin/env node
"use strict";
/* V17.5 PRIORITY 3 — resume-point VIEW: determinism + correctness on the real committed state (offline, read-only). */
const fs = require("fs");
const os = require("os");
const path = require("path");
const RP = require("./odg-resume-point.ts");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const DEF = "docs/odg/evidence/V175_OPEN_PRS_SNAPSHOT.json";
const a = RP.buildResumePoint(RP.loadInputs(ROOT, DEF));
const b = RP.buildResumePoint(RP.loadInputs(ROOT, DEF));
check("deterministic: two builds byte-identical", JSON.stringify(a) === JSON.stringify(b));
check("no timestamp / HEAD of the run in the record (only committed values)", !/generatedAt|generatedAtHead/.test(JSON.stringify(Object.keys(a))));
const committed = fs.readFileSync(path.join(ROOT, RP.OUT_REL), "utf8");
check("--check reproduces the committed resume point", committed === JSON.stringify(a, null, 2) + "\n");
check("--check exit 0 on the committed tree", RP.main(["--check"]) === 0);

const T = (id: string) => a.trackedItems.find((t: any) => t.id === id);
for (const id of ["G", "H", "G2", "J2"]) check(`${id} closed (CLOSED_*), next = none (new mission only)`, !!T(id) && /^CLOSED_/.test(T(id).registerStatus) && T(id).currentStep === null && T(id).next.actor === "NONE");
const nb = T("V175-NB1");
check("V175-NB1 is closed OR its VALIDATE_CRITERIA is pending (provider + inspector, never auto-graded)", !!nb && (/^CLOSED_/.test(nb.registerStatus) || (nb.currentStep === "VALIDATE_CRITERIA" && nb.pending.some((p: any) => p.kind === "VALIDATION") && /INSPECTOR/.test(nb.next.actor))));
check("V175-NB1 last GO run = its committed trace, dispatched", !!nb.lastGoRun && /V175_NB1_GO_EXECUTE_TRACE\.jsonl$/.test(nb.lastGoRun.trace) && nb.lastGoRun.dispatched === true);
check("register/declared-record divergence on V175-NB1 is REPORTED, not resolved", /^CLOSED_/.test(nb.registerStatus) || (nb.divergence && /REPORTED/.test(nb.divergence.note) && nb.registerStatus === "NOT_STARTED"));
check("J (V17.6): CLOSED_PARTIAL after its single GO execution ⇒ not an owner step; strategic selection moved on (V17.8: D/F tie explained by R3 ⇒ D)", T("J").next.actor !== "OWNER" && a.nextGoAction.strategic.item === "D");
check("owner question Q-CTR2 answered V176 (STAGE) ⇒ no longer listed open; every open question carries its source", !a.ownerQuestionsOpen.some((q: any) => q.id === "Q-CTR2") && a.ownerQuestionsOpen.every((q: any) => /ownerQuestions\[\d+\]$/.test(q.source)));
check("checkpoint = latest committed (LCP-1)", a.checkpoint && a.checkpoint.path === "docs/odg/evidence/V178_CHECKPOINT_19.json");
check("checkpoint CP12 (V17.6) carries no stale RUNNING status vs the register (the CP11 J2 RUNNING case is superseded by CP12)", !a.checkpointVsRegister.some((c: any) => c.superseded === true && c.checkpointStatus === "RUNNING"));
check("next GO action (V17.8/V19): dispatchable derived from the committed inspections — an item is dispatchable only while its inspection is bound to its CURRENT contract sha and no experiment record exists (P4 executed ⇒ out; P4-INT inspected ⇒ in)", (() => { const ids = a.nextGoAction.dispatchable.map((d: any) => d.item).sort().join(); const AS = require("../core/odg-authorization-scope.js"); const C = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json"), "utf8")).contracts; const live = (sc: string, insp: string, out: string) => { try { const i = JSON.parse(fs.readFileSync(path.join(ROOT, insp), "utf8")); const c = C.find((x: any) => x.scenario === sc); return i.contractSha256 === AS.contractSha256(c) && !fs.existsSync(path.join(ROOT, out)); } catch { return false; } }; const exp = ["V176-NB3", "V178-P2"].concat(live("V178-P4", "docs/odg/evidence/V178_P4_CONTRACT_INSPECTION.json", "docs/odg/evidence/V178_P4_MEMORY_RESULT.json") ? ["V178-P4"] : []).concat(live("V178-P4-INT", "docs/odg/evidence/V178_P4_INT_CONTRACT_INSPECTION.json", "docs/odg/evidence/V178_P4_INT_RESULT.json") ? ["V178-P4-INT"] : []).sort().join(); return ids === exp; })());
check("last GO run = the latest committed cycle (V178-P4-INT RUN-1, run 110038c3b4e89a9c, workingOn V178-P4-INT)", a.nextGoAction.lastGoRun.workingOn === "V178-P4-INT" && a.nextGoAction.lastGoRun.runId === "110038c3b4e89a9c");
check("tracked items carry their boussoleRef (compact) from the register", a.trackedItems.every((t: any) => t.boussoleRef && (t.boussoleRef.status === "MEASURED" || typeof t.boussoleRef.reason === "string")));
check("every tracked item cites its register record", a.trackedItems.every((t: any) => t.source[0].startsWith("docs/odg/evidence/V164_STRATEGIC_REGISTER.json#register.items[id=")));
check("open PRs read from the snapshot file passed in (no network)", a.openPrs.snapshot === DEF && Array.isArray(a.openPrs.open));
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-"));
  const f = path.join(dir, "prs.json");
  fs.writeFileSync(f, JSON.stringify([{ number: 999, title: "x", headRefName: "feat/x", state: "OPEN" }, { number: 998, title: "y", state: "MERGED" }]));
  const c = RP.buildResumePoint(RP.loadInputs(ROOT, path.relative(ROOT, f)));
  check("a passed-in open-PR snapshot (gh pr list array) is listed: OPEN only", c.openPrs.open.length === 1 && c.openPrs.open[0].number === 999);
  const d = RP.buildResumePoint(RP.loadInputs(ROOT, ""));
  check("no PR snapshot ⇒ openPrs NOT_MEASURED (never assumed empty)", d.openPrs.status === "NOT_MEASURED");
}
check("view creates nothing: rules declare no decision (RSP-1..5)", Object.keys(RP.RULES).join() === "RSP-1,RSP-2,RSP-3,RSP-4,RSP-5");
if (failures) { process.stdout.write(`${failures} odg-resume-point test(s) FAILED\n`); process.exit(1); }
process.stdout.write("all odg-resume-point tests passed\n");
export {};
