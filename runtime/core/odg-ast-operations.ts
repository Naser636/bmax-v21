#!/usr/bin/env node
"use strict";
/*
 * V154 — ODG AST-LITE REPOSITORY ENGINEERING OPERATIONS. PURE, deterministic, fail-closed. Extends ODG's native engineering
 * with a SMALL, genuinely-useful set of syntactic operations driven by the REAL TypeScript AST (ts.createSourceFile).
 *
 * HONESTY (directive §3): this is AST, not regex-pretending-to-be-AST — ts.createSourceFile parses the source into a real
 * SourceFile; parseDiagnostics (syntax errors) ⇒ NATIVE_REFUSED. typescript@5.9.3 is an EXISTING repo dependency (no new
 * dependency added); it is loaded statically and used ONLY to PARSE text — no code execution, no eval/new Function/dynamic
 * import of mission input. Semantic tasks (type resolution) need a Program/type-checker and are REFUSED/ESCALATED, not faked
 * at the syntactic tier.
 *
 * SECURITY (V153 continuity): all operations go through a CLOSED deny-by-default registry; runAstOp(opId, payload) takes an
 * opId + typed payload — never a code string. DIAGNOSTIC ops never modify text; TRANSFORM ops verify AST POSTCONDITIONS
 * (re-parse + invariants) and stay reversible candidate patches (real-repo write OWNER_GATED).
 */
const ts = require("typescript");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string"; }

const OUTCOME = Object.freeze({ GREEN: "NATIVE_GREEN", TRANSFORMED: "NATIVE_REPAIRED_GREEN", DIAGNOSED: "DIAGNOSED", REFUSED: "NATIVE_REFUSED", ESCALATED: "ESCALATED_TO_PROVIDER", VALIDATION_FAILED: "VALIDATION_FAILED", NOT_MEASURED: "NOT_MEASURED" });
const MAX_SOURCE = 200000;   // size bound (fail-closed on oversized input)

function parse(source: string): any {
  const sf = ts.createSourceFile("mission.ts", source, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TS);
  const diags = (sf as any).parseDiagnostics || [];
  return { ok: diags.length === 0, sf, syntaxErrors: diags.length };
}

// leading contiguous run of top-level import declarations (safest scope to reorder).
function leadingImportBlock(sf: any): any[] {
  const block: any[] = [];
  for (const st of sf.statements) { if (st.kind === ts.SyntaxKind.ImportDeclaration) block.push(st); else break; }
  return block;
}
function moduleSpec(imp: any): string | null { const m = imp.moduleSpecifier; return m && ts.isStringLiteral(m) ? m.text : null; }
function isSideEffectImport(imp: any): boolean { return !imp.importClause; }   // `import "x";` has no import clause
function hasLeadingComment(sf: any, node: any): boolean { const r = ts.getLeadingCommentRanges(sf.text, node.getFullStart()); return Array.isArray(r) && r.length > 0; }

// count AST identifier references to `name` excluding the declaration node range.
function countIdentifierRefs(sf: any, name: string, declStart: number, declEnd: number): number {
  let count = 0;
  const walk = (node: any) => {
    if (node.kind === ts.SyntaxKind.Identifier && node.text === name) { const s = node.getStart(sf); if (s < declStart || s >= declEnd) count++; }
    node.forEachChild(walk);
  };
  sf.forEachChild(walk);
  return count;
}

// ---------- OPERATIONS ----------
const OPS: Record<string, any> = {
  // A. import-ordering (TRANSFORM) — sort the leading contiguous import block by module specifier; refuse unsafe cases.
  "import-ordering@1": {
    kind: "TRANSFORM", version: 1, description: "sort the leading contiguous block of top-level imports by module specifier (deterministic, idempotent)",
    run: (source: string) => {
      const p = parse(source); if (!p.ok) return { outcome: OUTCOME.REFUSED, reason: `malformed source (${p.syntaxErrors} syntax error(s))` };
      const block = leadingImportBlock(p.sf);
      if (block.length < 2) return { outcome: OUTCOME.GREEN, changed: false, reason: "fewer than 2 leading imports ⇒ nothing to sort" };
      for (const imp of block) {
        if (moduleSpec(imp) === null) return { outcome: OUTCOME.REFUSED, reason: "non-string-literal module specifier ⇒ refuse" };
        if (isSideEffectImport(imp)) return { outcome: OUTCOME.REFUSED, reason: "side-effect import in block (reordering may change behaviour) ⇒ refuse" };
        if (hasLeadingComment(p.sf, imp)) return { outcome: OUTCOME.REFUSED, reason: "import carries a leading comment (moving it would orphan the comment) ⇒ refuse" };
      }
      const specs = block.map(moduleSpec);
      const sortedSpecs = specs.slice().sort();
      if (JSON.stringify(specs) === JSON.stringify(sortedSpecs)) return { outcome: OUTCOME.GREEN, changed: false, reason: "already sorted" };
      // rebuild: statement texts sorted by their specifier; preserve everything outside the block verbatim.
      const texts = block.map((imp: any) => ({ spec: moduleSpec(imp), text: p.sf.text.slice(imp.getStart(p.sf), imp.getEnd()) }));
      texts.sort((a: any, b: any) => (a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0));
      const blockStart = block[0].getStart(p.sf), blockEnd = block[block.length - 1].getEnd();
      const eol = source.slice(blockStart, blockEnd).indexOf("\r\n") >= 0 ? "\r\n" : "\n";   // preserve the block's line ending
      const after = source.slice(0, blockStart) + texts.map((t: any) => t.text).join(eol) + source.slice(blockEnd);
      // AST POSTCONDITIONS: re-parses, same import multiset, now sorted, idempotent.
      const p2 = parse(after); if (!p2.ok) return { outcome: OUTCOME.VALIDATION_FAILED, reason: "post-transform source does not re-parse" };
      const b2 = leadingImportBlock(p2.sf); const specs2 = b2.map(moduleSpec);
      const sameSet = JSON.stringify(specs.slice().sort()) === JSON.stringify(specs2.slice().sort());
      const nowSorted = JSON.stringify(specs2) === JSON.stringify(specs2.slice().sort());
      if (!sameSet || !nowSorted || b2.length !== block.length) return { outcome: OUTCOME.VALIDATION_FAILED, reason: "postcondition: same import set + sorted + same count" };
      return { outcome: OUTCOME.TRANSFORMED, changed: true, before: source, after, patchSummary: { imports: block.length }, reversible: true, postconditions: { reparsed: true, sameImportSet: true, sorted: true } };
    },
    idempotentCheck: (afterSource: string) => { const r = OPS["import-ordering@1"].run(afterSource); return r.outcome === OUTCOME.GREEN; },
  },

  // B. duplicate-import-analysis (DIAGNOSTIC) — report module specifiers imported more than once; never consolidate here.
  "duplicate-import-analysis@1": {
    kind: "DIAGNOSTIC", version: 1, description: "detect duplicate import module specifiers (read-only; consolidation refused due to alias/type/namespace ambiguity)",
    run: (source: string) => {
      const p = parse(source); if (!p.ok) return { outcome: OUTCOME.REFUSED, reason: `malformed source (${p.syntaxErrors} syntax error(s))` };
      const bySpec: Record<string, any[]> = {};
      const walk = (node: any) => { if (node.kind === ts.SyntaxKind.ImportDeclaration) { const s = moduleSpec(node); if (s !== null) { (bySpec[s] = bySpec[s] || []).push(node); } } node.forEachChild(walk); };
      p.sf.forEachChild(walk);
      const findings = Object.keys(bySpec).filter((s: string) => bySpec[s].length > 1).map((s: string) => Object.freeze({ moduleSpecifier: s, count: bySpec[s].length, detail: "imported more than once; consolidation NOT performed (alias/type/namespace/side-effect ambiguity) ⇒ human review" }));
      return { outcome: OUTCOME.DIAGNOSED, findings: Object.freeze(findings), modifiesText: false };
    },
  },

  // C. dead-require-analysis (DIAGNOSTIC) — file-local; flags unreferenced single-binding requires; conservative safeToRemove.
  "dead-require-analysis@1": {
    kind: "DIAGNOSTIC", version: 1, description: "file-local analysis of `const X = require(...)` with zero AST references (read-only; conservative)",
    run: (source: string) => {
      const p = parse(source); if (!p.ok) return { outcome: OUTCOME.REFUSED, reason: `malformed source (${p.syntaxErrors} syntax error(s))` };
      const findings: any[] = [];
      const walk = (node: any) => {
        if (ts.isVariableStatement(node)) {
          for (const d of node.declarationList.declarations) {
            const init = d.initializer;
            const isRequire = init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "require";
            if (!isRequire) continue;
            const mod = init.arguments[0] && ts.isStringLiteral(init.arguments[0]) ? init.arguments[0].text : null;
            if (ts.isIdentifier(d.name)) {
              const name = d.name.text;
              const refs = countIdentifierRefs(p.sf, name, node.getStart(p.sf), node.getEnd());
              findings.push({ binding: name, module: mod, references: refs, safeToRemove: refs === 0, reason: refs === 0 ? "zero file-local AST references" : `${refs} reference(s) ⇒ keep` });
            } else {
              findings.push({ binding: "(destructured)", module: mod, references: null, safeToRemove: false, reason: "destructuring/namespace binding ⇒ ambiguous, NOT safe to remove (analysis only)" });
            }
          }
        }
        node.forEachChild(walk);
      };
      p.sf.forEachChild(walk);
      return { outcome: OUTCOME.DIAGNOSED, findings: Object.freeze(findings.map((f: any) => Object.freeze(f))), modifiesText: false, note: "DIAGNOSTIC only — no require removed; dynamic usage / string-eval references are NOT analysable here, so removal is never auto-applied." };
    },
  },

  // D. contract-test-consistency (DIAGNOSTIC) — compare a declared contract to existing test-case kinds; propose missing.
  "contract-test-consistency@1": {
    kind: "DIAGNOSTIC", version: 1, description: "compare a declared contract (params/outputs/errors/edge cases) to existing test kinds; report gaps (never adapts the contract to the impl)",
    run: (_source: string, args: any) => {
      const c = isObj(args) && isObj(args.contract) ? args.contract : null;
      if (!c || !isStr(c.fnName)) return { outcome: OUTCOME.REFUSED, reason: "a contract { fnName, params?, outputs?, errors?, edgeCases? } is required" };
      const testKinds = new Set((Array.isArray(args.testCases) ? args.testCases : []).filter(isObj).map((t: any) => (isStr(t.kind) ? t.kind : "normal")));
      const expected = ["normal", "boundary", "malformed", "error", "failclosed"];
      const missingKinds = expected.filter((k: string) => !testKinds.has(k));
      const missingDims: string[] = [];
      if (Array.isArray(c.errors) && c.errors.length > 0 && !testKinds.has("error")) missingDims.push("declared errors have no 'error' test");
      if (Array.isArray(c.edgeCases) && c.edgeCases.length > 0 && !testKinds.has("boundary")) missingDims.push("declared edge cases have no 'boundary' test");
      return { outcome: OUTCOME.DIAGNOSED, modifiesText: false, findings: Object.freeze({ fnName: c.fnName, testKindsPresent: Array.from(testKinds), missingKinds: Object.freeze(missingKinds), missingDimensions: Object.freeze(missingDims), proposal: "add the missing test kinds/dimensions; do NOT change the contract to match the implementation's accidental behaviour" }) };
    },
  },
};
const OP_IDS = Object.freeze(Object.keys(OPS));
const CANONICAL_OPS = Object.freeze(OP_IDS);   // all registered ops are canonical (no faulty fixtures in this registry)

/** runAstOp(opId, payload) — closed, deny-by-default. payload: { source, ...opArgs }. Never accepts a code string as opId. */
function runAstOp(opId: any, payload: any): any {
  if (!isStr(opId) || opId.length === 0) return Object.freeze({ ok: false, code: "INVALID_OP_ID" });
  if (/[(){}=;]|=>|function|eval|require\(|import\(/.test(opId)) return Object.freeze({ ok: false, code: "CODE_STRING_REJECTED", detail: "runAstOp accepts a registered opId, never a code string" });
  const op = OPS[opId];
  if (!op) return Object.freeze({ ok: false, code: "UNREGISTERED_OP", detail: `op '${opId}' not in the closed AST registry (deny-by-default)` });
  const pl = isObj(payload) ? payload : {};
  const source = isStr(pl.source) ? pl.source : null;
  if (source === null) return Object.freeze({ ok: false, code: "SOURCE_REQUIRED", detail: "payload.source (string) required" });
  if (source.length > MAX_SOURCE) return Object.freeze({ ok: false, code: "SOURCE_TOO_LARGE", detail: `source exceeds ${MAX_SOURCE} chars` });
  let r: any; try { r = op.run(source, pl); } catch (e: any) { return Object.freeze({ ok: false, code: "OP_THREW", detail: (e && e.message) || String(e) }); }
  // idempotence proof for a successful TRANSFORM
  let idempotent: boolean | null = null;
  if (op.kind === "TRANSFORM" && r.outcome === OUTCOME.TRANSFORMED && isStr(r.after)) idempotent = op.idempotentCheck(r.after);
  return Object.freeze({ ok: true, opId, kind: op.kind, deterministic: true, idempotent, ...r, note: "AST-lite op via ts.createSourceFile (static parse, no code execution); DIAGNOSTIC ops never modify text; TRANSFORM patches are candidates (real-repo write OWNER_GATED)." });
}

const AST_OPERATIONS_CONTRACT = Object.freeze({
  id: "V154-ODG-AST-OPERATIONS",
  purpose: "small, provable AST-lite repository operations (1 transform + 3 diagnostics) via the real TS AST, no code execution",
  dependency: "typescript@5.9.3 (EXISTING repo dependency; static load; parse-only, no execution)",
  reuses: ["V153 closed deny-by-default executor doctrine", "V152 pre/postcondition + idempotence discipline"],
  canonicalOps: CANONICAL_OPS, outcomes: OUTCOME,
  invariants: Object.freeze([
    "REAL AST (ts.createSourceFile, syntactic tier); malformed source ⇒ NATIVE_REFUSED; semantic (type) tasks ⇒ ESCALATED, not faked",
    "closed deny-by-default registry; runAstOp(opId, payload) — never a code string; no eval/new Function/dynamic import of input",
    "DIAGNOSTIC ops never modify text; TRANSFORM ops verify AST postconditions (re-parse + same import set + sorted) + idempotence",
    "refuse on ambiguity: side-effect/aliased/commented/dynamic cases ⇒ NATIVE_REFUSED or analysis-only (never a guessed edit)",
    "candidate patches only; real-repo write OWNER_GATED; no faulty fixtures in this registry; no new primitive",
  ]),
});
module.exports = { runAstOp, OP_IDS, CANONICAL_OPS, OUTCOME, AST_OPERATIONS_CONTRACT };
export {};
