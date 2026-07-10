import { ApiConnector } from "@/core/api-connector";
import {
  cacheConnector,
  getCachedConnector,
} from "@/core/connector-cache";

cacheConnector("api", new ApiConnector());

console.assert(getCachedConnector("api") !== undefined);

console.log("Connector Cache OK");
