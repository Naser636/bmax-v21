import { isSuccessStatus } from "@/core/http-status";

console.assert(isSuccessStatus(200));
console.assert(isSuccessStatus(201));
console.assert(!isSuccessStatus(404));

console.log("HTTP Status OK");
