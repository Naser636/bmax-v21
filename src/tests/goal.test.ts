import { initializeGoal } from "@/core/goal-service";

const goal = initializeGoal();

console.assert(goal.name.length > 0);
console.assert(goal.description.length > 0);

console.log("Goal test OK");
