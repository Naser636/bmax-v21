import { HttpResponse } from "@/core/http-response";

const response: HttpResponse<string> = {
  status: 200,
  headers: {},
  data: "OK",
};

console.assert(response.status === 200);

console.log("HTTP Response OK");
