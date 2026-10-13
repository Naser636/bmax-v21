/*
 * Knowledge Engine — TypeScript canonical (Lot η2 migration; strict-typed in η2-T). Faithful port of the
 * historical runtime/core/knowledge-engine.js; behaviour (walks src/ + runtime/, reads execution-plan.json
 * and capability-registry.json, writes runtime/generated/knowledge.json, the console lines) is byte-identical
 * EXCEPT the intrinsically volatile `generatedAt` wall-clock field (present in the historical output too; the
 * equivalence test normalises it). The legacy .js is untouched and remains the production default; reached
 * ONLY via the ODG_STAGE_BASE opt-in. Types verified under tsconfig.runtime-leaves-strict.json — NO ts-nocheck.
 */
import * as fs from "fs";
import * as path from "path";

function walk(dir: string, list: string[] = []): string[] {
  if (!fs.existsSync(dir)) return list;
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    const s = fs.statSync(p);
    if (s.isDirectory()) {
      if (["node_modules", ".git", ".next"].includes(e)) continue;
      walk(p, list);
    } else if (/\.(ts|js)$/.test(e)) {
      list.push(p);
    }
  }
  return list;
}

interface ExecutionPlan {
  mission: string;
}
interface Registry {
  capabilities: unknown;
  missingCapabilities: unknown;
}

const execution = JSON.parse(
  fs.readFileSync("runtime/generated/execution-plan.json", "utf8"),
) as ExecutionPlan;

const registry = JSON.parse(
  fs.readFileSync("runtime/generated/capability-registry.json", "utf8"),
) as Registry;

const files = walk("src").concat(walk("runtime"));

let classes = 0;
let imports = 0;
let exportsCount = 0;
let todos = 0;
let fixmes = 0;
let relativeImports = 0;
let packageImports = 0;

for (const file of files) {
  const txt = fs.readFileSync(file, "utf8");

  classes += (txt.match(/\bclass\b/g) || []).length;
  imports += (txt.match(/\bimport\b/g) || []).length;
  exportsCount += (txt.match(/\bexport\b/g) || []).length;
  todos += (txt.match(/TODO/g) || []).length;
  fixmes += (txt.match(/FIXME/g) || []).length;

  const matches = txt.match(/from\s+['"]([^'"]+)['"]/g) || [];

  for (const m of matches) {
    if (m.includes("./") || m.includes("../")) {
      relativeImports++;
    } else {
      packageImports++;
    }
  }
}

const knowledge = {
  generatedAt: new Date().toISOString(),
  mission: execution.mission,
  status: "READY",
  project: {
    sourceFiles: files.length,
    classes,
    imports,
    exports: exportsCount,
    todos,
    fixmes,
    relativeImports,
    packageImports,
  },
  knownCapabilities: registry.capabilities,
  missingCapabilities: registry.missingCapabilities,
};

fs.writeFileSync(
  "runtime/generated/knowledge.json",
  JSON.stringify(knowledge, null, 2),
);

console.log("======================================");
console.log("KNOWLEDGE ENGINE v5");
console.log("======================================");
console.log("Files      :", files.length);
console.log("Classes    :", classes);
console.log("Imports    :", imports);
console.log("RelImports :", relativeImports);
console.log("PkgImports :", packageImports);
console.log("TODO       :", todos);
console.log("FIXME      :", fixmes);
console.log("======================================");
