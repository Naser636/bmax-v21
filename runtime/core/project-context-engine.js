#!/usr/bin/env node

const fs=require("fs/promises");
const fsSync=require("fs");
const path=require("path");

const ROOT=path.resolve(process.cwd());
const IGNORED=new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "coverage"
]);

class ProjectContextEngine{

    constructor(mission){
        this.mission=mission;
        this.summary={
            files:0,
            directories:0,
            errors:0
        };
    }

    async *scan(dir){

        let entries=[];

        try{
            entries=await fs.readdir(dir,{withFileTypes:true});
        }catch{
            this.summary.errors++;
            return;
        }

        for(const entry of entries){

            if(IGNORED.has(entry.name)) continue;

            const full=path.resolve(dir,entry.name);

            if(!full.startsWith(ROOT)){
                this.summary.errors++;
                continue;
            }

            if(entry.isDirectory()){
                this.summary.directories++;
                yield* this.scan(full);
            }else{
                this.summary.files++;
                yield full;
            }
        }
    }

    async run(){

        console.log("======================================");
        console.log("PROJECT CONTEXT ENGINE v2");
        console.log("======================================");
        console.log("Mission :",this.mission);

        for await(const _ of this.scan(ROOT)){}

        console.log("Files       :",this.summary.files);
        console.log("Directories :",this.summary.directories);
        console.log("Errors      :",this.summary.errors);
        
        const runtimeContext={
            version:1,
            generatedAt:new Date().toISOString(),
            mission:this.mission,
            project:{
                root:ROOT,
                files:this.summary.files,
                directories:this.summary.directories,
                errors:this.summary.errors
            }
        };

        fsSync.writeFileSync(
            "runtime/generated/runtime-context.json",
            JSON.stringify(runtimeContext,null,2)
        );


console.log("Status      : READY");
        console.log("======================================");
    }

}

module.exports=ProjectContextEngine;

if(require.main===module){
    const mission=process.argv[2]||"UNKNOWN";
    new ProjectContextEngine(mission)
        .run()
        .then(()=>process.exit(0))
        .catch(e=>{
            console.error(e);
            process.exit(1);
        });
}
