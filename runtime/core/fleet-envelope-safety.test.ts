#!/usr/bin/env node
"use strict";
/* fleet-envelope PATH-SAFETY + DATA-INTEGRITY regression (CTO V122 Phase-4 #1). Proves a request id is always a safe
 * file basename: makeRequestId sanitizes a non-string/path-unsafe mission (no "[object Object]", no traversal), and
 * requestPath/responsePath REFUSE a path-unsafe id (fail-closed), so a request can never be written/read outside the
 * fleet requests/responses dirs. Pure logic checks (no real dispatch). */
const E = require("./fleet-envelope.js");
const path = require("path");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
function throws(fn: () => any): boolean { try { fn(); return false; } catch { return true; } }

function main() {
  // DATA-INTEGRITY: an OBJECT mission must NOT produce "[object Object]-NNN" — it is sanitized to a safe key
  const idObj = E.makeRequestId({});
  check("makeRequestId(object) ⇒ safe id, never '[object Object]'", /^[A-Za-z0-9._-]+-\d{3}$/.test(idObj) && !/\[object Object\]/.test(idObj) && !/[ \[\]]/.test(idObj));
  // a legit string mission still produces <mission>-NNN
  check("makeRequestId('M') ⇒ 'M-NNN'", /^M-\d{3}$/.test(E.makeRequestId("M")));
  // missionKey sanitization
  check("missionKey: object/path-chars/empty ⇒ safe", E.missionKey({}) === "_object_Object_" && E.missionKey("a/b") === "a_b" && E.missionKey("...x") === "_x" && E.missionKey("") === "UNNAMED" && E.missionKey(123) === "123");

  // PATH-SAFETY: safeSegment accepts safe ids, REFUSES separators/traversal/non-strings
  check("safeSegment accepts a safe id", E.safeSegment("ROADMAP_PHASE_4-001") === "ROADMAP_PHASE_4-001");
  check("safeSegment REFUSES traversal/separators/garbage/non-string (fail-closed)",
    throws(() => E.safeSegment("../etc/passwd")) && throws(() => E.safeSegment("a/b")) && throws(() => E.safeSegment("..")) &&
    throws(() => E.safeSegment("[object Object]-1")) && throws(() => E.safeSegment("a b")) && throws(() => E.safeSegment(42)) && throws(() => E.safeSegment("")));

  // requestPath/responsePath stay INSIDE their dirs for safe ids, and THROW on unsafe ids (no traversal)
  const rp = E.requestPath("M-001");
  check("requestPath(safe) stays under REQUESTS_DIR", rp === path.join(E.REQUESTS_DIR, "M-001.json") && !rp.includes(".."));
  check("responsePath(safe) stays under RESPONSES_DIR", E.responsePath("M-001") === path.join(E.RESPONSES_DIR, "M-001.json"));
  check("requestPath/responsePath REFUSE a traversal id (no escape)", throws(() => E.requestPath("../../etc/x")) && throws(() => E.responsePath("..")) && throws(() => E.requestPath("a/b")));

  // buildRequest with an object mission ⇒ its requestId is safe (and its path cannot traverse)
  const br = E.buildRequest({ mission: { id: "X" }, agent: "a" });
  check("buildRequest(object mission) ⇒ safe requestId usable by requestPath (no throw, no traversal)", /^[A-Za-z0-9._-]+-\d{3}$/.test(br.requestId) && !E.requestPath(br.requestId).includes(".."));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — fleet-envelope path-safety + data-integrity (no [object Object] ids; traversal-safe; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
