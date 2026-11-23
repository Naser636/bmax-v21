#!/usr/bin/env node
"use strict";
/* V15.8 — the V158 runner's targets pass the REAL governor+quota+transport validation under the committed grant (DRY, no
 * network), and the same chain DENIES them once the grant has expired or for a deferred/refused host. */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const R = require("../core/odg-v16-claude-code-research.js");
const RUN = require("./odg-v158-radar-research-run.ts");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const grant = JSON.parse(fs.readFileSync(path.join(ROOT, RUN.GRANT_PATH), "utf8")).grant;
const inWindow = grant.issuedMs + 3600000;
const p = R.planRun(RUN.TARGETS, grant, inWindow);
check("every V158 target is ALLOWed by governor+quota+transport inside the grant window", p.denied === 0 && p.allowed === RUN.TARGETS.length);
check("targets cover every admitted host", new Set(p.plan.map((x: any) => x.host)).size === grant.allowedDomains.length);
check("after expiry the same targets are all DENIED", R.planRun(RUN.TARGETS, grant, grant.expiresMs + 1).allowed === 0);
const extra = R.planRun([{ url: "https://pypi.org/pypi/requests/json" }, { url: "https://www.w3.org/TR/" }, { url: "https://www.anthropic.com/engineering/" }, { url: "https://code.claude.com/docs/fr/x" }], grant, inWindow);
check("deferred/refused hosts and out-of-prefix paths are DENIED", extra.allowed === 0 && extra.denied === 4);
(async () => {
  const dry = await R.runResearch(RUN.TARGETS, grant, inWindow, false, () => { throw new Error("must not fetch"); });
  check("runResearch(live=false) never calls fetch and reports egress 0", dry.mode === "DRY" && dry.egress === 0);
  const ev = path.join(ROOT, RUN.EVIDENCE_PATH);
  if (fs.existsSync(ev)) { const t = fs.readFileSync(ev, "utf8"); check("committed live-run evidence holds no e-mail addresses and no page bodies", !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(t) && !/"body"/.test(t)); }
  // V15.9 §3: a live run that receives nothing is an explicit failure, never a success; partial is distinguishable.
  const S = RUN.summarize;
  const pl = [{ decision: "ALLOW", url: "https://a.example/x" }, { decision: "ALLOW", url: "https://b.example/y" }];
  const none = S({ denied: 0, plan: pl, results: [{ url: "https://a.example/x", classification: "LIVE_UNAVAILABLE", code: "TIMEOUT" }, { url: "https://b.example/y", classification: "LIVE_UNAVAILABLE", statusCode: 429 }] }, true);
  check("live + zero responses ⇒ LIVE_NO_RESPONSE, exit 3, failures by code (TIMEOUT, HTTP_429)", none.verdict === "LIVE_NO_RESPONSE" && none.exitCode === 3 && none.failuresByCode.TIMEOUT === 1 && none.failuresByCode.HTTP_429 === 1);
  const part = S({ denied: 0, plan: pl, results: [{ url: "https://a.example/x", classification: "LIVE_SOURCE", httpStatus: 200, sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, { url: "https://b.example/y", classification: "LIVE_UNAVAILABLE", code: "REDIRECT_BLOCKED" }] }, true);
  check("live + some unavailable ⇒ LIVE_PARTIAL, exit 4, attributed to the right host", part.verdict === "LIVE_PARTIAL" && part.exitCode === 4 && part.perHost["a.example"].received === 1 && part.perHost["b.example"].unavailable === 1);
  const ok = S({ denied: 0, plan: pl, results: [{ url: "https://a.example/x", classification: "LIVE_SOURCE", httpStatus: 200, sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, { url: "https://b.example/y", classification: "HYPOTHESIS", httpStatus: 200, sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }] }, true);
  check("live + all received ⇒ LIVE_OK exit 0", ok.verdict === "LIVE_OK" && ok.exitCode === 0);
  check("any denial ⇒ DENIED exit 2 (even live)", S({ denied: 1, plan: pl, results: [] }, true).exitCode === 2);
  check("DRY ⇒ DRY_OK exit 0", S({ denied: 0, plan: pl, results: [] }, false).verdict === "DRY_OK");
  check("garbage input ⇒ no throw, live ⇒ LIVE_NO_RESPONSE (never success)", S(null, true).verdict === "LIVE_NO_RESPONSE");
  const weird = S({ denied: 0, plan: pl, results: [{ url: "https://a.example/x", classification: "SOMETHING_NEW" }, { url: "https://b.example/y", classification: "LIVE_SOURCE", httpStatus: 503, sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }] }, true);
  check("unknown classification / non-2xx ⇒ NOT received (fail-closed) ⇒ LIVE_NO_RESPONSE", weird.verdict === "LIVE_NO_RESPONSE" && weird.failuresByCode.CLASS_SOMETHING_NEW === 1 && weird.failuresByCode.HTTP_503 === 1);
  process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
