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
  process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
