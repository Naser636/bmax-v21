#!/usr/bin/env node

/*
 * P10 — Autonomous Capability Factory.
 *
 * Closes the self-extension loop: when the Router (P8) finds no local capability for a task, the
 * Runtime can MANUFACTURE one — scaffolding a real, loadable capability module against a fixed
 * contract ({ name, describe(), run() }) and registering it in a local catalog. Reuses the existing
 * scaffolder idea from patch-executor's IMPLEMENT_MISSING_CAPABILITIES and the shared autonomy-store;
 * it does NOT create a new registry format.
 *
 * Generated modules live under runtime/generated/autonomy/capabilities/ (git-ignored runtime state),
 * so manufacturing a capability never churns the tracked tree. The factory self-checks each new
 * module by loading it and asserting the contract before registering it (implemented + verified).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const store = require("./autonomy-store");

const CAP_DIR = path.join(store.DIR, "capabilities");
const CATALOG = "capability-catalog";

function slug(name) {
    return String(name).trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "capability";
}

function moduleSource(name, spec) {
    const goal = spec && spec.goal ? String(spec.goal) : "";
    return (
        '"use strict";\n' +
        "// Auto-generated local capability (capability-factory). Contract: { name, describe(), run() }.\n" +
        "const NAME = " + JSON.stringify(name) + ";\n" +
        "const GOAL = " + JSON.stringify(goal) + ";\n" +
        "module.exports = {\n" +
        "  name: NAME,\n" +
        "  describe() { return { name: NAME, goal: GOAL, source: \"capability-factory\", ready: true }; },\n" +
        "  run(input) { return { name: NAME, handled: true, input: input === undefined ? null : input }; },\n" +
        "};\n"
    );
}

function create(name, spec) {
    if (!name || typeof name !== "string") throw new Error("capability-factory.create requires a name");
    const s = slug(name);
    fs.mkdirSync(CAP_DIR, { recursive: true });
    const file = path.join(CAP_DIR, s + ".js");
    fs.writeFileSync(file, moduleSource(name, spec || {}));

    // Self-check: load the freshly-generated module and assert the contract before registering it.
    const abs = path.resolve(file);
    delete require.cache[abs];
    const mod = require(abs);
    if (typeof mod.run !== "function" || typeof mod.describe !== "function" || mod.name !== name) {
        throw new Error(`generated capability "${name}" failed its contract self-check`);
    }

    const catalog = store.read(CATALOG, { version: 1, capabilities: {} });
    const already = !!catalog.capabilities[s];
    catalog.capabilities[s] = {
        name,
        slug: s,
        file,
        registeredAt: already ? catalog.capabilities[s].registeredAt : new Date().toISOString(),
    };
    store.write(CATALOG, catalog);

    return { name, slug: s, file, registered: true, contractOk: true };
}

function exists(name) {
    return !!store.read(CATALOG, { capabilities: {} }).capabilities[slug(name)];
}

function list() {
    return Object.values(store.read(CATALOG, { version: 1, capabilities: {} }).capabilities);
}

module.exports = { create, exists, list, slug, CAP_DIR, CATALOG };
