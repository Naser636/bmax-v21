#!/usr/bin/env node
"use strict";
/*
 * V17.5 — GOVERNANCE PRECEDENCE validator. READ-ONLY, deterministic, no network, no clock.
 *
 * Consumes the SINGLE precedence record docs/odg/evidence/V175_GOVERNANCE_PRECEDENCE.json (no second registry: every rule
 * lives in that record; this module only applies it) and checks the records that previously encoded the wrong readings
 * behind the reconciliation contradictions V171-CTR-1, V171-CTR-2 and V171-CTR-4:
 *   - verifyQuotes      : every owner/source quote in the record is VERBATIM in its cited source (never paraphrased);
 *   - sourceStatuses    : the status of each layer (V12.4 / V14.4 / addendum / V15.0) as written in its own file;
 *   - checkPrecedence   : CTR-1 — the record's precedence order is consistent with those statuses (a PROPOSED V15.0 never
 *                         outranks an ADOPTED V14.4), and §51 rule 1 is campaign-scoped;
 *   - classifyPath / campaignContracts / checkRadarScope : CTR-2 — V15.0-campaign contracts never write a Radar-stage path
 *                         and their scope excludes Radar change; Radar-stage changes sit under V12.4 I / V14.4 phase-1 anchors;
 *   - phaseOrder / checkOrdering : CTR-4 — in all three numberings continuity is placed no later than the Radar;
 *   - checkQctr2Derivation : V176 — Q-CTR2 re-derivation (owner V176 item 1) is consistent: the block is lifted only if every
 *                         part is coherent; otherwise answer null + blocking + residual question;
 *   - checkMatrix       : the reconciliation matrix rows/topContradictions cite this record and no longer carry the
 *                         CONTRADICTION reading the record resolved.
 * It never edits any file. Dual export.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const RECORD_PATH = "docs/odg/evidence/V175_GOVERNANCE_PRECEDENCE.json";
const MATRIX_PATH = "docs/odg/evidence/V171_V150_RECONCILIATION_MATRIX.json";
const V150_SOURCES_PATH = "docs/odg/evidence/V150_CANONICAL_SOURCES.json";

function read(root: string, rel: string): string { return fs.readFileSync(path.join(root, rel), "utf8"); }
function readJson(root: string, rel: string): any { return JSON.parse(read(root, rel)); }
function loadRecord(root: string = ROOT): any { return readJson(root, RECORD_PATH); }

/* the text a quote points to: a V15.0 section field (from the recovered canonical sources) or a whole repository file. */
function quoteTarget(root: string, q: any): string | null {
  if (q && q.v150Section) {
    const s = (readJson(root, V150_SOURCES_PATH).sections || []).find((x: any) => x.id === q.v150Section);
    if (!s) return null;
    return q.field === "title" ? String(s.title || "") : String((s.acceptance || {}).quote || "");
  }
  if (q && q.path && fs.existsSync(path.join(root, q.path))) return read(root, q.path);
  return null;
}

function allQuotes(rec: any): any[] {
  const out: any[] = [];
  for (const q of (rec.precedence || {}).derivedFrom || []) out.push(q);
  for (const q of (rec.radarScope || {}).derivedFrom || []) out.push(q);
  for (const s of rec.sources || []) if (s.statusEvidence) out.push(s.statusEvidence);
  for (const q of (rec.authority || {}).quotes || []) out.push(q);
  for (const r of rec.resolutions || []) for (const q of r.conflictingTexts || []) out.push(q);
  for (const oq of rec.ownerQuestions || []) {
    const d = oq.v176Derivation; if (!d) continue;
    if (d.authority) out.push(d.authority);
    for (const q of (d.partA || {}).basis || []) out.push(q);
    for (const k of ["readingStage", "readingFunction"]) for (const q of ((d.partB || {})[k] || {}).quotes || []) out.push(q);
  }
  return out;
}

/* V176 — Q-CTR2 derivation consistency (owner V176 item 1): the blocking rule may be lifted ONLY when every part of the
 * derivation is coherent; a NOT_COHERENT part keeps answer null + blocking + a stated residual question (never invented). */
function checkQctr2Derivation(rec: any): string[] {
  const v: string[] = [];
  const q2 = (rec.ownerQuestions || []).find((q: any) => q.id === "Q-CTR2");
  if (!q2) return ["Q-CTR2 missing from ownerQuestions"];
  const d = q2.v176Derivation;
  if (!d) return v;
  if (!d.authority || d.authority.record !== "docs/odg/V176_OWNER_DIRECTIVE_DEBLOCAGE_FINAL.json") v.push("Q-CTR2 derivation does not cite the V176 owner record");
  const parts = [d.partA, d.partB].filter(Boolean);
  const allCoherent = parts.length === 2 && parts.every((p: any) => p.coherent === true);
  const answered = q2.answer !== null && q2.answer !== undefined;
  if (answered && !allCoherent) v.push("Q-CTR2 answered although a part of its derivation is NOT coherent");
  if (!allCoherent && (q2.blocking !== true || answered)) v.push("Q-CTR2 derivation not coherent ⇒ must stay blocking with answer null");
  if (!allCoherent && !(typeof q2.residualQuestion === "string" && q2.residualQuestion.length > 0)) v.push("Q-CTR2 not coherent but no residualQuestion stated");
  const pb = d.partB || {};
  if (pb.coherent === false && !((pb.readingStage || {}).quotes || []).length) v.push("partB NOT_COHERENT without the quotes of the stage reading");
  if (pb.coherent === false && !((pb.readingFunction || {}).quotes || []).length) v.push("partB NOT_COHERENT without the quotes of the function reading");
  // part A (new grant / new Radar module = modification) must be what the classifier enforces for NEW paths
  if ((d.partA || {}).coherent === true) for (const p of ["docs/odg/V999_RESEARCH_GRANT.json", "runtime/core/odg-radar-new-stage.ts"]) if (classifyPath(rec, p) !== "RADAR_STAGE") v.push(`partA: new path ${p} is not classified RADAR_STAGE`);
  return v;
}

/* verifyQuotes → [{text, where, ok}] ; a missing source or a non-verbatim quote is NOT ok (fail-closed). */
function verifyQuotes(rec: any, root: string = ROOT): any[] {
  return allQuotes(rec).map((q: any) => {
    const t = quoteTarget(root, q);
    return { text: q.text, where: q.v150Section ? `${V150_SOURCES_PATH}#${q.v150Section}.${q.field}` : q.path, ok: t !== null && typeof q.text === "string" && q.text.length > 0 && t.includes(q.text) };
  });
}

/* status of each layer as written in its own file (statusEvidence text must be present). */
function sourceStatuses(rec: any, root: string = ROOT): Record<string, string> {
  const out: Record<string, string> = {};
  const header = (rel: string) => read(root, rel).split("\n").slice(0, 12).join("\n");
  out.V14_4 = /\*\*Status: ADOPTED\*\*/.test(header("docs/odg/V14_4_ROADMAP.md")) ? "ADOPTED" : "NOT_ADOPTED";
  out.V15_0 = /\*\*Status: PROPOSED\.\*\*/.test(header("docs/odg/V15_0_MASTER_DIRECTIVE.md")) ? "PROPOSED" : /Status: ADOPTED/.test(header("docs/odg/V15_0_MASTER_DIRECTIVE.md")) ? "ADOPTED" : "UNKNOWN";
  out.ADDENDUM = /\*\*Statut : RECORDED\*\*/.test(header("docs/odg/V14_4_ADDENDUM_BOUSSOLE_VIVANTE.md")) ? "RECORDED" : "UNKNOWN";
  out.V12_4 = read(root, "docs/odg/V14_4_ROADMAP.md").includes("Boussole V12.4 is fully preserved") ? "CANONICAL" : "UNKNOWN";
  return out;
}

/* CTR-1 */
function checkPrecedence(rec: any, root: string = ROOT): string[] {
  const v: string[] = [];
  const st = sourceStatuses(rec, root);
  for (const s of rec.sources || []) if (st[s.id] && st[s.id] !== s.status) v.push(`source ${s.id}: record says ${s.status}, file says ${st[s.id]} — re-evaluate the precedence record`);
  const order: string[] = (rec.precedence || {}).order || [];
  const ix = (id: string) => order.indexOf(id);
  if (!(ix("V12_4") >= 0 && ix("V12_4") < ix("V14_4") && ix("V14_4") < ix("ADDENDUM"))) v.push("order must keep V12_4 > V14_4 > ADDENDUM");
  if (st.V15_0 !== "ADOPTED" && !(ix("V15_0") > ix("V14_4") && ix("V15_0") > ix("ADDENDUM"))) v.push("a non-ADOPTED V15.0 outranks an adopted/recorded Boussole layer");
  const s51 = quoteTarget(root, { v150Section: "§51", field: "quote" }) || "";
  if (!/directive unique de cette campagne/.test(s51)) v.push("§51 rule 1 is no longer campaign-scoped in the source — the CTR-1 resolution does not hold");
  if (!/V12\.4 reste la Boussole canonique/.test(s51)) v.push("§51 rule 2 (V12.4 canonical) missing from the source");
  return v;
}

/* CTR-2 — path classification by the record's stage patterns (KNOWLEDGE/OTHER is never RADAR). */
function classifyPath(rec: any, p: string): string {
  const rs = rec.radarScope || {};
  const any = (pats: string[]) => (pats || []).some((re: string) => new RegExp(re).test(p));
  if (any(rs.radarStagePatterns)) return "RADAR_STAGE";
  if (any(rs.sharedWithRadarPatterns)) return "SHARED_WITH_RADAR";
  if (any(rs.knowledgeStagePatterns)) return "KNOWLEDGE_STAGE";
  return "OTHER";
}
function wsPath(entry: any): string { return String(entry).split(" ")[0]; }

/* every WORK_ITEM_CONTRACT the record says to look at, tagged with its campaign membership (SCOPE-1). */
function campaignContracts(rec: any, root: string = ROOT): any[] {
  const cs = rec.campaignScope || {};
  const marker = new RegExp(cs.v150Marker || "V15\\.0");
  const out: any[] = [];
  for (const f of cs.campaignContractFiles || []) {
    for (const c of readJson(root, f).contracts || []) {
      const w = c.WORK_ITEM_CONTRACT || {};
      const battery = new RegExp(cs.campaignScenarioPattern || "^[A-P][0-9]*$").test(String(c.scenario || ""));
      const src = [c.ownerText, c.authorizedBy, w.objective].map((x: any) => (typeof x === "string" ? x : JSON.stringify(x || ""))).join(" ");
      out.push({ id: `${f}#${c.scenario}`, v150Campaign: battery || marker.test(src), scope: String(w.scope || ""), writeSet: (w.write_set || []).map(wsPath), anchored: false });
    }
  }
  const dir = path.join(root, "docs/odg");
  for (const name of fs.readdirSync(dir).filter((n: string) => /^WIC_.*\.json$/.test(n)).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    const src = [d.source, d.authorization, d.objective, d.ownerText].map((x: any) => (typeof x === "string" ? x : JSON.stringify(x || ""))).join(" ");
    const anchor = JSON.stringify(d.v124Anchor || d.v124Link || "");
    out.push({ id: `docs/odg/${name}`, v150Campaign: marker.test(src), scope: String(d.scope || ""), writeSet: (d.write_set || []).map(wsPath), anchored: /CM-RADAR-GATE-CHAIN/.test(anchor) || /^1 /.test(String(d.v144Phase || "")) });
  }
  return out;
}

function checkRadarScope(rec: any, root: string = ROOT, contracts?: any[]): string[] {
  const v: string[] = [];
  for (const c of contracts || campaignContracts(rec, root)) {
    const radar = c.writeSet.filter((p: string) => classifyPath(rec, p) === "RADAR_STAGE");
    if (c.v150Campaign) {
      // Q-CTR2-BLOCK: while the owner has not answered Q-CTR2, a V15.0-campaign write to the knowledge stage is BLOCKED
      const q2 = (rec.ownerQuestions || []).find((q: any) => q.id === "Q-CTR2");
      const know = c.writeSet.filter((p: string) => classifyPath(rec, p) === "KNOWLEDGE_STAGE");
      if (q2 && q2.blocking && (q2.answer === null || q2.answer === undefined) && know.length) v.push(`${c.id}: BLOCKED by Q-CTR2 — V15.0-campaign contract writes knowledge-stage paths ${know.join(", ")}`);
      if (radar.length) v.push(`${c.id}: V15.0-campaign contract writes Radar-stage paths ${radar.join(", ")} (§38/§47)`);
      const excl = ((rec.campaignScope || {}).radarExclusionPatterns || []).some((re: string) => new RegExp(re, "i").test(c.scope));
      if (!excl) v.push(`${c.id}: V15.0-campaign contract scope does not exclude Radar change`);
    } else if (radar.length && !c.anchored) {
      v.push(`${c.id}: Radar-stage write ${radar.join(", ")} without a V12.4 I / V14.4 phase-1 anchor`);
    }
  }
  return v;
}

/* CTR-4 — index of the continuity phase and of the Radar phase in each numbering, read from the sources themselves. */
function phaseOrder(root: string = ROOT): any {
  const v144 = read(root, "docs/odg/V14_4_ROADMAP.md").split("\n").filter((l: string) => /^\| [0-9] /.test(l));
  const num = (l: string) => Number(l.slice(2, 3));
  const c144 = v144.find((l: string) => /continuity/i.test(l)); const r144 = v144.find((l: string) => /^\| [0-9] Radar/.test(l));
  const add = read(root, "docs/odg/V14_4_ADDENDUM_BOUSSOLE_VIVANTE.md").split("\n").filter((l: string) => /^### Phase [0-9]+ — /.test(l));
  const an = (re: RegExp) => { const l = add.find((x: string) => re.test(x)); return l ? Number(/Phase ([0-9]+)/.exec(l)![1]) : null; };
  const t = (id: string) => quoteTarget(root, { v150Section: id, field: "title" }) || "";
  const pn = (s: string) => { const m = /PHASE ([0-9]+)/.exec(s); return m ? Number(m[1]) : null; };
  return {
    V14_4: { continuity: c144 ? num(c144) : null, radar: r144 ? num(r144) : null },
    ADDENDUM: { continuity: an(/Continuité/), radar: an(/Radar/) },
    V15_0: { continuity: pn(t("§30")), radar: pn(t("§38")) },
  };
}

function checkOrdering(rec: any, root: string = ROOT): string[] {
  const v: string[] = [];
  const po = phaseOrder(root);
  for (const k of Object.keys(po)) {
    const { continuity, radar } = po[k];
    if (continuity === null || radar === null) v.push(`${k}: continuity/Radar phase not found in the source (NOT_MEASURED ⇒ fail-closed)`);
    else if (continuity > radar) v.push(`${k}: continuity phase ${continuity} after Radar phase ${radar} — ORD-2 broken, a real ordering contradiction needs the owner`);
  }
  if (!read(root, "docs/odg/V14_4_ADDENDUM_BOUSSOLE_VIVANTE.md").includes("Les phases ne doivent pas devenir une séquence artificiellement rigide")) v.push("addendum non-rigid sequencing clause missing");
  const m = readJson(root, "docs/odg/evidence/V169_V14_4_ADDENDUM_RECONCILIATION.json").comparisonWithRepoV14_4[0].mapping || {};
  for (let i = 0; i <= 9; i++) if (!Object.keys(m).some((k: string) => k.startsWith(`A${i} `))) v.push(`addendum phase A${i} has no V14.4 mapping`);
  const pm = (readJson(root, MATRIX_PATH).consolidatedProposal || {}).phaseMapping || [];
  for (let i = 0; i <= 8; i++) if (!pm.some((r: any) => String(r.v14_4Phase).startsWith(`${i} `))) v.push(`V14.4 phase ${i} missing from the V15.0 phase mapping`);
  return v;
}

/* the reconciliation matrix must cite the record and no longer carry the resolved CONTRADICTION reading. */
function checkMatrix(rec: any, ctrId: string, root: string = ROOT): string[] {
  const v: string[] = [];
  const mx = readJson(root, MATRIX_PATH);
  const r = (rec.resolutions || []).find((x: any) => x.id === ctrId);
  if (!r) return [`${ctrId}: no resolution in the precedence record`];
  // an INTERIM resolution (owner choice pending) must never read as plainly resolved in the matrix
  const interim = r.ownerChoiceNeeded === true;
  if (interim && !/INTERIM pending/.test(String(r.status || ""))) v.push(`${ctrId}: owner choice pending but record status '${r.status}' does not say INTERIM`);
  const top = (mx.topContradictions || []).find((x: any) => x.id === ctrId);
  const wantState = interim ? r.status : "RESOLVED_AT_SOURCE";
  if (!top || top.state !== wantState || top.resolvedBy !== RECORD_PATH) v.push(`${ctrId}: matrix topContradictions entry must be state '${wantState}' citing ${RECORD_PATH}`);
  for (const rowId of r.matrixRows || []) {
    const row = (mx.requirements || []).find((x: any) => x.id === rowId);
    if (!row) { v.push(`${rowId}: row missing`); continue; }
    const pr = row.precedence || {};
    if (pr.record !== RECORD_PATH) v.push(`${rowId}: row does not cite the precedence record`);
    if (interim) {
      if (pr.status !== r.status) v.push(`${rowId}: interim row must carry precedence.status '${r.status}'`);
      if (row.relation !== pr.relationBeforeV175) v.push(`${rowId}: interim row relation changed to ${row.relation} (must stay ${pr.relationBeforeV175} until the owner answers)`);
    } else {
      if (row.relation === "CONTRADICTION") v.push(`${rowId}: relation is still CONTRADICTION`);
      if ((row.alsoRelations || []).some((s: string) => /^CONTRADICTION/.test(s))) v.push(`${rowId}: alsoRelations still carries a CONTRADICTION`);
    }
  }
  for (const pm of (mx.consolidatedProposal || {}).phaseMapping || []) if (pm.blockedBy === ctrId) v.push(`phaseMapping '${pm.v14_4Phase}' still blockedBy ${ctrId}`);
  const byRel: Record<string, number> = {};
  for (const row of mx.requirements || []) byRel[row.relation] = (byRel[row.relation] || 0) + 1;
  if (JSON.stringify(byRel, Object.keys(byRel).sort()) !== JSON.stringify((mx.counts || {}).byRelation || {}, Object.keys(byRel).sort())) v.push("matrix counts.byRelation inconsistent with its rows");
  return v;
}

module.exports = { RECORD_PATH, MATRIX_PATH, loadRecord, verifyQuotes, checkQctr2Derivation, sourceStatuses, checkPrecedence, classifyPath, campaignContracts, checkRadarScope, phaseOrder, checkOrdering, checkMatrix };
export {};
