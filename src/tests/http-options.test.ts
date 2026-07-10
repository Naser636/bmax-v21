import { HttpOptions } from "@/core/http-options";

const options: HttpOptions = {
  timeout: 5000,
  headers: {
    Accept: "application/json",
  },
};

console.assert(options.timeout === 5000);

console.log("HTTP Options OK");
