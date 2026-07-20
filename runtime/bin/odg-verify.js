#!/usr/bin/env node
const fs=require("fs");
const cp=require("child_process");

const verify={
generatedAt:new Date().toISOString(),
build:true,
typescript:true,
gitClean:true
};

try{
cp.execSync("npm run build",{stdio:"ignore"});
}catch{
verify.build=false;
}

try{
cp.execSync("npx tsc --noEmit",{stdio:"ignore"});
}catch{
verify.typescript=false;
}

try{
cp.execSync("git diff --quiet");
}catch{
verify.gitClean=false;
}

fs.writeFileSync(
"runtime/generated/runtime-verify.json",
JSON.stringify(verify,null,2)
);

console.log("VERIFY :",verify);
