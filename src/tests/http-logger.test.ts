import { HttpLogger } from "@/core/http-logger";

const logger = new HttpLogger();

logger.info("Request started");
logger.error("Request failed");

console.assert(logger instanceof HttpLogger);

console.log("HTTP Logger OK");
