#!/usr/bin/env node

const fs=require("fs");
const {spawnSync}=require("child_process");

// Regenerate a cache older than this on load. 24h (CTO-authorized) — compatible with existing usages: the
// pipeline-entry load already regenerates on cache MISS, this only extends it to a STALE cache. Overridable
// via opts.maxAgeMs. Mirrors the .ts twin exactly.
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// PURE staleness predicate (injected clock → deterministic). STALE only when a parseable string generatedAt
// is older than maxAgeMs; ABSENT/invalid date or non-positive policy ⇒ NOT stale (keep cache); non-object ⇒
// stale. Never throws.
function isStale(context, nowMs, maxAgeMs){
    if(!context || typeof context!=="object") return true;
    const ts=context.generatedAt;
    if(typeof ts!=="string") return false;
    const gen=Date.parse(ts);
    if(Number.isNaN(gen)) return false;
    if(typeof nowMs!=="number" || typeof maxAgeMs!=="number" || maxAgeMs<=0) return false;
    return nowMs-gen>maxAgeMs;
}

function loadRuntimeContext(mission="BUILD_RUNTIME",opts={}){

    const file="runtime/generated/runtime-context.json";
    const spawn=typeof opts.spawn==="function"?opts.spawn:spawnSync;
    const nowMs=typeof opts.now==="number"?opts.now:Date.now();
    const maxAgeMs=typeof opts.maxAgeMs==="number"?opts.maxAgeMs:DEFAULT_MAX_AGE_MS;

    // Regenerate on cache MISS, STALE (old generatedAt), or CORRUPT (unparseable). Staleness peek reads the
    // file only when it exists; the final read+validate below is unchanged.
    let regenerate=!fs.existsSync(file);
    let reason=regenerate?"missing":"";
    if(!regenerate){
        try{
            if(isStale(JSON.parse(fs.readFileSync(file,"utf8")),nowMs,maxAgeMs)){ regenerate=true; reason="stale"; }
        }catch{
            regenerate=true; reason="corrupt";
        }
    }

    if(regenerate){
        console.log(`[RuntimeContext] Cache ${reason} -> generating...`);
        const r=spawn(
            "node",
            ["runtime/core/project-context-engine.js",mission],
            {stdio:"inherit"}
        );

        if(r.status!==0){
            throw new Error("Unable to generate RuntimeContext.");
        }
    }

    const context=JSON.parse(
        fs.readFileSync(file,"utf8")
    );

    if(
        !context.project ||
        typeof context.project.files!=="number" ||
        typeof context.project.directories!=="number"
    ){
        throw new Error("Invalid RuntimeContext.");
    }

    return context;
}

module.exports={loadRuntimeContext, isStale};
