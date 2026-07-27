#!/usr/bin/env node

/*
 * Autonomy Store — one tiny shared JSON key/value store for the local-first capability stack
 * (Patch Memory, Capability Metrics, Capability Learning, ...). Exists so those capabilities do NOT
 * each re-implement read/write (no duplicated components). Learned state lives under
 * runtime/generated/autonomy/ — git-ignored runtime state, so it never churns the tracked tree.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const DIR = path.join("runtime", "generated", "autonomy");

function file(name) {
    return path.join(DIR, `${name}.json`);
}

function read(name, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file(name), "utf8"));
    } catch {
        return fallback === undefined ? null : fallback;
    }
}

function write(name, obj) {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(file(name), JSON.stringify(obj, null, 2));
    return obj;
}

module.exports = { DIR, file, read, write };
