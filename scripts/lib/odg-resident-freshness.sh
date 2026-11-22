# V15 — freshness / DRIFT DETECTION of the precompiled resident-driver tick (sourced). odg_resident_fresh → 0 iff:
#   (a) the build and its srchash exist and the recorded hash matches the CURRENT content of the recorded closure inputs;
#   (b) every EMITTED dist .js recorded at build time (`outputs`) still has its recorded sha256 (an older srchash without
#       `outputs` is not fresh);
#   (c) every require() of every recorded output RESOLVES (Node's own resolver, from that file) to a node builtin or to a
#       recorded output — an ADDED file that shadows a closure module (e.g. an extensionless runtime/dist/core/state-transition
#       next to state-transition.js: Node tries the exact name first), a planted dir/index or node_modules is refused; a
#       non-literal require() is refused. Unrelated files of OTHER builds in runtime/dist are allowed (they are not loaded).
# Scope: this is DRIFT DETECTION, NOT tamper-proofing — the srchash is unkeyed and sits next to dist, so any same-user
# UNCONFINED process can rewrite both. Confined code cannot (runtime/dist is read-only in the sandbox).
# Shared by the normal launcher (scripts/odg-resident-driver-run.sh) and the confined launcher (single implementation).
odg_resident_fresh() {
  local out="runtime/dist/bin/odg-resident-driver-tick.js" hash="runtime/dist/bin/odg-resident-driver-tick.srchash"
  [ -f "$out" ] && [ -f "$hash" ] || return 1
  OUT="$out" HASH="$hash" node -e '
    const fs=require("fs"),cp=require("crypto"),path=require("path"),M=require("module");
    let rec; try{ rec=JSON.parse(fs.readFileSync(process.env.HASH,"utf8")); }catch{ process.exit(1); }
    if(!rec||!Array.isArray(rec.inputs)||!rec.outputs||typeof rec.outputs!=="object") process.exit(1);
    const outs=Object.keys(rec.outputs); if(!outs.length||!outs.includes(process.env.OUT)) process.exit(1);
    const h=cp.createHash("sha256");
    for(const f of rec.inputs){ try{ h.update(f); h.update("\0"); h.update(fs.readFileSync(f)); h.update("\0"); }catch{ process.exit(1);} }
    if(h.digest("hex")!==rec.hash) process.exit(1);
    const known=new Set(); for(const f of outs){ try{ known.add(fs.realpathSync(f)); }catch{ process.exit(1); } }
    for(const f of outs){
      let src; try{ src=fs.readFileSync(f); }catch{ process.exit(1); }
      if(cp.createHash("sha256").update(src).digest("hex")!==rec.outputs[f]) process.exit(1);
      const s=src.toString("utf8"), all=(s.match(/\brequire\s*\(/g)||[]).length;
      const lit=[...s.matchAll(/\brequire\s*\(\s*(["\x27])([^"\x27\\]+)\1\s*\)/g)].map((m)=>m[2]);
      if(lit.length!==all) process.exit(1);   // non-literal require ⇒ cannot verify ⇒ not fresh
      const req=M.createRequire(path.resolve(f));
      for(const sp of lit){ if(M.isBuiltin(sp)) continue; let r; try{ r=fs.realpathSync(req.resolve(sp)); }catch{ process.exit(1); } if(!known.has(r)) process.exit(1); }
    }
    process.exit(0);
  '
}
