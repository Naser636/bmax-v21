#!/usr/bin/env node

const fs = require("fs");
const { execSync } = require("child_process");

const plan = JSON.parse(
  fs.readFileSync("runtime/generated/patch-plan.json","utf8")
);

const report = {
  generatedAt: new Date().toISOString(),
  mission: plan.mission,
  executed: []
};

fs.mkdirSync("runtime/generated",{recursive:true});

for (const patch of plan.patches) {

  console.log("EXECUTE:", patch.action);

  try {

    switch (patch.action) {

      case "PROCESS_TODOS": {
        const out = execSync('grep -RIn "TODO" src runtime || true',{encoding:"utf8"});
        fs.writeFileSync("runtime/generated/todo-report.txt",out);
        report.executed.push({action:patch.action,status:"DONE",output:"runtime/generated/todo-report.txt"});
        break;
      }

      case "PROCESS_FIXMES": {
        const out = execSync('grep -RIn "FIXME" src runtime || true',{encoding:"utf8"});
        fs.writeFileSync("runtime/generated/fixme-report.txt",out);
        report.executed.push({action:patch.action,status:"DONE",output:"runtime/generated/fixme-report.txt"});
        break;
      }

      case "ANALYZE_DEPENDENCIES": {
        const out = execSync('find src runtime -type f \\( -name "*.js" -o -name "*.ts" \\) -print0 | xargs -0 grep -Hn "^import\\|require(" || true',{encoding:"utf8"});
        fs.writeFileSync("runtime/generated/dependency-report.txt",out);
        report.executed.push({action:patch.action,status:"DONE",output:"runtime/generated/dependency-report.txt"});
        break;
      }

      default:
        report.executed.push({action:patch.action,status:"SKIPPED"});
    }

  } catch {

    report.executed.push({
      action: patch.action,
      status: "FAILED"
    });

  }

}

fs.writeFileSync(
  "runtime/generated/patch-execution.json",
  JSON.stringify(report,null,2)
);

console.log("======================================");
console.log("PATCH EXECUTOR v3");
console.log("======================================");
console.log("Executed :",report.executed.length);
console.log("======================================");
