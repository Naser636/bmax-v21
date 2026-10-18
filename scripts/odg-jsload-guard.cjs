const Module=require("module"),fs=require("fs");const LOG=process.env.ODG_JSGUARD_LOG,orig=Module._load;
Module._load=function(req,parent,isMain){const res=orig.apply(this,arguments);try{const r=Module._resolveFilename(req,parent,isMain);
if(/\/runtime\/(dist\/)?(core|bin)\/[^/]+\.js$/.test(r)&&LOG){const tag=r.includes("/dist/")?"DIST":"SRC";fs.appendFileSync(LOG,tag+" "+r+"\n");}}catch{}return res;};
