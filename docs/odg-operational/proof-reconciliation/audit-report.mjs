// AUDIT REPORT — reproducible, explainable, traceable output (step 7/10) + self-contained HTML for review.
// €0, local only (NOT published anywhere). The HTML is the professional demonstrator view. No external assets.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eur = (n) => typeof n === 'number' ? '€' + n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

export function buildAudit({ ingestLedger, ingestBank, reconcile, verify, meta = {} }) {
  const blocked = verify && verify.verdict !== 'PASS';
  const audit = {
    product: 'Reconciliation Assurance (ODG) — DEMONSTRATOR on SYNTHETIC data',
    generated: meta.generated || 'deterministic',
    inputs: { ledger: ingestLedger?.provenance, bank: ingestBank?.provenance },
    ingestOk: !!(ingestLedger?.ok && ingestBank?.ok),
    reconciliation: reconcile ? { matched: reconcile.matchedCount, findings: reconcile.findingsCount, byType: reconcile.byType, needsReview: reconcile.needsReviewCount, certain: reconcile.certainFindingsCount, ledgerTotal: reconcile.ledgerTotal, bankTotal: reconcile.bankTotal } : null,
    independentVerification: verify || null,
    successClaim: blocked ? 'BLOCKED — independent verification did NOT PASS; no success asserted' : 'ASSERTED — independent verification PASSED',
    integrity: meta.integrity || null, // sha256 content digest of the reconciliation report (tamper-evidence)
    findings: reconcile?.findings || [],
    limits: ['SYNTHETIC data only', 'structured inputs (CSV/text); unstructured PDF/scan extraction NOT implemented (interface+cost-estimate only)', 'no live ERP/bank integration', 'human acceptance of flagged items is a separate, required step'],
  };

  const tiles = [
    ['Matched', reconcile?.matchedCount ?? '—'], ['Findings', reconcile?.findingsCount ?? '—'],
    ['Need review', reconcile?.needsReviewCount ?? '—'], ['Certain', reconcile?.certainFindingsCount ?? '—'],
    ['Verify', verify ? verify.verdict : '—'], ['Recall/Prec', verify ? `${verify.recall}/${verify.precision}` : '—'],
  ];
  const rows = (reconcile?.findings || []).map(f => `<tr class="${f.confidence === 'NEEDS_REVIEW' ? 'rev' : 'cert'}"><td>${esc(f.type)}</td><td>${esc(f.ref)}</td><td>${esc(f.confidence)}</td><td>${esc(f.explain)}</td><td class="prov">${esc(JSON.stringify(f.provenance || {}))}</td></tr>`).join('');
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reconciliation Assurance — rapport d'audit (DÉMO synthétique)</title>
<style>
:root{--bg:#0e1116;--card:#161b22;--fg:#e6edf3;--mut:#8b949e;--line:#30363d;--ok:#2ea043;--rev:#d29922;--bad:#f85149;--accent:#2f81f7}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
.wrap{max-width:1000px;margin:0 auto;padding:28px 18px}
h1{font-size:22px;margin:0 0 2px}.sub{color:var(--mut);font-size:13px;margin-bottom:18px}
.banner{background:#3b2f0b;border:1px solid var(--rev);color:#f2cc60;padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:18px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.tile .v{font-size:24px;font-weight:700}.tile .k{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.verdict{display:inline-block;padding:4px 10px;border-radius:999px;font-weight:700;font-size:13px}
.verdict.PASS{background:rgba(46,160,67,.15);color:var(--ok);border:1px solid var(--ok)}
.verdict.BLOCKED{background:rgba(248,81,73,.15);color:var(--bad);border:1px solid var(--bad)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-weight:600;background:#11161c}tr:last-child td{border-bottom:0}
tr.rev td:first-child{box-shadow:inset 3px 0 0 var(--rev)}tr.cert td:first-child{box-shadow:inset 3px 0 0 var(--ok)}
.prov{color:var(--mut);font-family:ui-monospace,monospace;font-size:11px}
.limits{margin-top:20px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;font-size:13px;color:var(--mut)}
.limits li{margin:3px 0}.foot{color:var(--mut);font-size:12px;margin-top:18px}
@media(prefers-color-scheme:light){:root{--bg:#fff;--card:#f6f8fa;--fg:#1f2328;--mut:#656d76;--line:#d0d7de}}
</style></head><body><div class="wrap">
<h1>Reconciliation Assurance — rapport d'audit</h1>
<div class="sub">ODG · gouvernance anti-faux-succès · généré de façon déterministe</div>
<div class="banner">⚠ DÉMONSTRATEUR — données SYNTHÉTIQUES. Ni le produit final, ni des données client réelles.</div>
<div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>
<p>Vérification indépendante : <span class="verdict ${blocked ? 'BLOCKED' : 'PASS'}">${blocked ? 'BLOQUÉ (pas de succès déclaré)' : 'PASS'}</span>
&nbsp; Totaux : grand livre ${eur(reconcile?.ledgerTotal)} · banque ${eur(reconcile?.bankTotal)}</p>
<table><thead><tr><th>Type</th><th>Réf</th><th>Confiance</th><th>Explication</th><th>Provenance</th></tr></thead><tbody>${rows || '<tr><td colspan="5">aucun écart</td></tr>'}</tbody></table>
<div class="limits"><b>Limites connues</b><ul>${audit.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>
<div class="foot">Reproductible : <code>node run-pipeline.mjs</code>. Le moteur et le vérificateur sont des codes SÉPARÉS ; aucun succès n'est déclaré sans vérification indépendante PASS.</div>
</div></body></html>`;
  return { audit, html };
}
