#!/usr/bin/env node
"use strict";
/* V17.5 PRIORITY 3 — BREF-1 boussoleRef on every strategic-register item: unit + real-state tests (offline, read-only). */
const fs = require("fs");
const path = require("path");
const BR = require("./odg-boussole-ref.js");
const REG = require("./odg-strategic-register.js");
const SS = require("../bin/odg-strategic-select.ts");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

// ── unit: parsers ──────────────────────────────────────────────────────────────────────────────────────────────────
check("sectionCitations: parenthetical list, document-qualified ref skipped", JSON.stringify(BR.sectionCitations("SLO target choice (§18, V15_CLOSURE_DOSSIER §8)")) === '["§18"]' && JSON.stringify(BR.sectionCitations("x (§16.8, §23, §27.8)")) === '["§16","§23","§27"]');
check("advanceToSection: §45-X ⇒ scenario row, §48 Action 9 ⇒ §48", BR.advanceToSection("§45-K") === "§45 scenario K" && BR.advanceToSection("§48 Action 9") === "§48" && BR.advanceToSection("§11.22") === "§11" && BR.advanceToSection("x") === null);
const MIS = [{ id: "CM-A", section: "E" }, { id: "CM-B", section: "D" }];
{
  const p = BR.parseV124Anchor("E CM-A (IN_PROGRESS); D continuity (ACCEPTED)", MIS);
  check("parseV124Anchor: id validated against companion + section-only segment", p.cands.length === 2 && p.cands[0].missionId === "CM-A" && p.cands[1].missionId === null && p.cands[1].section === "D");
  const q = BR.parseV124Anchor("F CM-A (REVIEW)", MIS);
  check("parseV124Anchor: id with WRONG section is rejected (never trusted)", q.cands.length === 0 && q.rejected.length === 1);
  const n = BR.parseV124Anchor("none", MIS);
  check("parseV124Anchor: 'none' states no mission", n.statesNone && n.cands.length === 0);
}
const V144 = fs.readFileSync(path.join(ROOT, "docs/odg/V14_4_ROADMAP.md"), "utf8");
const phases = BR.parseV144PhaseTable(V144);
check("parseV144PhaseTable: 9 phases 0..8 from the ADOPTED V14.4 §2 table", phases.map((p: any) => p.phase).join(",") === "0,1,2,3,4,5,6,7,8");
check("parseV144PhaseTable: phase 3 anchors E CM-V234-RESIDENT-DRIVER, F, G", JSON.stringify(phases[3].entries) === JSON.stringify([{ section: "E", missionId: "CM-V234-RESIDENT-DRIVER" }, { section: "F", missionId: null }, { section: "G", missionId: null }]));
{
  const m = BR.deriveBoussoleRefs({ items: [{ id: "X", kind: "WORK_ITEM_CONTRACT" }], contracts: { path: "c", data: { contracts: [{ scenario: "X" }] } }, evidence: null });
  check("missing boussole evidence ⇒ NOT_MEASURED with reason (no default anchor)", m.get("X").status === "NOT_MEASURED" && /missing/.test(m.get("X").reason) && m.get("X").v124MissionId === null);
}

// ── real committed state ───────────────────────────────────────────────────────────────────────────────────────────
const src = SS.loadSources(ROOT);
const reg = REG.buildRegister(src);
const items = reg.items;
const cov = reg.boussole.coverage;
check("uniform: EVERY register item carries a BREF-1 boussoleRef", items.length > 0 && items.every((it: any) => it.boussoleRef && it.boussoleRef.rule === "BREF-1" && it.boussoleRef.canonical === "V12.4"));
check("coverage counts = measured + NOT_MEASURED over all items", cov.items === items.length && cov.measured + cov.notMeasured === items.length && cov.measured === items.filter((it: any) => it.boussoleRef.status === "MEASURED").length);
check("every MEASURED ref cites ≥1 source pointer (file#field) and ≥1 V150 requirement id", items.filter((it: any) => it.boussoleRef.status === "MEASURED").every((it: any) => it.boussoleRef.source.length > 0 && it.boussoleRef.source.every((s: string) => /^[^#\s]+#\S/.test(s)) && it.boussoleRef.v150RequirementIds.length > 0));
check("every NOT_MEASURED ref carries a reason and no anchor", items.filter((it: any) => it.boussoleRef.status === "NOT_MEASURED").every((it: any) => typeof it.boussoleRef.reason === "string" && it.boussoleRef.reason.length > 10 && it.boussoleRef.v124MissionId === null && it.boussoleRef.v144Phase === null && it.boussoleRef.v150RequirementIds.length === 0));
const companion = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/v124-consolidated-roadmap.json"), "utf8")).missions;
check("every v124MissionId exists in the canonical V12.4 companion with the stated section", items.filter((it: any) => it.boussoleRef.v124MissionId).every((it: any) => companion.some((m: any) => m.id === it.boussoleRef.v124MissionId && m.section === it.boussoleRef.v124Section)));
check("every null field of a MEASURED ref carries a fieldReason", items.filter((it: any) => it.boussoleRef.status === "MEASURED").every((it: any) => ["v124MissionId", "v124Section", "v144Phase"].every((f) => it.boussoleRef[f] !== null || (it.boussoleRef.fieldReasons && typeof it.boussoleRef.fieldReasons[f] === "string"))));
const ref = (id: string) => items.find((it: any) => it.id === id).boussoleRef;
check("A ⇒ V150-AP-A, E CM-V234-RESIDENT-DRIVER, V14.4 phase 3 (matrix row + adopted table)", ref("A").v150RequirementIds.join() === "V150-AP-A" && ref("A").v124MissionId === "CM-V234-RESIDENT-DRIVER" && ref("A").v124Section === "E" && ref("A").v144Phase === 3);
check("G2 inherits scenario G through contract.parent.scenario (cited)", ref("G2").v150RequirementIds.join() === "V150-AP-G" && ref("G2").source.some((s: string) => /\.parent\.scenario$/.test(s)));
check("G phase AMBIGUOUS [1,2] ⇒ null + reason (never picked)", ref("G").v144Phase === null && /AMBIGUOUS/.test(ref("G").fieldReasons.v144Phase));
check("J / J2: matrix states no V12.4 mission ⇒ nulls with reason, still MEASURED via V150-AP-J", ref("J").status === "MEASURED" && ref("J").v124MissionId === null && ref("J2").v150RequirementIds.join() === "V150-AP-J");
check("V175-NB1 (no parent, no A–P scenario) ⇒ NOT_MEASURED", ref("V175-NB1").status === "NOT_MEASURED");
check("CP8 capability gaps / method cards ⇒ NOT_MEASURED (no committed field links them)", items.filter((it: any) => /^CP8_/.test(it.kind)).every((it: any) => it.boussoleRef.status === "NOT_MEASURED"));
check("CREF-1: every WORK_ITEM_CONTRACT carries contractRef.contractSha256; owner-scoped ones an owner-record path that exists", items.filter((it: any) => it.kind === "WORK_ITEM_CONTRACT").every((it: any) => /^[0-9a-f]{64}$/.test(it.contractRef.contractSha256) && (it.contractRef.ownerRecord === null ? typeof it.contractRef.ownerRecordReason === "string" : fs.existsSync(path.join(ROOT, it.contractRef.ownerRecord)))));
{
  const { boussoleEvidence: _b, ...noB } = src;
  const reg0 = REG.buildRegister(noB);
  const strip = (r: any) => JSON.stringify(r.items.map((it: any) => ({ id: it.id, status: it.status, criteria: it.criteria, deps: it.deps, requiresOwnerAuthorization: it.requiresOwnerAuthorization })));
  check("BREF-1 changes no status / criterion / dependency / owner flag (register with vs without boussole evidence)", strip(reg0) === strip(reg) && reg0.items.every((it: any) => it.boussoleRef.status === "NOT_MEASURED"));
  check("selection unchanged by BREF-1", JSON.stringify(SS.compute({ ...noB, inputs: [] }).decision) === JSON.stringify(SS.compute({ ...src, inputs: [] }).decision));
}
check("deterministic: two builds byte-identical", JSON.stringify(REG.buildRegister(src).items.map((it: any) => it.boussoleRef)) === JSON.stringify(items.map((it: any) => it.boussoleRef)));
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V164_STRATEGIC_REGISTER.json"), "utf8"));
check("committed register carries the same boussole coverage", JSON.stringify(committed.register.boussole.coverage) === JSON.stringify(cov));
process.stdout.write(`coverage: ${cov.measured}/${cov.items} MEASURED, ${cov.notMeasured} NOT_MEASURED; v124MissionId ${cov.withV124MissionId}, v144Phase ${cov.withV144Phase}\n`);
if (failures) { process.stdout.write(`${failures} odg-boussole-ref test(s) FAILED\n`); process.exit(1); }
process.stdout.write("all odg-boussole-ref tests passed\n");
export {};
