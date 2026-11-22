#!/usr/bin/env node
"use strict";
/* V372 step 2 — the claim↔quote binding must reject the inspector's attacks (trivial quote, unrelated claim, cross-source
 * trivial support, quote not on page, injected text) and accept the genuine recorded cases. */
const S = require("./odg-radar-gate-chain-step2-run.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const T = "https://global.toyota/x", E = "https://www.toyota-europe.com/y", N = "https://www.nist.gov/z";
const byUrl: any = { [T]: { quotes: ["Jidoka in the TPS is \"automation with a human touch,\" where human wisdom is added"] }, [E]: { quotes: ["automation with a human touch"] }, [N]: { quotes: ["released on January 26, 2023", "is intended for voluntary use"] } };
const none = new Set<string>();
const good = "Toyota describes its automation principle as automation with a human touch";
check("genuine: verbatim, substantive quote contained in the claim ⇒ supports", S.supports({ url: E, quote: "automation with a human touch" }, good, byUrl, none) && S.covered(good, ["automation with a human touch"]));
check("ATTACK trivial quote 'the' ⇒ rejected", !S.supports({ url: T, quote: "the" }, "Just-in-time is Toyota's way of producing 10x more", byUrl, none));
check("ATTACK claim changed, real quote kept ('Toyota guarantees zero defects') ⇒ rejected", !S.supports({ url: E, quote: "automation with a human touch" }, "Toyota guarantees zero defects", byUrl, none));
check("ATTACK claim that CONTAINS the quote but adds unsupported content ⇒ not covered", !S.covered("Toyota guarantees zero defects and automation with a human touch", ["automation with a human touch"]));
check("ATTACK cross-source trivial support (NIST 't'/'the' for an SRE claim) ⇒ rejected", !S.supports({ url: N, quote: "the" }, "An error budget is 1 minus the SLO of the service", byUrl, none));
check("ATTACK quote not present on that page ⇒ rejected", !S.supports({ url: E, quote: "defects are never passed on to the next" }, "defects are never passed on to the next process", byUrl, none));
check("quarantined source ⇒ rejected", !S.supports({ url: E, quote: "automation with a human touch" }, good, byUrl, new Set([E])));
const nist = "The NIST AI RMF page states the framework was released on January 26, 2023 and is intended for voluntary use";
check("multi-quote claim covered by the UNION of one source's quotes", S.supports({ url: N, quote: "released on January 26, 2023" }, nist, byUrl, none) && S.covered(nist, ["released on January 26, 2023", "is intended for voluntary use"]));
check("…but one quote alone does not cover it", !S.covered(nist, ["released on January 26, 2023"]));
process.stdout.write("\n" + (f === 0 ? "ALL PASS — step-2 claim↔quote binding" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
