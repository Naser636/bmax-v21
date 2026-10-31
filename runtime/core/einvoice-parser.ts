#!/usr/bin/env node
/**
 * einvoice-parser — PRODUCT SLICE 2 of e-invoice-finance-operations: parse a structured e-invoice XML (UN/CEFACT CII
 * — the Factur-X XML — or OASIS UBL Invoice) into the neutral invoice MODEL that einvoice-validator consumes, then
 * validate it. Namespace-agnostic (matches by localName, robust to prefix variation). Monetary amounts are converted
 * via python3's Decimal (EXACT at 2 decimals) into integer MINOR units — no JS float. python3 stdlib only (ElementTree
 * + decimal) — NO install. Fail-closed: malformed XML ⇒ PARSE_ERROR finding; unknown root ⇒ UNSUPPORTED_FORMAT;
 * python3 absent ⇒ BLOCKED (never a fake parse). Source provenance (format + the element localNames read) is recorded.
 *
 * HONEST SUPPORTED SUBSET (enumerated, not "full conformance"): invoice id (BT-1), issue date (BT-2), currency (BT-5),
 * seller/buyer name, line net amounts (BT-131), and the document totals BT-106/109/110/112. Everything else (parties'
 * tax ids, VAT breakdown lines BG-23, allowances/charges detail, Factur-X PDF/A-3 embedding) is a KNOWN GAP. Composes
 * einvoice-validator (EN16931-core rules) — NO new primitive.
 */
"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const V = require("./einvoice-validator.js");

// python3 stdlib extractor: argv[1]=xml path, argv[2]=format(CII|UBL). Prints JSON model, or {"error":...}. No network.
const PY_EXTRACT = [
  "import sys, json, re",
  "import xml.etree.ElementTree as ET",
  "from decimal import Decimal, InvalidOperation",
  "def ln(t): return t.split('}')[-1] if isinstance(t,str) else t",
  "def minor(txt):",
  "  if txt is None: return None",
  "  t=str(txt).strip()",
  "  if not re.fullmatch(r'\\d+(\\.\\d{1,2})?', t): return None",   // non-negative, <=2dp only; reject >2dp/sci-notation/separators/signs (flagged, not silently rounded)
  "  try: return int(Decimal(t)*100)",
  "  except (InvalidOperation, ValueError): return None",
  "def ratebps(txt):",   // VAT percent (BT-119) -> basis points where 10000=100% (20 -> 2000, 5.5 -> 550); <=2dp only
  "  if txt is None: return None",
  "  t=str(txt).strip()",
  "  if not re.fullmatch(r'\\d+(\\.\\d{1,2})?', t): return None",
  "  try:",
  "    v=Decimal(t)*100",
  "    return int(v) if v==v.to_integral_value() else None",
  "  except (InvalidOperation, ValueError): return None",
  "def finds(el, name):",
  "  return [e for e in el.iter() if ln(e.tag)==name]",
  "def first_text(el, name):",
  "  for e in el.iter():",
  "    if ln(e.tag)==name and e.text and e.text.strip(): return e.text.strip()",
  "  return None",
  "try:",
  "  tree=ET.parse(sys.argv[1]); root=tree.getroot(); fmt=sys.argv[2]; m={}",
  "  if fmt=='CII':",
  "    m['id']=first_text(root,'ID')",
  "    dt=[e for e in root.iter() if ln(e.tag)=='DateTimeString']",
  "    m['issueDate']=(dt[0].text.strip() if dt and dt[0].text else None)",
  "    m['currency']=first_text(root,'InvoiceCurrencyCode')",
  "    sellers=[e for e in root.iter() if ln(e.tag)=='SellerTradeParty']",
  "    buyers=[e for e in root.iter() if ln(e.tag)=='BuyerTradeParty']",
  "    m['seller']={'name': first_text(sellers[0],'Name') if sellers else None}",
  "    m['buyer']={'name': first_text(buyers[0],'Name') if buyers else None}",
  "    lines=[]",
  "    for li in [e for e in root.iter() if ln(e.tag)=='IncludedSupplyChainTradeLineItem']:",
  "      amt=[e for e in li.iter() if ln(e.tag)=='LineTotalAmount']",
  "      if amt and amt[0].text: lines.append({'netMinor': minor(amt[0].text)})",
  "    m['lines']=lines",
  "    sums=[e for e in root.iter() if ln(e.tag)=='SpecifiedTradeSettlementHeaderMonetarySummation']",
  "    s=sums[0] if sums else None",   // no header summation ⇒ totals null (do NOT fall back to a line-level amount)
  "    def g(name):",
  "      if s is None: return None",
  "      for e in s.iter():",
  "        if ln(e.tag)==name and e.text: return minor(e.text)",
  "      return None",
  "    m['totals']={'lineNetSumMinor':g('LineTotalAmount'),'taxExclusiveMinor':g('TaxBasisTotalAmount'),'vatMinor':g('TaxTotalAmount'),'taxInclusiveMinor':g('GrandTotalAmount')}",
  "    bd=[]",   // BG-23 VAT breakdown: one entry per ram:ApplicableTradeTax (header-level)
  "    for tt in [e for e in root.iter() if ln(e.tag)=='ApplicableTradeTax']:",
  "      cat=first_text(tt,'CategoryCode'); rate=None; basis=None; calc=None",
  "      for e in tt.iter():",
  "        nm=ln(e.tag)",
  "        if nm=='RateApplicablePercent' and e.text and rate is None: rate=ratebps(e.text)",
  "        elif nm=='BasisAmount' and e.text and basis is None: basis=minor(e.text)",
  "        elif nm=='CalculatedAmount' and e.text and calc is None: calc=minor(e.text)",
  "      bd.append({'categoryCode':cat,'rateBps':rate,'taxableMinor':basis,'taxMinor':calc})",
  "    if bd: m['vatBreakdown']=bd",
  "  elif fmt=='UBL':",
  "    m['id']=first_text(root,'ID')",
  "    m['issueDate']=first_text(root,'IssueDate')",
  "    m['currency']=first_text(root,'DocumentCurrencyCode')",
  "    supp=[e for e in root.iter() if ln(e.tag)=='AccountingSupplierParty']",
  "    cust=[e for e in root.iter() if ln(e.tag)=='AccountingCustomerParty']",
  "    def pname(p):",
  "      n=first_text(p,'Name')",
  "      return n if n else first_text(p,'RegistrationName')",
  "    m['seller']={'name': pname(supp[0]) if supp else None}",
  "    m['buyer']={'name': pname(cust[0]) if cust else None}",
  "    lines=[]",
  "    for li in [e for e in root.iter() if ln(e.tag)=='InvoiceLine']:",
  "      amt=[e for e in li.iter() if ln(e.tag)=='LineExtensionAmount']",
  "      if amt and amt[0].text: lines.append({'netMinor': minor(amt[0].text)})",
  "    m['lines']=lines",
  "    lmt=[e for e in root.iter() if ln(e.tag)=='LegalMonetaryTotal']",
  "    L=lmt[0] if lmt else None",   // no LegalMonetaryTotal ⇒ totals null (no line-level fallback)
  "    def gu(name):",
  "      if L is None: return None",
  "      for e in L.iter():",
  "        if ln(e.tag)==name and e.text: return minor(e.text)",
  "      return None",
  "    tax=[e for e in root.iter() if ln(e.tag)=='TaxTotal']",
  "    vat=None",
  "    if tax:",
  "      for e in tax[0].iter():",
  "        if ln(e.tag)=='TaxAmount' and e.text: vat=minor(e.text); break",
  "    m['totals']={'lineNetSumMinor':gu('LineExtensionAmount'),'taxExclusiveMinor':gu('TaxExclusiveAmount'),'vatMinor':vat,'taxInclusiveMinor':gu('TaxInclusiveAmount')}",
  "    bd=[]",   // BG-23 VAT breakdown: one entry per cac:TaxSubtotal
  "    for st in [e for e in root.iter() if ln(e.tag)=='TaxSubtotal']:",
  "      taxable=None; taxamt=None",
  "      for e in st.iter():",
  "        nm=ln(e.tag)",
  "        if nm=='TaxableAmount' and e.text and taxable is None: taxable=minor(e.text)",
  "        elif nm=='TaxAmount' and e.text and taxamt is None: taxamt=minor(e.text)",
  "      cat=None; rate=None",
  "      tc=[e for e in st.iter() if ln(e.tag)=='TaxCategory']",
  "      if tc:",
  "        cat=first_text(tc[0],'ID')",
  "        for e in tc[0].iter():",
  "          if ln(e.tag)=='Percent' and e.text: rate=ratebps(e.text); break",
  "      bd.append({'categoryCode':cat,'rateBps':rate,'taxableMinor':taxable,'taxMinor':taxamt})",
  "    if bd: m['vatBreakdown']=bd",
  "  else:",
  "    print(json.dumps({'error':'unsupported format'})); sys.exit(0)",
  "  print(json.dumps(m))",
  "except ET.ParseError as e:",
  "  print(json.dumps({'error':'xml parse error: '+str(e)}))",
  "except Exception as e:",
  "  print(json.dumps({'error':'extract error: '+str(e)}))",
].join("\n");

/** detectFormat(xml): sniff the root — CII (CrossIndustryInvoice) vs UBL (Invoice + UBL namespace). null if neither. */
function detectFormat(xml: string): string | null {
  if (typeof xml !== "string") return null;
  const head = xml.slice(0, 4000);
  if (/CrossIndustryInvoice/.test(head)) return "CII";
  if (/ubl:schema:xsd:Invoice/.test(head) || (/<([a-zA-Z0-9]+:)?Invoice[\s>]/.test(head) && /oasis:names:specification:ubl/.test(head))) return "UBL";
  return null;
}

/**
 * parseInvoiceXml(xml, opts?): parse CII/UBL XML → { ok, format, model, provenance, findings }. Fail-closed.
 * opts.runner(bin,args,{timeout}) injectable (tests); default real python3 spawnSync (no shell, bounded).
 */
// XXE / billion-laughs defense-in-depth. A legitimate CII/UBL e-invoice NEVER carries a DTD; a DOCTYPE/ENTITY
// declaration in an externally-received invoice is only ever an entity-expansion (billion-laughs) amplification or
// an external-entity probe. factur-x-extract claims this is "handled downstream by ElementTree" — but that depends
// entirely on the host libexpat version (expat <2.4.0 does NOT mitigate billion-laughs by default), and was untested.
// We make the guarantee EXPLICIT and version-independent: reject any DOCTYPE/ENTITY declaration BEFORE writing the
// XML to disk or spawning the python child. (Whitespace is tolerated between `<!` and the keyword to defeat a
// lenient-parser bypass.) ElementTree does not resolve EXTERNAL entities, so this specifically closes the
// internal-entity amplification/DoS vector and makes the no-DTD contract testable without running python.
function hasDoctypeOrEntityDecl(xml: string): boolean {
  return /<!\s*DOCTYPE/i.test(xml) || /<!\s*ENTITY/i.test(xml);
}

function parseInvoiceXml(xml: any, opts: any = {}): any {
  if (typeof xml !== "string" || !xml.trim()) return { ok: false, code: "INVALID_INPUT", reason: "xml string required" };
  if (hasDoctypeOrEntityDecl(xml)) return { ok: false, code: "DTD_REJECTED", findings: [{ id: "xml:dtd-rejected", area: "xml", severity: "HIGH", detail: "XML declares a DOCTYPE/ENTITY (DTD). E-invoice XML must not carry a DTD; it is rejected fail-closed to prevent entity-expansion (billion-laughs) amplification, rather than relying on the host XML parser's version-dependent mitigation.", remediation: "supply CII/UBL XML with no DOCTYPE or ENTITY declarations", evidence: "DOCTYPE/ENTITY markup declaration present" }] };
  const fmt = detectFormat(xml);
  if (!fmt) return { ok: false, code: "UNSUPPORTED_FORMAT", findings: [{ id: "format:unsupported", area: "format", severity: "HIGH", detail: "not a recognised CII (CrossIndustryInvoice) or UBL Invoice document", remediation: "supply Factur-X/CII or UBL XML", evidence: "root element not recognised" }] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-einv-"));
  const xmlPath = path.join(dir, "invoice.xml"); const pyPath = path.join(dir, "extract.py");
  try {
    fs.writeFileSync(xmlPath, xml); fs.writeFileSync(pyPath, PY_EXTRACT);
    const runner = typeof opts.runner === "function" ? opts.runner : (bin: string, args: string[], o: any) => cp.spawnSync(bin, args, { encoding: "utf8", timeout: (o && o.timeout) || 10000, maxBuffer: 8 * 1024 * 1024 });
    const r = runner("python3", [pyPath, xmlPath, fmt], { timeout: 10000 });
    if (!r || r.error || typeof r.stdout !== "string") return { ok: false, code: "BLOCKED", findings: [{ id: "xml:blocked", area: "xml", severity: "HIGH", detail: "python3 unavailable or extraction failed to run", remediation: "ensure python3 is present", evidence: String(r && (r.error || r.stderr) || "no runner output") }] };
    let parsed: any; try { parsed = JSON.parse(r.stdout.trim().split("\n").pop() || "{}"); } catch { parsed = { error: "non-JSON extractor output" }; }
    if (parsed && parsed.error) return { ok: false, code: "PARSE_ERROR", findings: [{ id: "xml:malformed", area: "xml", severity: "HIGH", detail: `XML could not be parsed/extracted: ${parsed.error}`, remediation: "provide well-formed CII/UBL XML", evidence: String(parsed.error) }] };
    return { ok: true, format: fmt, model: parsed, provenance: { format: fmt, extractor: "python3-stdlib(ElementTree+Decimal)", mapped: ["id", "issueDate", "currency", "seller.name", "buyer.name", "lines[].netMinor", "totals.{lineNetSum,taxExclusive,vat,taxInclusive}", "vatBreakdown[].{categoryCode,rateBps,taxableMinor,taxMinor} (BG-23, when present)"] }, findings: [] };
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}

const SUPPORTED_SUBSET = Object.freeze(["BT-1 id", "BT-2 issueDate", "BT-5 currency", "seller.name", "buyer.name", "BT-131 line nets", "BT-106/109/110/112 totals", "BR-CO-10/13/15", "BG-23 VAT breakdown (BT-116/117/118/119) when present → BR-CO-14/17"]);
const KNOWN_GAPS = Object.freeze(["party tax ids (SIREN/VAT)", "document allowances/charges detail", "Factur-X PDF/A-3 embedded XML extraction", "full EN16931 rule set (900+)", "payment means / references", "negative line/total amounts other than within a supplied BG-23 breakdown", "amounts with >2 decimals or scientific notation (rejected, not rounded)", "VAT percentages with >2 decimals (rejected)", "UBL document VAT (BT-110) is read as the FIRST cbc:TaxAmount in cac:TaxTotal (schema-valid order); a schema-INVALID external UBL placing a TaxSubtotal before the document TaxAmount would misread it — such input generally fails BR-CO-15, not a clean pass"]);

/** parseAndValidate(xml, opts?): parse CII/UBL → model → EN16931-core validation. Returns the combined report. */
function parseAndValidate(xml: any, opts: any = {}): any {
  const p = parseInvoiceXml(xml, opts);
  if (!p.ok) return { ok: false, code: p.code, format: p.format || null, findings: p.findings || [], supportedSubset: SUPPORTED_SUBSET, knownGaps: KNOWN_GAPS };
  const v = V.validateInvoice(p.model);
  return {
    ok: true, format: p.format, model: p.model, provenance: p.provenance,
    validation: v.ok ? v.report : { error: v.reason },
    supportedSubset: SUPPORTED_SUBSET, knownGaps: KNOWN_GAPS,
    note: "Parsed a SUPPORTED SUBSET of CII/UBL into the neutral model + EN16931-core validation. NOT full CII/UBL/EN16931/Factur-X conformance (see knownGaps). Amounts via exact Decimal→integer minor units.",
  };
}

export { detectFormat, parseInvoiceXml, parseAndValidate, SUPPORTED_SUBSET, KNOWN_GAPS };
module.exports = { detectFormat, parseInvoiceXml, parseAndValidate, SUPPORTED_SUBSET, KNOWN_GAPS };

if (require.main === module) {
  const p = process.argv[2];
  if (!p) { process.stdout.write("usage: einvoice-parser <invoice.xml>\n"); process.exit(0); }
  const r = parseAndValidate(fs.readFileSync(p, "utf8"));
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  process.exit(r.ok && r.validation && r.validation.valid ? 0 : 1);
}
