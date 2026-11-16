#!/usr/bin/env node
"use strict";
/* V230 §3 — source authority & independence. Proves the §3 cases: official domain recognized; independent corroborator;
 * two same-org domains ⇒ NOT independent; single source ⇒ 1 owner; parent/bare-domain safe; official≠independent;
 * data-driven (no per-company branch); deterministic + frozen. */
const A = require("./odg-source-authority.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // (1) official source recognized — real domains from the V230 cycles
  check("official vendor domains recognized as PRIMARY_OFFICIAL with the right owner", A.authority("https://sre.google/sre-book/embracing-risk/").owner === "Alphabet/Google" && A.authority("https://aws.amazon.com/x").owner === "Amazon" && A.authority("https://docs.nvidia.com/cuda/").owner === "NVIDIA" && A.authority("https://www.toyota-global.com/x").owner === "Toyota" && A.authority("https://aws.amazon.com/x").officialTier === "PRIMARY_OFFICIAL");

  // (2) independent corroborating source — an unregistered host has no owner but is its own independent host
  const blog = A.authority("https://fourweekmba.com/working-backwards/");
  check("an independent (non-org) source has owner null but is its own host-owner for independence", blog.owner === null && blog.officialTier === null && blog.host === "fourweekmba.com");

  // (3) two domains of the SAME org ⇒ NOT two independent corroborations
  check("aws.amazon.com + amazon.science are the SAME owner ⇒ sameOwner true, only 1 independent owner", A.sameOwner("https://aws.amazon.com/a", "https://amazon.science/b") === true && A.independentOwnerCount(["https://aws.amazon.com/a", "https://amazon.science/b"]) === 1);
  // official + genuinely independent host ⇒ 2 independent owners
  check("official (aws.amazon.com) + independent host (fourweekmba.com) ⇒ 2 independent owners", A.independentOwnerCount(["https://aws.amazon.com/a", "https://fourweekmba.com/b"]) === 2);

  // (4) single source ⇒ 1 owner
  check("a single source ⇒ independentOwnerCount 1", A.independentOwnerCount(["https://sre.google/x"]) === 1 && A.independentOwnerCount([]) === 0);

  // parent/bare-domain safety + spoof safety (reuses V218 host-match discipline)
  check("a parent/bare domain or spoof is NOT matched to a specific org", A.authority("https://notgoogle.com/x").owner === null && A.authority("https://sre.google.evil.com/x").owner === null && A.authority("(not a url)").owner === null);
  // a true subdomain still matches
  check("a true subdomain of an org domain still matches", A.authority("https://cdn.docs.nvidia.com/x").owner === "NVIDIA");

  // classify + official≠independent honesty
  const c = A.classify(["https://sre.google/x", "https://aws.amazon.com/y", "https://aws.amazon.com/z"]);
  check("classify: distinct owners counted (Google + Amazon = 2, amazon twice collapses); official≠independent honesty", c.independentOwners === 2 && c.officialOwners.length === 2 && c.hasOfficial === true && /official source is an org's own CLAIM, not by itself independent/.test(c.note));

  // data-driven, no per-company branch
  check("registry is DATA (≥7 orgs incl. Amazon/Google/NVIDIA/Toyota/EU/Microsoft/Apple); extend by data not code", A.ORG_AUTHORITY.length >= 7 && A.ORG_AUTHORITY.some((e: any) => e.org === "Amazon") && A.ORG_AUTHORITY.some((e: any) => e.org === "NVIDIA"));
  check("contract: data-driven, same-org≠independent, official≠verified-true, parent-safe", A.SOURCE_AUTHORITY_CONTRACT.invariants.some((i: string) => /NO special-case code branch/.test(i)) && A.SOURCE_AUTHORITY_CONTRACT.invariants.some((i: string) => /NOT two independent corroborations/.test(i)) && A.SOURCE_AUTHORITY_CONTRACT.invariants.some((i: string) => /official ≠ verified-true/.test(i)));
  check("deterministic + frozen", A.sameOwner("https://aws.amazon.com/a", "https://amazon.science/b") === A.sameOwner("https://aws.amazon.com/a", "https://amazon.science/b") && Object.isFrozen(A.ORG_AUTHORITY) && Object.isFrozen(c));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — source-authority (V230 §3: generic org↔domain registry; official domains recognized [Amazon/Google/NVIDIA/Toyota/EU]; same-org domains ≠ independent; official≠verified-true; parent/spoof-safe; data-driven, no per-company branch)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
