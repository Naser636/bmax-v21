#!/usr/bin/env node
/**
 * seo-structured-data-validator — validate JSON-LD structured data for schema.org SHAPE + the REQUIRED properties Google
 * documents per rich-result type. This closes the KNOWN_GAP declared in seo-technical-audit.ts (which only checks JSON-LD
 * PARSEABILITY + presence of @context/@type). It consumes the `jsonLd` string surfaced by seo-page-signal-extractor.
 *
 * PURE / deterministic: NO network, NO schema fetch — validation is against a small, GROUNDED table of required properties
 * (Google Search Central, verified 2026-10-30, cited in-code). Fail-closed/HONEST:
 *  - a type NOT in the grounded table is reported "type-not-validated" (structural checks only) — NEVER pass/fail-fabricated;
 *  - Article is a KNOWN type with NO required properties (Google: "add the properties that apply") — so NO required finding
 *    is invented for it; only recommended properties are noted (INFO);
 *  - invalid JSON ⇒ structured error; a missing REQUIRED property ⇒ HIGH (not rich-result eligible), per Google policy.
 * It PUBLISHES NOTHING and makes NO ranking/rich-result-guarantee claim. Findings shape {id,area,severity,detail,
 * remediation,evidence}. NO new primitive.
 *
 * Grounding (Google Search Central, 2026-10-30):
 *  - BreadcrumbList: required itemListElement[]; each ListItem needs position (integer) + name; item required unless last.
 *  - FAQPage: required mainEntity[] of Question; each Question needs name + acceptedAnswer; acceptedAnswer needs text.
 *  - Product: required name + at least one of offers | review | aggregateRating.
 *  - Article: NO required properties (recommended: headline, image, datePublished, author) — NOT enforced as required.
 */
"use strict";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const MAX_JSON = 2 * 1024 * 1024;
const typeOf = (b: any): string[] => { const t = isObj(b) ? b["@type"] : null; return (Array.isArray(t) ? t : [t]).filter((x) => typeof x === "string").map((x) => String(x)); };
const hasType = (b: any, name: string): boolean => typeOf(b).some((t) => t.toLowerCase() === name.toLowerCase());
const asArray = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

// Grounded required-property validators per known @type. Each returns an array of {prop, detail} for MISSING requireds.
const KNOWN: Record<string, (b: any) => any[]> = {
  breadcrumblist(b: any) {
    const miss: any[] = [];
    const items = asArray(b.itemListElement);
    if (!items.length) { miss.push({ prop: "itemListElement", detail: "BreadcrumbList requires a non-empty itemListElement array" }); return miss; }
    items.forEach((li: any, i: number) => {
      const last = i === items.length - 1;
      if (!isObj(li)) { miss.push({ prop: `itemListElement[${i}]`, detail: "each breadcrumb must be a ListItem object" }); return; }
      if (!(typeof li.position === "number" && Number.isInteger(li.position))) miss.push({ prop: `itemListElement[${i}].position`, detail: "ListItem requires an integer position" });
      if (!(typeof li.name === "string" && li.name.trim()) && !(isObj(li.item) && typeof li.item.name === "string" && li.item.name.trim())) miss.push({ prop: `itemListElement[${i}].name`, detail: "ListItem requires a name (or item.name)" });
      if (!last && li.item == null) miss.push({ prop: `itemListElement[${i}].item`, detail: "a non-final ListItem requires item (URL or object with @id)" });
    });
    return miss;
  },
  faqpage(b: any) {
    const miss: any[] = [];
    const qs = asArray(b.mainEntity);
    if (!qs.length) { miss.push({ prop: "mainEntity", detail: "FAQPage requires a non-empty mainEntity array of Question" }); return miss; }
    qs.forEach((q: any, i: number) => {
      if (!isObj(q) || !hasType(q, "Question")) { miss.push({ prop: `mainEntity[${i}]`, detail: "each mainEntity must be a Question" }); return; }
      if (!(typeof q.name === "string" && q.name.trim())) miss.push({ prop: `mainEntity[${i}].name`, detail: "Question requires a name (the question text)" });
      const ans = q.acceptedAnswer;
      if (ans == null) miss.push({ prop: `mainEntity[${i}].acceptedAnswer`, detail: "Question requires an acceptedAnswer" });
      else if (isObj(ans) && !(typeof ans.text === "string" && ans.text.trim())) miss.push({ prop: `mainEntity[${i}].acceptedAnswer.text`, detail: "acceptedAnswer requires text" });
    });
    return miss;
  },
  product(b: any) {
    const miss: any[] = [];
    if (!(typeof b.name === "string" && b.name.trim())) miss.push({ prop: "name", detail: "Product requires a name" });
    if (b.offers == null && b.review == null && b.aggregateRating == null) miss.push({ prop: "offers|review|aggregateRating", detail: "Product requires at least one of offers, review, or aggregateRating" });
    return miss;
  },
};
// Known types that have NO required properties (so their absence is NEVER a required finding).
const NO_REQUIRED: Record<string, string[]> = {
  article: ["headline", "image", "datePublished", "author"],
  newsarticle: ["headline", "image", "datePublished", "author"],
  blogposting: ["headline", "image", "datePublished", "author"],
};

/** validateStructuredData(jsonLd): jsonLd = string | object | array (JSON-LD). Returns { ok, verdict, blocks, findings }. */
function validateStructuredData(jsonLd: any): any {
  let data: any;
  if (typeof jsonLd === "string") {
    if (jsonLd.length > MAX_JSON) return { ok: false, code: "TOO_LARGE", reason: `JSON-LD exceeds ${MAX_JSON} bytes` };
    if (!jsonLd.trim()) return { ok: false, code: "EMPTY", reason: "no JSON-LD supplied" };
    try { data = JSON.parse(jsonLd); } catch (e: any) { return { ok: false, code: "INVALID_JSON", reason: `JSON-LD is not valid JSON: ${(e && e.message) || e}` }; }
  } else if (isObj(jsonLd) || Array.isArray(jsonLd)) {
    // object/array input is supported — apply the SAME bound + serialisability guard as the string path (so a circular
    // or oversize object fails CLOSED with a structured error, never an uncaught throw).
    let s: string;
    try { s = JSON.stringify(jsonLd); } catch { return { ok: false, code: "INVALID_INPUT", reason: "jsonLd object is not JSON-serialisable (circular reference?)" }; }
    if (typeof s === "string" && s.length > MAX_JSON) return { ok: false, code: "TOO_LARGE", reason: `JSON-LD exceeds ${MAX_JSON} bytes` };
    data = jsonLd;
  } else return { ok: false, code: "INVALID_INPUT", reason: "jsonLd must be a string, object, or array" };

  // flatten top-level blocks: a bare object, an array, or an {@context,@graph:[...]} wrapper — RECURSIVELY (bounded depth),
  // so a nested @graph is also unwrapped and its real nodes are examined (not the inner wrapper).
  const blocksRaw: any[] = [];
  const collect = (node: any, depth: number) => {
    if (depth > 8) { blocksRaw.push(node); return; }   // depth guard (no unbounded recursion); keep the node if too deep
    for (const top of asArray(node)) {
      if (isObj(top) && Array.isArray(top["@graph"])) collect(top["@graph"], depth + 1);
      else blocksRaw.push(top);
    }
  };
  collect(data, 0);

  const findings: any[] = [];
  const add = (id: string, severity: string, detail: string, remediation: string, evidence: string) => findings.push({ id, area: "structured-data", severity, detail, remediation, evidence });
  const blocks: any[] = [];

  blocksRaw.forEach((b: any, i: number) => {
    if (!isObj(b)) { add(`block[${i}]:shape`, "MEDIUM", "structured-data block is not an object", "each JSON-LD node must be an object", `block ${i}`); blocks.push({ index: i, type: null, validated: false }); return; }
    const types = typeOf(b);
    if (!types.length) { add(`block[${i}]:type`, "MEDIUM", "block has no @type", "add a schema.org @type", `block ${i}`); blocks.push({ index: i, type: null, validated: false }); return; }
    // @context may legitimately live on an @graph wrapper, so absence on a child block is not flagged; but a PRESENT
    // @context that does not reference schema.org is a real defect. Guard the stringify (defensive — input is already
    // serialisable from the entry guard, but keep it crash-proof regardless of how the block was constructed).
    if (b["@context"] != null) {
      let ctxStr: string | null = null;
      try { ctxStr = typeof b["@context"] === "string" ? b["@context"] : JSON.stringify(b["@context"]); } catch { ctxStr = null; }
      if (ctxStr != null && !/schema\.org/i.test(ctxStr)) add(`block[${i}]:context`, "LOW", "@context does not reference schema.org", "use \"@context\": \"https://schema.org\"", `type ${types.join(",")}`);
    }

    // SELECT the grounded type across the WHOLE @type array (not just types[0]): prefer a type with REQUIRED-prop checks
    // (KNOWN), then a known-no-required type, else fall back to the first — so ["Thing","Product"] still validates Product.
    let key = types.map((t) => t.toLowerCase()).find((t) => KNOWN[t]) || null;
    if (!key) key = types.map((t) => t.toLowerCase()).find((t) => NO_REQUIRED[t]) || null;
    const primary = key ? types.find((t) => t.toLowerCase() === key) || types[0] : types[0];
    let validated = false, requiredMissing: string[] = [];
    if (key && KNOWN[key]) {
      validated = true;
      const miss = KNOWN[key](b);
      for (const m of miss) { requiredMissing.push(m.prop); add(`${key}:required`, "HIGH", `${primary} is missing a REQUIRED property — not eligible for the rich result: ${m.detail}`, `add '${m.prop}'`, `block ${i} type ${primary}`); }
    } else if (key && NO_REQUIRED[key]) {
      validated = true;   // known type, no required props — note missing RECOMMENDED ones as INFO (never HIGH)
      const recMissing = NO_REQUIRED[key].filter((p) => b[p] == null);
      if (recMissing.length) add(`${key}:recommended`, "LOW", `${primary} is missing recommended properties (not required): ${recMissing.join(", ")}`, "add the recommended properties that apply to your content", `block ${i}`);
    } else {
      add(`block[${i}]:type-not-validated`, "INFO", `@type '${primary}' is not in the grounded required-property table — only structural checks applied (no pass/fail on required properties)`, "none (informational)", `type ${primary}`);
    }
    blocks.push({ index: i, type: primary, types, validated, requiredMissing });
  });

  const high = findings.filter((f) => f.severity === "HIGH").length;
  const validatedCount = blocks.filter((b: any) => b.validated).length;
  const verdict = high > 0 ? "INVALID" : (findings.some((f) => f.severity === "MEDIUM") ? "ISSUES" : (validatedCount ? "VALID" : "NOT_VALIDATED"));
  return {
    ok: true, verdict,
    summary: { blockCount: blocks.length, validatedBlocks: validatedCount, typesValidatedWithRequired: Object.keys(KNOWN), high },
    blocks, findings: findings.sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 } as any)[a.severity] - ({ HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 } as any)[b.severity]),
    limitations: [
      "validates REQUIRED properties only for a GROUNDED set of types (BreadcrumbList, FAQPage, Product) + known-no-required types (Article family); ALL OTHER @types get structural checks only and are reported 'type-not-validated' (never pass/fail-fabricated)",
      "checks presence/shape of required properties, NOT full schema.org range/datatype conformance, and NOT Google's complete per-type recommendation set",
      "a 'VALID' verdict means the validated blocks carry their documented REQUIRED properties — it is NOT a guarantee of rich-result eligibility or display, and NOT a ranking claim",
      "nothing is fetched or published",
    ],
    note: "Fail-closed JSON-LD validator: required-property checks only where grounded; unknown types ⇒ not validated (not faked); Article has no required props (not invented); no rich-result/ranking guarantee.",
  };
}

export { validateStructuredData };
module.exports = { validateStructuredData };

if (require.main === module) {
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "https://e.com/" }, { "@type": "ListItem", position: 2, name: "Page" }] });
  const r = validateStructuredData(jsonLd);
  process.stdout.write(JSON.stringify({ verdict: r.verdict, blocks: r.blocks.map((b: any) => b.type), findings: r.findings.map((f: any) => f.id) }, null, 2) + "\n");
}
