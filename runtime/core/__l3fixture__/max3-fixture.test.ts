#!/usr/bin/env node
"use strict";
const { max3 } = require("./max3-fixture");
let f = 0; function ok(c:any,l:string){ if(!c){f++;process.stderr.write("FAIL: "+l+"\n");} }
ok(max3(1,2,3)===3,"c largest"); ok(max3(5,2,1)===5,"a largest"); ok(max3(1,9,3)===9,"b largest");
if(f===0) process.stdout.write("ALL PASS — L4 max3 fixture\n"); process.exit(f===0?0:1);
export {};
