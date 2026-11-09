#!/usr/bin/env node
"use strict";
const { fact } = require("./fact-fixture");
let f = 0; function ok(c:any,l:string){ if(!c){f++;process.stderr.write("FAIL: "+l+"\n");} }
ok(fact(0)===1,"0!"); ok(fact(1)===1,"1!"); ok(fact(5)===120,"5!");
if(f===0) process.stdout.write("ALL PASS — L4 fact fixture\n"); process.exit(f===0?0:1);
export {};
