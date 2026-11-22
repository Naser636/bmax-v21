# V15 — freshness check of the precompiled resident-driver tick (sourced). odg_resident_fresh → 0 iff the build and its
# srchash exist AND the recorded hash matches the CURRENT content of the recorded closure inputs. Shared by the normal
# launcher and the confined launcher (single implementation).
odg_resident_fresh() {
  local out="runtime/dist/bin/odg-resident-driver-tick.js" hash="runtime/dist/bin/odg-resident-driver-tick.srchash"
  [ -f "$out" ] && [ -f "$hash" ] || return 1
  HASH="$hash" node -e '
    const fs=require("fs"),cp=require("crypto");
    let rec; try{ rec=JSON.parse(fs.readFileSync(process.env.HASH,"utf8")); }catch{ process.exit(1); }
    const h=cp.createHash("sha256");
    for(const f of rec.inputs){ try{ h.update(f); h.update("\0"); h.update(fs.readFileSync(f)); h.update("\0"); }catch{ process.exit(1);} }
    process.exit(h.digest("hex")===rec.hash?0:1);
  '
}
