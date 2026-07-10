import { HttpError } from "@/core/http-error";

const error = new HttpError(404, "Not Found");

console.assert(error.status === 404);
console.assert(error.message === "Not Found");

console.log("HTTP Error OK");
