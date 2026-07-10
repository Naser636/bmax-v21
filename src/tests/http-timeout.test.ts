import { withTimeout } from "@/core/http-timeout";

async function main() {
  const result = await withTimeout(
    Promise.resolve("OK"),
    1000
  );

  console.assert(result === "OK");

  console.log("HTTP Timeout OK");
}

void main();
