import { ConnectorInterface } from "@/contracts/connector-interface";
import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";

export function createConnector(
  type: "API" | "WEB"
): ConnectorInterface {
  switch (type) {
    case "API":
      return new ApiConnector();
    case "WEB":
      return new WebConnector();
  }
}
