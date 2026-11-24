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

const DEF = "docs/odg/evidence/V175_PR_TIMELINE_SNAPSHOT.json";
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
check("J: strategic selection, contract PROPOSED ⇒ next actor OWNER (PROPOSED → AUTHORIZED)", T("J").contractState === "PROPOSED" && T("J").next.actor === "OWNER" && a.nextGoAction.strategic.item === "J" && /PROPOSED → AUTHORIZED/.test(a.nextGoAction.strategic.ownerAuthorizationNeeded));
check("owner question Q-CTR2 open (answer null, blocking) with its source", a.ownerQuestionsOpen.some((q: any) => q.id === "Q-CTR2" && q.blocking === true && /ownerQuestions\[\d+\]$/.test(q.source)));
check("checkpoint = latest committed (LCP-1)", a.checkpoint && a.checkpoint.path === "docs/odg/evidence/V174_CHECKPOINT_11.json");
check("checkpoint J2 RUNNING is flagged superseded by the register (CLOSED_FAIL)", a.checkpointVsRegister.some((c: any) => c.item === "J2" && c.checkpointStatus === "RUNNING" && c.registerStatus === "CLOSED_FAIL" && c.superseded === true));
check("next GO action: nothing dispatchable (no authorized undispatched EXECUTION step) — derived, not asserted", a.nextGoAction.dispatchable.length === 0 && /nothing to dispatch/.test(a.nextGoAction.verdict));
check("last GO run = the latest committed cycle (NB1, workingOn V175-NB1, strategic J)", a.nextGoAction.lastGoRun.workingOn === "V175-NB1" && a.nextGoAction.lastGoRun.strategic === "J");
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
