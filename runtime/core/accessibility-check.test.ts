#!/usr/bin/env node
"use strict";
/* V145 MÉTIER 5 — accessibility-check battery (RGAA 4.1.2 / WCAG 2.1 AA automated subset). Proves each automatable criterion
 * is detected on realistic (quoted) HTML, a clean page passes the AUTOMATED checks, and — critically — the result ALWAYS
 * declares manualReviewRequired (an automated scan NEVER establishes full conformance). Fail-closed on empty input. */
const A = require("./accessibility-check.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const crit = (r: any) => r.findings.map((f: any) => f.criterion);

function main() {
  // a clean, well-formed page passes the AUTOMATED subset (but still needs manual review).
  const good = '<!doctype html><html lang="fr"><head><title>Accueil</title></head><body><img src="x" alt="logo"><label for="n">Nom</label><input id="n" type="text"><a href="/">Accueil</a><button>Envoyer</button><h1>T</h1><h2>S</h2></body></html>';
  const g = A.auditHtml(good);
  check("clean page ⇒ 0 automated issues (conformantAutomated) BUT manualReviewRequired stays true", g.totalIssues === 0 && g.conformantAutomated === true && g.manualReviewRequired === true && g.automatedOnly === true);

  // each automatable criterion is detected
  check("1.1.1 img without alt ⇒ detected", crit(A.auditHtml('<html lang="fr"><title>t</title><img src="x"></html>')).includes("1.1.1"));
  check("1.3.1 input without label ⇒ detected", crit(A.auditHtml('<html lang="fr"><title>t</title><input id="z" type="text"></html>')).includes("1.3.1"));
  check("2.4.2 missing <title> ⇒ detected", crit(A.auditHtml('<html lang="fr"><body>x</body></html>')).includes("2.4.2"));
  check("2.4.4 empty link ⇒ detected", crit(A.auditHtml('<html lang="fr"><title>t</title><a href="/"></a></html>')).includes("2.4.4"));
  check("3.1.1 <html> without lang ⇒ detected", crit(A.auditHtml('<html><title>t</title></html>')).includes("3.1.1"));
  check("4.1.2 button without name ⇒ detected", crit(A.auditHtml('<html lang="fr"><title>t</title><button></button></html>')).includes("4.1.2"));
  check("1.3.1 heading skip (h1→h3) ⇒ detected", A.auditHtml('<html lang="fr"><title>t</title><h1>a</h1><h3>b</h3></html>').findings.some((f: any) => f.criterion === "1.3.1" && /heading/.test(f.detail)));
  check("4.1.1 duplicate id ⇒ detected", crit(A.auditHtml('<html lang="fr"><title>t</title><div id="a"></div><div id="a"></div></html>')).includes("4.1.1"));

  // a label via aria-label / aria-labelledby ⇒ NOT flagged (no false positive).
  check("input with aria-label ⇒ NOT flagged (no false positive)", !crit(A.auditHtml('<html lang="fr"><title>t</title><input type="text" aria-label="Nom"></html>')).includes("1.3.1"));
  check("decorative img with alt=\"\" ⇒ NOT flagged", !crit(A.auditHtml('<html lang="fr"><title>t</title><img src="x" alt=""></html>')).includes("1.1.1"));

  // THE honesty invariant — manual review always required; automated scan is never a conformance declaration.
  check("manualReviewRequired ALWAYS true (automated ≠ full conformance)", A.auditHtml(good).manualReviewRequired === true && /NOT a conformance declaration/.test(A.auditHtml(good).note));

  // fail-closed on empty input.
  check("empty HTML ⇒ not conformant (fail-closed)", A.auditHtml("").conformantAutomated === false && A.auditHtml(null).conformantAutomated === false);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — accessibility-check (RGAA/WCAG automated subset; criteria detected; no false positives on aria/alt; manual review ALWAYS required; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
