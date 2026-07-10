import { HttpRateLimiter } from "@/core/http-rate-limiter";

const limiter = new HttpRateLimiter(60);

console.assert(limiter.canExecute());

console.log("HTTP Rate Limiter OK");
