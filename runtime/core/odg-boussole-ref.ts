#!/usr/bin/env node
"use strict";

/*
 * V17.5 PRIORITY 3 — « Boussole reliée à l'exécution ». PURE + deterministic derivation of a source-cited `boussoleRef`
 * for EVERY strategic-register item (rule BREF-1), composed by odg-strategic-register.buildRegister. It is a FIELD on the
 * existing register records (V169 Phase-0 gap BUP-1, rank 1 in gapsByBlockedValue; linking mechanism proposed by
 * V171_V150_RECONCILIATION_MATRIX.consolidatedProposal.linkingMechanism) — NOT a new registry, scheduler or crosswalk.
 *
 * Chain (each hop cites the field it read; nothing is guessed — a hop without stated evidence yields null + reason):
 *   item ─(own committed fields)→ V15.0 requirement rows of the V171 reconciliation matrix (v150RequirementIds)
 *        ─(row.anchors.v12_4, validated against the canonical V12.4 companion docs/odg/v124-consolidated-roadmap.json)→
 *          V12.4 mission id / section
 *        ─(the ADOPTED V14.4 roadmap §2 table "V12.4 anchor(s)" column)→ V14.4 phase
 * Precedence (V175_GOVERNANCE_PRECEDENCE PREC-1): V12.4 is canonical; V14.4 organises its execution; the addendum extends
 * V14.4; V15.0 is PROPOSED. The matrix rows are a PROPOSED documentary reconciliation: their anchors are statements of
 * that record, not owner adoption — the ref says which record it rests on.
 *
 * Honesty: BREF-1 was written by the technical provider (Claude Code); ODG applies it mechanically. It changes no status,
 * criterion, weight, threshold or selection.
 */

const BREF_RULE = "BREF-1 (provider-authored; applied uniformly to every register item): (1) v150RequirementIds — WORK_ITEM_CONTRACT: the V171 matrix row whose v150.section is '§45 scenario X' for X = the contract scenario when it is an A–P letter, else contract.parent.scenario when that is an A–P letter (stated lineage); V150_TOP10_ITEM: rows of each V150 summary.top10NextInternal[i].advances entry ('§45-X' ⇒ '§45 scenario X', '§N…' ⇒ '§N'); V150_ALSO_INTERNAL / V150_OWNER_GATED: rows of the '§N' citations of the item's own V150 summary text (a citation directly preceded by a document name, e.g. 'V15_CLOSURE_DOSSIER §8', is not a V15.0 section and is skipped); every other kind: no field links it ⇒ []. (2) V12.4 — each row's anchors.v12_4 segment '<S> <MISSION-ID>' counts only if the canonical V12.4 companion lists MISSION-ID with section S; a section-only segment '<S> …' counts as section S only if the companion has a mission in S; 'none' / 'transversal' state no mission; v124MissionId = the single distinct mission over all rows, else null (ambiguous or none); v124Section = that mission's section, else the single distinct section, else null. (3) v144Phase — from the ADOPTED docs/odg/V14_4_ROADMAP.md §2 table: a phase matches a mission candidate when its 'V12.4 anchor(s)' cell names that mission id, or names its section letter without a mission id; a section-only candidate matches cells naming that letter without a mission id; v144Phase = the single distinct matched phase, else null. status = MEASURED iff ≥1 requirement row resolved (each measured ref cites ≥1 source pointer), else NOT_MEASURED with the reason; per-field nulls carry fieldReasons.";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function uniq(xs: any[]): any[] { return Array.from(new Set(xs)); }

/* parseV144PhaseTable(text) — rows of the V14.4 §2 table: { phase, name, cell, entries:[{section, missionId|null}] }. */
function parseV144PhaseTable(text: string): any[] {
  const lines = String(text || "").split("\n");
  const start = lines.findIndex((l) => /^##\s*2\./.test(l));
  if (start < 0) return [];
  const out: any[] = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    const cells = lines[i].split("|").map((c) => c.trim());
    if (cells.length < 5) continue;
    const m = /^(\d+)\s+(.+)$/.exec(cells[1]);
    if (!m) continue;
    const cell = cells[3];
    const entries: any[] = [];
    const re = /(?:^|[,;]\s*|\*\*)([A-S])\s+(?:`([A-Z0-9-]+)`)?/g;
    let e: any;
    while ((e = re.exec(cell)) !== null) entries.push({ section: e[1], missionId: e[2] || null });
    out.push({ phase: Number(m[1]), name: m[2].trim(), cell, line: i + 1, entries });
  }
  return out;
}

/* sectionCitations(text) — '§N' citations of a V150 summary text (top-level number), skipping document-qualified ones. */
function sectionCitations(text: string): string[] {
  const out: string[] = [];
  const re = /§(\d+)/g;
  let m: any;
  const s = String(text || "");
  while ((m = re.exec(s)) !== null) {
    const before = s.slice(0, m.index).replace(/\s+$/, "");
    const prev = before.slice(-1);
    if (before.length && prev !== "(" && prev !== "," && prev !== ";" && !/\b(?:and|et)$/.test(before)) continue;
    out.push("§" + m[1]);
  }
  return uniq(out);
}

/* advanceToSection(a) — a top10 advances entry → the matrix v150.section key. */
function advanceToSection(a: string): string | null {
  const s = String(a);
  const x = /^§45-([A-P])\b/.exec(s);
  if (x) return "§45 scenario " + x[1];
  const n = /^§(\d+)/.exec(s);
  return n ? "§" + n[1] : null;
}

/* parseV124Anchor(text, v124Missions) — candidates {missionId|null, section, segment} validated against the companion. */
function parseV124Anchor(text: string, missions: any[]): any {
  const cands: any[] = [], rejected: any[] = [];
  let statesNone = false;
  const bySection = new Set(missions.map((m: any) => String(m.section)));
  for (const seg of String(text || "").split(";").map((x) => x.trim()).filter(Boolean)) {
    if (/^(none|transversal)\b/i.test(seg)) { statesNone = true; continue; }
    const ids = Array.from(seg.matchAll(/\b([A-S])\s+((?:CM|SX)-[A-Z0-9-]+)/g));
    if (ids.length) {
      for (const k of ids) {
        const m = missions.find((x: any) => x.id === k[2]);
        if (m && String(m.section) === k[1]) cands.push({ missionId: k[2], section: k[1], segment: seg });
        else rejected.push({ segment: seg, reason: m ? `companion lists ${k[2]} in section ${m.section}, not ${k[1]}` : `${k[2]} absent from the V12.4 companion` });
      }
      continue;
    }
    const s = /^([A-S])\b/.exec(seg);
    if (s && bySection.has(s[1])) cands.push({ missionId: null, section: s[1], segment: seg });
    else rejected.push({ segment: seg, reason: "no '<section> <mission-id>' or known section letter" });
  }
  return { cands, rejected, statesNone };
}

/*
 * deriveBoussoleRefs({ items, contracts, v150, evidence }) → Map id → boussoleRef. evidence = sources.boussoleEvidence:
 *   { matrix:{path,data}, v124:{path,data}, v144:{path,text}, correspondence?:{path,data}, precedence?:{path,data} }.
 * Missing evidence ⇒ every ref NOT_MEASURED with the reason (never a default anchor).
 */
function deriveBoussoleRefs(input: any): Map<string, any> {
  const items = arr(input && input.items);
  const ev = input && isObj(input.evidence) ? input.evidence : null;
  const out = new Map<string, any>();
  const nm = (reason: string, extra: any = {}) => ({ status: "NOT_MEASURED", rule: "BREF-1", canonical: "V12.4", v124MissionId: null, v124Section: null, v144Phase: null, v150RequirementIds: [], source: [], reason, ...extra });
  const M = ev && ev.matrix && isObj(ev.matrix.data) && Array.isArray(ev.matrix.data.requirements) ? ev.matrix : null;
  const C124 = ev && ev.v124 && isObj(ev.v124.data) && Array.isArray(ev.v124.data.missions) ? ev.v124 : null;
  const P144 = ev && ev.v144 && typeof ev.v144.text === "string" ? ev.v144 : null;
  if (!M || !C124 || !P144) {
    const why = `boussole evidence missing (${[!M && "V171 matrix", !C124 && "V12.4 companion", !P144 && "V14.4 roadmap"].filter(Boolean).join(", ")}) ⇒ no derivation`;
    for (const it of items) out.set(it.id, nm(why));
    return out;
  }
  const rows: any[] = M.data.requirements;
  const rowBySection = new Map<string, number>();
  rows.forEach((r: any, i: number) => { const s = r && r.v150 ? String(r.v150.section) : ""; if (s && !rowBySection.has(s)) rowBySection.set(s, i); });
  const missions: any[] = C124.data.missions;
  const phases = parseV144PhaseTable(P144.text);
  const corr = ev.correspondence && isObj(ev.correspondence.data) ? ev.correspondence : null;
  const contracts = arr(input.contracts && input.contracts.data && input.contracts.data.contracts);
  const cpath = input.contracts ? input.contracts.path : "contracts";
  const V = input.v150 && isObj(input.v150.data) && isObj(input.v150.data.summary) ? input.v150 : null;
  const top10 = V ? arr(V.data.summary.top10NextInternal) : [];
  const also = V ? arr(V.data.summary.alsoInternal) : [];
  const og = V ? arr(V.data.summary.ownerGated) : [];

  for (const it of items) {
    // (1) requirement sections from the item's own committed fields
    let wanted: { section: string; source: string }[] = [];
    let noLinkReason = "";
    if (it.kind === "WORK_ITEM_CONTRACT") {
      const ci = contracts.findIndex((c: any) => String(c.scenario) === it.id);
      const c = contracts[ci] || {};
      const own = /^[A-P]$/.test(String(c.scenario)) ? String(c.scenario) : null;
      const par = !own && isObj(c.parent) && /^[A-P]$/.test(String(c.parent.scenario)) ? String(c.parent.scenario) : null;
      if (own) wanted = [{ section: "§45 scenario " + own, source: `${cpath}#contracts[${ci}].scenario` }];
      else if (par) wanted = [{ section: "§45 scenario " + par, source: `${cpath}#contracts[${ci}].parent.scenario` }];
      else noLinkReason = `contract scenario '${c.scenario}' is not an A–P §45 scenario and contract.parent.scenario is ${isObj(c.parent) ? JSON.stringify(c.parent.scenario) : "absent"} ⇒ no committed field links it to a V15.0 requirement row`;
    } else if (it.kind === "V150_TOP10_ITEM") {
      const i = Number(String(it.id).replace(/^V150-T/, "")) - 1;
      const t = top10[i];
      if (t) wanted = arr(t.advances).map((a: any, j: number) => ({ section: advanceToSection(a) as string, source: `${V.path}#summary.top10NextInternal[${i}].advances[${j}]` })).filter((w: any) => w.section);
      if (!wanted.length) noLinkReason = "top10 entry has no '§' advances";
    } else if (it.kind === "V150_ALSO_INTERNAL" || it.kind === "V150_OWNER_GATED") {
      const i = it.kind === "V150_ALSO_INTERNAL" ? Number(String(it.id).replace(/^V150-AI/, "")) - 1 : Number(String(it.id).replace(/^V150-OG/, "")) - 1;
      const txt = it.kind === "V150_ALSO_INTERNAL" ? also[i] : og[i];
      const ptr = `${V ? V.path : "V150"}#summary.${it.kind === "V150_ALSO_INTERNAL" ? "alsoInternal" : "ownerGated"}[${i}]`;
      wanted = sectionCitations(String(txt || "")).map((s) => ({ section: s, source: ptr }));
      if (!wanted.length) noLinkReason = "the item's V150 summary text cites no V15.0 '§' section";
    } else {
      noLinkReason = `no committed field links a ${it.kind} item to a V15.0 requirement, V12.4 mission or V14.4 phase (CP8 records carry no section/mission/phase reference)`;
    }
    const reqs: any[] = [], src: string[] = [], unmatched: string[] = [];
    for (const w of wanted) {
      const ri = rowBySection.get(w.section);
      if (ri === undefined) { unmatched.push(w.section); continue; }
      if (!reqs.some((r) => r.i === ri)) reqs.push({ i: ri, id: rows[ri].id });
      src.push(w.source, `${M.path}#requirements[${ri}].v150.section`);
    }
    if (!reqs.length) { out.set(it.id, nm(noLinkReason || `cited sections [${unmatched.join(", ")}] have no row in the V171 matrix`, unmatched.length ? { unmatchedSections: unmatched } : {})); continue; }
    // (2) V12.4 anchors of those rows
    const cands: any[] = [], rejected: any[] = [];
    let statesNone = 0;
    for (const r of reqs) {
      const a = isObj(rows[r.i].anchors) ? rows[r.i].anchors.v12_4 : undefined;
      if (typeof a !== "string") continue;
      const p = parseV124Anchor(a, missions);
      if (p.statesNone) statesNone++;
      for (const c of p.cands) cands.push({ ...c, requirement: r.id });
      for (const x of p.rejected) rejected.push({ ...x, requirement: r.id });
      src.push(`${M.path}#requirements[${r.i}].anchors.v12_4`);
    }
    const mids = uniq(cands.filter((c) => c.missionId).map((c) => c.missionId)).sort();
    const v124MissionId = mids.length === 1 ? mids[0] : null;
    const secs = uniq(cands.map((c) => c.section)).sort();
    const v124Section = v124MissionId ? String(missions.find((m: any) => m.id === v124MissionId).section) : secs.length === 1 ? secs[0] : null;
    for (const id of mids) src.push(`${C124.path}#missions[id=${id}].section`);
    // (3) V14.4 phase via the adopted §2 table
    const matched: any[] = [];
    for (const c of cands) for (const ph of phases) {
      const hit = ph.entries.some((e: any) => (c.missionId ? (e.missionId === c.missionId || (e.missionId === null && e.section === c.section)) : (e.missionId === null && e.section === c.section)));
      if (hit) matched.push({ phase: ph.phase, line: ph.line, via: c.missionId || `section ${c.section}` });
    }
    const phs = uniq(matched.map((m) => m.phase)).sort((a: number, b: number) => a - b);
    const v144Phase = phs.length === 1 ? phs[0] : null;
    for (const m of uniq(matched.map((m) => m.line))) src.push(`${P144.path}#L${m} (§2 phase table)`);
    const fieldReasons: any = {};
    if (!v124MissionId) fieldReasons.v124MissionId = mids.length > 1 ? `AMBIGUOUS: rows anchor ${mids.length} V12.4 missions [${mids.join(", ")}]` : statesNone && !cands.length ? "the matrix rows state no V12.4 mission (none/transversal)" : "no row anchor names a V12.4 mission id (section-only or none)";
    if (!v124Section) fieldReasons.v124Section = secs.length > 1 ? `AMBIGUOUS: sections [${secs.join(", ")}]` : "no V12.4 section stated";
    if (v144Phase === null) fieldReasons.v144Phase = phs.length > 1 ? `AMBIGUOUS: V14.4 phases [${phs.join(", ")}]` : "no V14.4 §2 table cell names the anchored mission/section";
    const census = corr && v124MissionId ? (() => { const k = arr(corr.data.missions).findIndex((m: any) => m.id === v124MissionId); return k >= 0 ? { summary: corr.data.missions[k].summary, source: `${corr.path}#missions[${k}].summary` } : null; })() : null;
    out.set(it.id, {
      status: "MEASURED", rule: "BREF-1", canonical: "V12.4",
      v124MissionId, v124Section, v144Phase,
      v150RequirementIds: reqs.map((r) => r.id),
      source: uniq(src),
      candidates: { v124: cands.map((c) => ({ requirement: c.requirement, missionId: c.missionId, section: c.section })), v144Phases: phs },
      ...(Object.keys(fieldReasons).length ? { fieldReasons } : {}),
      ...(rejected.length ? { rejectedAnchors: rejected } : {}),
      ...(unmatched.length ? { unmatchedSections: unmatched } : {}),
      ...(census ? { v124MissionCensus: census } : {}),
      basis: `${M.path} is ${String(M.data.status || "").split(" ")[0] || "UNSTATED"} (documentary reconciliation): anchors are its statements; V12.4 ids validated against ${C124.path}; phase from ${P144.path} (ADOPTED)`,
    });
  }
  return out;
}

/* coverage(register) — measured vs NOT_MEASURED counts over all items (and per kind / per field). */
function boussoleCoverage(items: any[]): any {
  const byKind: any = {};
  let measured = 0, withMission = 0, withSection = 0, withPhase = 0;
  for (const it of arr(items)) {
    const b = it.boussoleRef || {};
    const k = (byKind[it.kind] = byKind[it.kind] || { items: 0, measured: 0, notMeasured: 0 });
    k.items++;
    if (b.status === "MEASURED") { measured++; k.measured++; } else k.notMeasured++;
    if (b.v124MissionId) withMission++;
    if (b.v124Section) withSection++;
    if (b.v144Phase !== null && b.v144Phase !== undefined) withPhase++;
  }
  return { rule: "BREF-1", items: arr(items).length, measured, notMeasured: arr(items).length - measured, withV124MissionId: withMission, withV124Section: withSection, withV144Phase: withPhase, byKind };
}

const BOUSSOLE_REF_CONTRACT = Object.freeze({
  id: "V175-BOUSSOLE-REF",
  source: "owner CTO directive 2026-11-24 PRIORITY 3 « Boussole reliée à l'exécution » (relayed by the coordinating session); V169 Phase-0 gapsByBlockedValue rank 1 (BUP-1); V171 matrix consolidatedProposal.linkingMechanism",
  invariants: Object.freeze([
    "a field on the existing register items — no new registry, scheduler, crosswalk or decision engine",
    "uniform rule (BREF-1) over every item; NOT_MEASURED with a reason where no committed field links the item — never a default anchor",
    "every MEASURED ref cites ≥1 source pointer (file#field); V12.4 ids are validated against the canonical V12.4 companion",
    "changes no status, criterion, weight, threshold, score or selection; V12.4 text, ROADMAP.json and owner records untouched",
  ]),
});

module.exports = { BREF_RULE, deriveBoussoleRefs, boussoleCoverage, parseV144PhaseTable, sectionCitations, advanceToSection, parseV124Anchor, BOUSSOLE_REF_CONTRACT };
export {};
