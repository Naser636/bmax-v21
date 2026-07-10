import { validateResponse } from "@/core/http-response-validator";

console.assert(
  validateResponse({
    status: 200,
    headers: {},
    data: {},
  })
);

console.log("HTTP Response Validator OK");
