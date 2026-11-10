#!/usr/bin/env node
"use strict";

/* V12.4 / CTO V71 — self-replication-guard test. deny-by-default; self-copy DENY; self-authorized clone DENY; unbounded
 * depth/count DENY; no external auth DENY; a bounded externally-authorized non-self spawn ALLOW; malformed ⇒ DENY. */

const G = require("./self-replication-guard.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const policy = { maxDepth: 3, maxSpawnCount: 8 };
const extAuth = { approved: true, by: "odg-controller" };

check("bounded + externally-authorized + non-self ⇒ ALLOW", G.assessSpawn({ spawnerId: "A", childId: "B", currentDepth: 1, currentSpawnCount: 2, authorization: extAuth }, policy).decision === "ALLOW");
check("self-copy (child==spawner) ⇒ DENY + selfReplication flagged", (() => { const r = G.assessSpawn({ spawnerId: "A", childId: "A", currentDepth: 0, currentSpawnCount: 0, authorization: extAuth }, policy); return r.decision === "DENY" && r.selfReplication === true; })());
check("self-authorized clone (authorizer==spawner) ⇒ DENY", G.assessSpawn({ spawnerId: "A", childId: "A", authorization: { approved: true, by: "A" } }, policy).decision === "DENY");
check("depth >= maxDepth ⇒ DENY (bounded recursion)", G.assessSpawn({ spawnerId: "A", childId: "B", currentDepth: 3, currentSpawnCount: 0, authorization: extAuth }, policy).decision === "DENY");
check("count >= maxSpawnCount ⇒ DENY (spawn budget)", G.assessSpawn({ spawnerId: "A", childId: "B", currentDepth: 0, currentSpawnCount: 8, authorization: extAuth }, policy).decision === "DENY");
check("no external authorization ⇒ DENY (deny-by-default)", G.assessSpawn({ spawnerId: "A", childId: "B", currentDepth: 0, currentSpawnCount: 0 }, policy).decision === "DENY");
check("self-authorized (by==spawner) non-copy ⇒ DENY (not external)", G.assessSpawn({ spawnerId: "A", childId: "B", authorization: { approved: true, by: "A" } }, policy).decision === "DENY");
check("malformed ⇒ DENY (fail-closed)", G.assessSpawn(null).decision === "DENY" && G.assessSpawn({ spawnerId: "A" }).decision === "DENY");
check("deterministic", JSON.stringify(G.assessSpawn({ spawnerId: "A", childId: "B", authorization: extAuth }, policy)) === JSON.stringify(G.assessSpawn({ spawnerId: "A", childId: "B", authorization: extAuth }, policy)));

process.stdout.write(`\n${failures === 0 ? "ALL PASS — self-replication guard (deny-by-default, self-copy/clone/unbounded/no-auth DENY)" : failures + " FAIL"}\n`);
process.exit(failures === 0 ? 0 : 1);
export {};
