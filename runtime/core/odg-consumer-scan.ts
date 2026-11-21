#!/usr/bin/env node
"use strict";
/*
 * Shared consumer-reference scan — the ONE place that decides "does source S IMPORT core module M?" for the coverage matrix
 * and the self-improvement cycle (so the two bins can't drift apart). PURE + deterministic.
 *
 * An IMPORT reference is matched; a BARE data-string mention is NOT. Three real forms:
 *   (a) path form          — `/name` or `/name.js`         (require("../core/name.js") / require("../core/name"))
 *   (b) path.join segment  — `"name.js"`                   (require(path.join(root,"core","name.js")))
 *   (c) call-arg indirect  — `(` + "name"                  (r("name") / require("name") — the arg is preceded by `(`)
 * A data array element (`["name", …]` / `, "name"`) is preceded by `[` or `,`, NOT `(`, so (c) does not match it — this
 * avoids counting a registry key / priority list / log string as a consumer (which would inflate CONNECTED and hide orphans),
 * while still catching the `r("name")` indirection that the path-only form missed (which would false-flag a real consumer).
 */

function esc(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** The import-reference regex for ONE core module basename. */
function moduleRefRegex(name: string): RegExp {
  const e = esc(name);
  return new RegExp('(?:/' + e + '(?:\\.js)?["\']|["\']' + e + '\\.js["\']|\\(\\s*["\']' + e + '["\'])');
}

/** True iff source `src` imports core module `name` (any of the three real forms; a bare data-string mention is rejected). */
function referencesModule(src: string, name: string): boolean {
  if (typeof src !== "string" || typeof name !== "string" || !name) return false;
  return moduleRefRegex(name).test(src);
}

/**
 * mergeConsumers(graph, scanned) -> { consumersOf(m), hasConsumer(m), merged }.
 *   graph: change-impact-graph.buildGraph result ({modules, consumers}).
 *   scanned: [{consumer:string, src:string}] — the out-of-core sources (bin/app/script) to attribute as consumers.
 * Merges the core require-graph consumers with the scanned IMPORT references; test consumers are ignored by hasConsumer.
 */
function mergeConsumers(graph: any, scanned: any[]): any {
  const g = graph && typeof graph === "object" ? graph : {};
  const modules: string[] = Array.isArray(g.modules) ? g.modules : [];
  const coreCons: Record<string, string[]> = g.consumers && typeof g.consumers === "object" ? g.consumers : {};
  const merged: Record<string, string[]> = {};
  for (const m of modules) merged[m] = (Array.isArray(coreCons[m]) ? coreCons[m] : []).slice();
  const re = new Map<string, RegExp>();
  for (const m of modules) re.set(m, moduleRefRegex(m));
  for (const s of Array.isArray(scanned) ? scanned : []) {
    if (!s || typeof s.src !== "string" || typeof s.consumer !== "string") continue;
    for (const m of modules) if (re.get(m)!.test(s.src)) merged[m].push(s.consumer);
  }
  for (const m of Object.keys(merged)) merged[m] = Array.from(new Set(merged[m])).sort();
  const isTest = (c: string) => /\.test$/.test(c) || /-test$/.test(c);
  const consumersOf = (m: string) => (merged[m] || []).slice();
  const hasConsumer = (m: string) => (merged[m] || []).some((c) => !isTest(c) && c !== m);
  return { consumersOf, hasConsumer, merged: Object.freeze(merged) };
}

const CONSUMER_SCAN_CONTRACT = Object.freeze({
  id: "ODG-CONSUMER-SCAN",
  purpose: "single shared IMPORT-reference scan for coverage + self-improvement cycle; matches real require forms (path / path.join / call-arg indirection) but NOT bare data-string mentions",
  invariants: Object.freeze([
    "matches path form (/name[.js]), path.join segment (\"name.js\"), and call-arg indirection ((\"name\")) — a real require",
    "rejects a bare data-string mention ([\"name\"] / , \"name\") — avoids inflating CONNECTED / hiding orphans",
    "catches r(\"name\") indirection — avoids false-flagging a real consumer as drift/orphan",
    "PURE/deterministic; the ONE place both bins share so coverage and the cycle can't disagree",
  ]),
});

module.exports = { moduleRefRegex, referencesModule, mergeConsumers, CONSUMER_SCAN_CONTRACT };
export {};
