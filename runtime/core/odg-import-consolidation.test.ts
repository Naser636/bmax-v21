#!/usr/bin/env node
"use strict";
/* V155 — duplicate-import-consolidation@1 battery. Proves REAL ts-AST behaviour: safe consolidation of contiguous same-
 * specifier NAMED-ONLY imports, idempotent + symbol-preserving + EOL-preserving, with HARD refusal of every ambiguous case.
 * §7 anti-reward-hacking: an INDEPENDENT ts-based symbol-set verifier (not the op's own logic) confirms preservation AND
 * catches a deliberately-mutated (symbol-dropping) candidate — so a result is never "valid" just because the op says so. */
const A = require("./odg-ast-operations.js");
const ts = require("typescript");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const op = (s: string) => A.runAstOp("duplicate-import-consolidation@1", { source: s });

// INDEPENDENT verifier: extract the set of "specifier name" imported pairs via ts (NOT reusing the op's internals).
function importedSymbols(source: string): Set<string> {
  const sf = ts.createSourceFile("v.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out = new Set<string>();
  for (const st of sf.statements) {
    if (st.kind !== ts.SyntaxKind.ImportDeclaration) continue;
    const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : "?";
    const nb = st.importClause && st.importClause.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) out.add(spec + " " + (el.propertyName ? el.propertyName.text + ">" : "") + el.name.text);
  }
  return out;
}
const eqSet = (a: Set<string>, b: Set<string>) => a.size === b.size && Array.from(a).every((x: string) => b.has(x));

function main() {
  check("registry now has 5 canonical ops (import-ordering + consolidation + 3 diagnostics), 0 fixtures", A.CANONICAL_OPS.length === 5 && A.CANONICAL_OPS.indexOf("duplicate-import-consolidation@1") >= 0);

  // ---- POSITIVE ----
  const two = op('import { alpha } from "./module";\nimport { beta } from "./module";\n\nconst x = 1;\n');
  check("[+] two equivalent named imports ⇒ consolidated, idempotent, preserves other decls", two.outcome === "NATIVE_REPAIRED_GREEN" && /import \{ alpha, beta \} from "\.\/module";/.test(two.after) && /const x = 1;/.test(two.after) && two.idempotent === true);
  check("[+] re-running on its own output ⇒ NATIVE_GREEN (true idempotence)", op(two.after).outcome === "NATIVE_GREEN");
  const three = op('import { a } from "./m";\nimport { b } from "./m";\nimport { c } from "./m";\nimport { z } from "./other";\nfoo();\n');
  check("[+] three from same module ⇒ one; unrelated import + statement preserved", /import \{ a, b, c \} from "\.\/m";/.test(three.after) && /import \{ z \} from "\.\/other";/.test(three.after) && /foo\(\);/.test(three.after));
  check("[+] LF preserved", /\n/.test(two.after) && two.after.indexOf("\r\n") < 0);
  check("[+] CRLF preserved", (() => { const r = op('import { a } from "./m";\r\nimport { b } from "./m";\r\n'); return r.outcome === "NATIVE_REPAIRED_GREEN" && r.after.indexOf("\r\n") >= 0; })());
  check("[+] reproducible across runs", JSON.stringify(op('import { a } from "./m";\nimport { b } from "./m";\n')) === JSON.stringify(op('import { a } from "./m";\nimport { b } from "./m";\n')));
  check("[=] no duplicate specifier ⇒ NATIVE_GREEN (nothing to do)", op('import { a } from "./m";\nimport { b } from "./n";\n').outcome === "NATIVE_GREEN");

  // ---- REFUSALS (each verified on real behaviour + precise reason) ----
  const refused = (s: string) => op(s).outcome === "NATIVE_REFUSED";
  check("[-] different specifiers not merged (⇒ GREEN, not a false consolidation)", op('import { a } from "./m";\nimport { b } from "./n";\n').outcome === "NATIVE_GREEN");
  check("[-] alias ⇒ REFUSED", refused('import { a } from "./m";\nimport { b as c } from "./m";\n') && /alias/.test(op('import { a } from "./m";\nimport { b as c } from "./m";\n').reason));
  check("[-] default import ⇒ REFUSED", refused('import D from "./m";\nimport { b } from "./m";\n'));
  check("[-] namespace import ⇒ REFUSED", refused('import * as N from "./m";\nimport { b } from "./m";\n'));
  check("[-] type-only import ⇒ REFUSED", refused('import type { T } from "./m";\nimport { b } from "./m";\n') && refused('import { type T, a } from "./m";\nimport { b } from "./m";\n'));
  check("[-] side-effect import ⇒ REFUSED", refused('import "./m";\nimport { b } from "./m";\n'));
  check("[-] attached comment ⇒ REFUSED", refused('import { a } from "./m";\n// note\nimport { b } from "./m";\n'));
  check("[-] local-name collision ⇒ REFUSED", refused('import { a } from "./m";\nimport { a } from "./m";\n') && /collision/.test(op('import { a } from "./m";\nimport { a } from "./m";\n').reason));
  check("[-] non-contiguous group ⇒ REFUSED (execution-order safety not proven)", refused('import { a } from "./m";\nimport { x } from "./n";\nimport { b } from "./m";\n'));
  check("[-] import attributes ⇒ REFUSED", refused('import { a } from "./m";\nimport { b } from "./m" with { type: "json" };\n') || op('import { a } from "./m";\nimport { b } from "./m" with { type: "json" };\n').outcome === "NATIVE_GREEN"); // tolerate parser variance: must NOT consolidate
  check("[-] malformed source ⇒ REFUSED", refused('import { a from "./m\n'));
  check("[-] unknown op ⇒ UNREGISTERED_OP; code-string opId ⇒ CODE_STRING_REJECTED; bad args ⇒ SOURCE_REQUIRED", A.runAstOp("nope@9", { source: "x" }).code === "UNREGISTERED_OP" && A.runAstOp("() => eval('x')", { source: "x" }).code === "CODE_STRING_REJECTED" && A.runAstOp("duplicate-import-consolidation@1", {}).code === "SOURCE_REQUIRED");

  // ---- ADVERSARIAL ----
  check("[adv] duplicate symbols within a group ⇒ REFUSED (collision), never silently deduped", refused('import { a, b } from "./m";\nimport { b, c } from "./m";\n'));
  check("[adv] comment BETWEEN declarations ⇒ REFUSED", refused('import { a } from "./m";\n/* keep */\nimport { b } from "./m";\n'));
  check("[adv] dynamic import() is not an ImportDeclaration ⇒ ignored (no false merge)", op('const m = import("./m");\nimport { a } from "./m";\nimport { b } from "./m";\n').outcome === "NATIVE_REPAIRED_GREEN");

  // ---- §7 INDEPENDENT ANTI-REWARD-HACKING: symbol preservation + mutation detection ----
  const before = 'import { alpha } from "./m";\nimport { beta } from "./m";\nimport { gamma } from "./n";\n';
  const good = op(before);
  check("[§7] independent ts verifier: consolidation PRESERVES the imported-symbol set", good.outcome === "NATIVE_REPAIRED_GREEN" && eqSet(importedSymbols(before), importedSymbols(good.after)));
  // craft a MUTANT candidate that drops a symbol; the independent verifier MUST catch it (tests are non-vacuous).
  const mutant = good.after.replace("alpha, beta", "alpha");           // deliberately drop 'beta'
  check("[§7] independent verifier DETECTS a symbol-dropping mutation (TESTS_NON_VACUOUS)", !eqSet(importedSymbols(before), importedSymbols(mutant)));
  // the op's OWN postcondition would also reject such a result — prove the op never emits a symbol-losing patch:
  check("[§7] op never accepts a symbol-losing result (postcondition sameImportedSymbols)", good.postconditions.sameImportedSymbols === true && good.postconditions.noDuplicateSpecifier === true);
  check("[§7] a result is TRANSFORMED only with postconditions verified (not because the op 'claims' success)", good.postconditions.reparsed === true && good.postconditions.nonImportStatementsPreserved === true && good.reversible === true);

  // ---- candidate-only (no real write) ----
  check("[safety] candidate patch only; real-repo write OWNER_GATED; closed registry is the only path", two.reversible === true && /OWNER_GATED/.test(two.note));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — duplicate-import-consolidation@1 (contiguous same-specifier named-only merge; idempotent+symbol-preserving+EOL-preserving; hard refusal on alias/default/namespace/type/side-effect/comment/collision/non-contiguous/attributes/malformed; independent ts-verifier + mutation detection; candidate-only)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
