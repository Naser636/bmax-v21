#!/usr/bin/env node
"use strict";

/*
 * WI-P14-27 — DEVELOPER PLATFORM (P14 Internal Developer Platform / DX). PURE, deterministic, LOCAL and
 * EXECUTABLE (not just docs): a capability CATALOG of golden-path TEMPLATES, deterministic project GENERATION
 * (scaffold → a concrete project spec with files + contract + config + PROVENANCE via P5 build-pipeline), and
 * automatic VALIDATION. Fail-closed on unknown template / missing params / invalid config. Reuses P5
 * (build-pipeline) for provenance. No deploy/VPS. Dual export.
 */

const BP = require("./build-pipeline");
const crypto = require("crypto");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function sha(s: any): string { return crypto.createHash("sha256").update(String(s)).digest("hex"); }

const TEMPLATES = Object.freeze([
  Object.freeze({ id: "service-ts", kind: "backend-service", provides: "http-service", requiredParams: Object.freeze(["name"]), files: Object.freeze(["src/index.ts", "src/index.test.ts", "README.md"]), requiredConfig: Object.freeze(["port"]) }),
  Object.freeze({ id: "library-ts", kind: "library", provides: "library", requiredParams: Object.freeze(["name"]), files: Object.freeze(["src/lib.ts", "src/lib.test.ts", "README.md"]), requiredConfig: Object.freeze([]) }),
  Object.freeze({ id: "cli-ts", kind: "cli", provides: "cli", requiredParams: Object.freeze(["name"]), files: Object.freeze(["bin/cli.ts", "bin/cli.test.ts", "README.md"]), requiredConfig: Object.freeze([]) }),
]);

/** catalog() -> the golden-path templates (ids + metadata). */
function catalog(): any { return Object.freeze(TEMPLATES.map((t: any) => Object.freeze({ id: t.id, kind: t.kind, provides: t.provides, requiredParams: t.requiredParams, requiredConfig: t.requiredConfig }))); }

function roleOf(f: string): string { return /\.test\./.test(f) ? "test" : /README/.test(f) ? "doc" : "source"; }

/** scaffold(templateId, params) -> { ok, project } | { ok:false, code }. Deterministic project generation. */
function scaffold(templateId: any, params: any): any {
  const t = TEMPLATES.find((x: any) => x.id === templateId);
  if (!t) return Object.freeze({ ok: false, code: "UNKNOWN_TEMPLATE", reason: `template ∈ ${TEMPLATES.map((x: any) => x.id).join(",")}` });
  const p = isObj(params) ? params : {};
  const missingParams = t.requiredParams.filter((k: string) => !isStr(p[k]));
  if (missingParams.length) return Object.freeze({ ok: false, code: "MISSING_PARAMS", missing: missingParams.sort() });
  const projectId = p.name;
  const files = t.files.map((f: string) => Object.freeze({ path: `${projectId}/${f}`, role: roleOf(f) }));
  const config = isObj(p.config) ? p.config : {};
  const buildSpec = { project: projectId, sources: files.map((f: any) => ({ path: f.path, sha: sha(f.path + "|" + t.id) })), deps: [], config };
  const art = BP.buildArtifact(buildSpec);
  const project = Object.freeze({
    id: projectId, template: t.id, kind: t.kind, provides: t.provides,
    files: Object.freeze(files),
    contract: Object.freeze({ provides: t.provides, requiredConfig: t.requiredConfig }),
    config, requiredConfig: t.requiredConfig,
    provenance: art.ok ? art.artifact.provenance : null,
    validations: Object.freeze(["contract-present", "files-present", "config-valid", "provenance-sealed"]),
  });
  return Object.freeze({ ok: true, project });
}

/** validateProject(project) -> { ok, violations } — golden-path validation gate. */
function validateProject(project: any): any {
  const p = isObj(project) ? project : {};
  const violations: string[] = [];
  if (!isObj(p.contract)) violations.push("contract missing");
  if (!Array.isArray(p.files) || p.files.length === 0) violations.push("no files generated");
  if (!Array.isArray(p.files) || !p.files.some((f: any) => f.role === "test")) violations.push("no test file (golden path requires tests)");
  if (!p.provenance) violations.push("provenance not sealed");
  const cfg = BP.validateConfig(p.config, p.requiredConfig);
  if (!cfg.ok) violations.push("config missing: " + cfg.missing.join(","));
  return Object.freeze({ ok: violations.length === 0, violations: Object.freeze(violations) });
}

/** generateAndValidate(templateId, params) -> { ok, project, validation } — the full golden path end-to-end. */
function generateAndValidate(templateId: any, params: any): any {
  const s = scaffold(templateId, params);
  if (!s.ok) return Object.freeze({ ok: false, code: s.code, missing: s.missing });
  const v = validateProject(s.project);
  return Object.freeze({ ok: v.ok, project: s.project, validation: v });
}

const DEVELOPER_PLATFORM_CONTRACT = Object.freeze({
  id: "WI-P14-27-DEVELOPER-PLATFORM",
  source: "P14 Internal Developer Platform — golden-path templates + deterministic generation + validation; reuses P5 provenance",
  templates: Object.freeze(TEMPLATES.map((t: any) => t.id)),
  notAuthority: "pure local executable platform (generates project specs); no deploy/VPS; reuses P5 build-pipeline",
  invariants: Object.freeze([
    "pure/deterministic: template + params in → concrete project spec out (same inputs ⇒ same spec/provenance)",
    "fail-closed: unknown template / missing params / invalid config ⇒ refused",
    "every generated project carries provenance (via P5 build-pipeline) and is validated (golden path requires tests)",
    "executable: produces a concrete file set + contract, not just documentation",
  ]),
});

module.exports = { TEMPLATES, DEVELOPER_PLATFORM_CONTRACT, catalog, scaffold, validateProject, generateAndValidate };

if (require.main === module) {
  process.stdout.write(JSON.stringify(DEVELOPER_PLATFORM_CONTRACT, null, 2) + "\n");
}

export {};
