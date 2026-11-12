#!/usr/bin/env node
"use strict";
/*
 * V145 MÉTIER 5 (digital accessibility — RGAA 4.1.2 / WCAG 2.1 AA / EN 301 549) — AUTOMATED ACCESSIBILITY CHECK. PURE,
 * deterministic, fail-closed. Market/regulatory research (EAA extends the obligation to PMEs >10 employees or >2M€ turnover;
 * sanctions up to 50 000 € per non-conforming service; DGCCRF/Arcom control since Jan 2026 — accessio.pro/obligations-
 * accessibilite) confirms real demand. This builds the AUTOMATED subset of checks on an HTML string (no DOM library — regex
 * scan). CRITICAL HONESTY: an automated scan NEVER establishes full RGAA/WCAG conformance; manual expert checks are required.
 * Each finding cites its WCAG success criterion. No network, no rendering (contrast needs declared colours — not inferred).
 *
 * auditHtml(html, opts?) -> { findings[], criteriaChecked[], automatedOnly:true, manualReviewRequired:true, summary }.
 */
function isStr(v: any): boolean { return typeof v === "string"; }

function auditHtml(html: any, opts?: any): any {
  const h = isStr(html) ? html : "";
  const findings: any[] = [];
  const add = (criterion: string, level: string, detail: string, count: number) => { if (count > 0) findings.push({ criterion, level, detail, count }); };
  const criteriaChecked = ["1.1.1", "1.3.1-label", "2.4.2", "2.4.4", "3.1.1", "4.1.2-button", "1.3.1-heading-order", "4.1.1-dup-id"];

  if (!isStr(html) || h.trim().length === 0) {
    return Object.freeze({ findings: Object.freeze([{ criterion: "INPUT", level: "N/A", detail: "no HTML supplied — cannot audit (fail-closed)", count: 0 }]), criteriaChecked: Object.freeze([]), automatedOnly: true, manualReviewRequired: true, conformantAutomated: false, note: "fail-closed: empty input is not conformant" });
  }

  // 1.1.1 Non-text content — <img> without an alt attribute (decorative images still need alt="").
  const imgs = h.match(/<img\b[^>]*>/gi) || [];
  add("1.1.1", "A", "images without an alt attribute (non-text content needs a text alternative; decorative ⇒ alt=\"\")", imgs.filter((t: string) => !/\balt\s*=/i.test(t)).length);

  // 1.3.1 Info & relationships — form inputs with no associated label (no id matched by a <label for>, no aria-label/aria-labelledby, not wrapped).
  const inputs = h.match(/<input\b[^>]*>/gi) || [];
  const labelFors = new Set((h.match(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi) || []).map((l: string) => (l.match(/for\s*=\s*["']([^"']+)["']/i) || [])[1]));
  const unlabeled = inputs.filter((t: string) => {
    const type = (t.match(/\btype\s*=\s*["']?([a-z]+)/i) || [])[1] || "text";
    if (/^(hidden|submit|button|reset|image)$/i.test(type)) return false;       // these don't need a <label>
    if (/\baria-label(ledby)?\s*=/i.test(t)) return false;
    const id = (t.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1];
    return !(id && labelFors.has(id));
  }).length;
  add("1.3.1", "A", "form inputs without an associated label (for/id, aria-label, or aria-labelledby)", unlabeled);

  // 2.4.2 Page titled — missing/empty <title>.
  add("2.4.2", "A", "page has no non-empty <title>", /<title\b[^>]*>\s*<\/title>/i.test(h) || !/<title\b/i.test(h) ? 1 : 0);

  // 2.4.4 Link purpose — anchors with href but no text content and no aria-label (empty/ambiguous link).
  const anchors = h.match(/<a\b[^>]*\bhref\b[^>]*>([\s\S]*?)<\/a>/gi) || [];
  add("2.4.4", "A", "links with no discernible text or aria-label (empty/ambiguous link purpose)", anchors.filter((a: string) => { const inner = (a.match(/>([\s\S]*?)<\/a>/i) || [])[1] || ""; const text = inner.replace(/<[^>]+>/g, "").trim(); return text.length === 0 && !/\baria-label\s*=/i.test(a) && !/<img\b[^>]*\balt\s*=\s*["'][^"']+["']/i.test(inner); }).length);

  // 3.1.1 Language of page — <html> without a lang attribute.
  add("3.1.1", "A", "the <html> element has no lang attribute (page language not declared)", /<html\b/i.test(h) && !/<html\b[^>]*\blang\s*=/i.test(h) ? 1 : 0);

  // 4.1.2 Name, Role, Value — <button> with no text and no aria-label (unnamed control).
  const buttons = h.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
  add("4.1.2", "A", "buttons with no accessible name (no text content, no aria-label)", buttons.filter((b: string) => { const inner = (b.match(/>([\s\S]*?)<\/button>/i) || [])[1] || ""; return inner.replace(/<[^>]+>/g, "").trim().length === 0 && !/\baria-label\s*=/i.test(b); }).length);

  // 1.3.1 heading order — a heading level that skips (e.g. h1 then h3).
  const levels = (h.match(/<h([1-6])\b/gi) || []).map((t: string) => Number((t.match(/h([1-6])/i) || [])[1]));
  let skips = 0; for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) skips++;
  add("1.3.1", "A", "heading levels skip a rank (e.g. h1→h3) — broken document structure", skips);

  // 4.1.1 Parsing — duplicate id attributes (breaks name/role/value + label association).
  const ids = (h.match(/\bid\s*=\s*["']([^"']+)["']/gi) || []).map((m: string) => (m.match(/id\s*=\s*["']([^"']+)["']/i) || [])[1]);
  const dup = ids.length - new Set(ids).size;
  add("4.1.1", "A", "duplicate id attributes (invalid; breaks label/ARIA association)", dup);

  const totalIssues = findings.reduce((n, f) => n + f.count, 0);
  return Object.freeze({
    findings: Object.freeze(findings.map((f) => Object.freeze(f))),
    criteriaChecked: Object.freeze(criteriaChecked),
    totalIssues,
    automatedOnly: true,
    manualReviewRequired: true,
    conformantAutomated: totalIssues === 0,
    summary: `${totalIssues} automated issue(s) across ${findings.length} criteria`,
    note: "AUTOMATED SUBSET of RGAA 4.1.2 / WCAG 2.1 AA only — a clean automated pass is NOT a conformance declaration. Contrast, meaningful alt text, keyboard order, focus management and many criteria REQUIRE manual expert review. Reference: EN 301 549 v3.2.1.",
  });
}

const ACCESSIBILITY_CHECK_CONTRACT = Object.freeze({
  id: "V145-ACCESSIBILITY-CHECK",
  metier: "M5 digital accessibility (RGAA 4.1.2 / WCAG 2.1 AA / EN 301 549)",
  invariants: Object.freeze([
    "automated subset only — NEVER claims full conformance; manual expert review always required",
    "each finding cites its WCAG success criterion; no rendering (contrast needs declared colours)",
    "fail-closed: empty/invalid HTML ⇒ not conformant; pure/deterministic; no network; no new primitive",
    "does NOT assess whether an organisation is legally obligated — that is a separate, sourced determination",
  ]),
});
module.exports = { auditHtml, ACCESSIBILITY_CHECK_CONTRACT };
export {};
