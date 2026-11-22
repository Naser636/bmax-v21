# V15 — freshness check of the precompiled resident-driver tick (sourced). odg_resident_fresh → 0 iff the build and its
# srchash exist AND the recorded hash matches the CURRENT content of the recorded closure inputs AND (V15 hardening) every
# EMITTED dist .js the tick loads still has the sha256 recorded at build time (a tampered / replaced dist file ⇒ not fresh
# ⇒ rebuild; a srchash without an `outputs` record — older build — is not fresh either). Shared by the normal launcher
# (scripts/odg-resident-driver-run.sh) and the confined launcher (single implementation).
odg_resident_fresh() {
  local out="runtime/dist/bin/odg-resident-driver-tick.js" hash="runtime/dist/bin/odg-resident-driver-tick.srchash"
  [ -f "$out" ] && [ -f "$hash" ] || return 1
  OUT="$out" HASH="$hash" node -e '
    const fs=require("fs"),cp=require("crypto");
    let rec; try{ rec=JSON.parse(fs.readFileSync(process.env.HASH,"utf8")); }catch{ process.exit(1); }
    if(!rec||!Array.isArray(rec.inputs)||!rec.outputs||typeof rec.outputs!=="object") process.exit(1);
    const outs=Object.keys(rec.outputs); if(!outs.length||!outs.includes(process.env.OUT)) process.exit(1);
    const h=cp.createHash("sha256");
    for(const f of rec.inputs){ try{ h.update(f); h.update("\0"); h.update(fs.readFileSync(f)); h.update("\0"); }catch{ process.exit(1);} }
    if(h.digest("hex")!==rec.hash) process.exit(1);
    for(const f of outs){ let d; try{ d=cp.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); }catch{ process.exit(1); } if(d!==rec.outputs[f]) process.exit(1); }
    process.exit(0);
  '
}
