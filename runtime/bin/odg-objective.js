#!/usr/bin/env node
"use strict";

/*
 * `odg objective "<natural-language objective>"` — thin CLI over the Natural-Language Objective
 * Gateway (runtime/core/nl-objective-gateway.js). DRY-RUN only: it compiles the objective into the
 * governed projection (intent → objective → requirements → dependencies → capabilities → contract →
 * authority → policy → risk → workgraph → planned actions → result) and prints it as JSON.
 *
 * It executes nothing, calls no provider, makes no network call and writes nothing. Exit code 0 only
 * when the dry-run is clean (status READY_DRY_RUN); otherwise 2 (ambiguous / blocked / denied /
 * escalate) so CI and callers can gate on a clean compilation.
 */

const path = require("path");
const gateway = require(path.join(__dirname, "..", "core", "nl-objective-gateway.js"));

const raw = process.argv.slice(2).join(" ");
if (!raw.trim()) {
    process.stderr.write('Usage: odg objective "<natural-language objective>"\n');
    process.exit(2);
}

const result = gateway.compile(raw);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
process.exit(result.status === "READY_DRY_RUN" ? 0 : 2);
