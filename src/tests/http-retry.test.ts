import { withRetry } from "@/core/http-retry";

async function main() {
  let attempts = 0;

  const result = await withRetry(async () => {
    attempts++;
    return "OK";
  });

  console.assert(result === "OK");
  console.assert(attempts === 1);

  console.log("HTTP Retry OK");
}

void main();
