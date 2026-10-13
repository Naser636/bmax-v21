/*
 * Project Context Engine — TypeScript canonical (Lot η3-B61). Faithful port of the historical
 * runtime/core/project-context-engine.js; behaviour (recursive scan of process.cwd() ignoring
 * .git/node_modules/dist/build/.next/coverage, counts files/directories/errors, writes
 * runtime/generated/runtime-context.json, the console lines, the CLI entry) is byte-identical EXCEPT the
 * intrinsically volatile `generatedAt` (wall-clock) and the environment-specific `project.root`
 * (= process.cwd() absolute path) — the equivalence bench normalises exactly those two fields. Strict-typed
 * under tsconfig.runtime-leaves-strict.json (no ts-nocheck, no unjustified any). The legacy .js is UNTOUCHED
 * and remains the production default (ODG_STAGE_BASE=runtime/core); this port is reached only via the opt-in
 * compiled base. CommonJS: `module.exports = ProjectContextEngine` is preserved so the raw
 * `require("./project-context-engine")` consumers are unchanged. ROOT stays process.cwd() (already the
 * historical anchor — no __dirname derivation, so it is correct from runtime/core and runtime/dist/core alike).
 */
"use strict";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";

const ROOT: string = path.resolve(process.cwd());
const IGNORED: Set<string> = new Set([".git", "node_modules", "dist", "build", ".next", "coverage"]);

interface ContextSummary {
    files: number;
    directories: number;
    errors: number;
}

class ProjectContextEngine {
    mission: string;
    summary: ContextSummary;

    constructor(mission: string) {
        this.mission = mission;
        this.summary = { files: 0, directories: 0, errors: 0 };
    }

    async *scan(dir: string): AsyncGenerator<string> {
        let entries: fsSync.Dirent[] = [];

        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            this.summary.errors++;
            return;
        }

        for (const entry of entries) {
            if (IGNORED.has(entry.name)) continue;

            const full = path.resolve(dir, entry.name);

            if (!full.startsWith(ROOT)) {
                this.summary.errors++;
                continue;
            }

            if (entry.isDirectory()) {
                this.summary.directories++;
                yield* this.scan(full);
            } else {
                this.summary.files++;
                yield full;
            }
        }
    }

    async run(): Promise<void> {
        console.log("======================================");
        console.log("PROJECT CONTEXT ENGINE v2");
        console.log("======================================");
        console.log("Mission :", this.mission);

        for await (const _file of this.scan(ROOT)) { void _file; }

        console.log("Files       :", this.summary.files);
        console.log("Directories :", this.summary.directories);
        console.log("Errors      :", this.summary.errors);

        const runtimeContext = {
            version: 1,
            generatedAt: new Date().toISOString(),
            mission: this.mission,
            project: {
                root: ROOT,
                files: this.summary.files,
                directories: this.summary.directories,
                errors: this.summary.errors,
            },
        };

        fsSync.writeFileSync(
            "runtime/generated/runtime-context.json",
            JSON.stringify(runtimeContext, null, 2),
        );

        console.log("Status      : READY");
        console.log("======================================");
    }
}

module.exports = ProjectContextEngine;

if (require.main === module) {
    const mission: string = process.argv[2] || "UNKNOWN";
    new ProjectContextEngine(mission)
        .run()
        .then(() => process.exit(0))
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
}
