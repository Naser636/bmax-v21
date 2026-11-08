#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./developer-platform");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-P14-27 — DEVELOPER PLATFORM");

check(P.catalog().length === 3 && P.catalog().some((t: any) => t.id === "service-ts"), "catalog: 3 golden-path templates");
{
  const r = P.scaffold("service-ts", { name: "billing", config: { port: 8080 } });
  check(r.ok && r.project.id === "billing" && r.project.files.some((f: any) => f.role === "test") && r.project.provenance !== null, "scaffold service-ts ⇒ project with test file + sealed provenance");
}
check(P.scaffold("nope", { name: "x" }).code === "UNKNOWN_TEMPLATE", "unknown template ⇒ UNKNOWN_TEMPLATE");
check(P.scaffold("service-ts", {}).code === "MISSING_PARAMS", "missing name ⇒ MISSING_PARAMS");
// golden path validation: service-ts requires config.port
check(P.generateAndValidate("service-ts", { name: "svc" }).ok === false, "service-ts without config.port ⇒ validation fails (fail-closed)");
check(P.generateAndValidate("service-ts", { name: "svc", config: { port: 80 } }).ok === true, "service-ts with port ⇒ golden path OK");
check(P.generateAndValidate("library-ts", { name: "lib" }).ok === true, "library-ts (no required config) ⇒ OK");
check(JSON.stringify(P.scaffold("cli-ts", { name: "tool" })) === JSON.stringify(P.scaffold("cli-ts", { name: "tool" })), "deterministic scaffold");
console.log(failures === 0 ? "ALL PASS — WI-P14-27 DEVELOPER PLATFORM" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
